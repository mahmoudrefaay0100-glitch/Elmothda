
export default async function handler(req, res) {
    // منع تخزين بيانات المتجر مؤقتًا
    res.setHeader(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate'
    );
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (req.method !== 'GET' && req.method !== 'PUT') {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed'
        });
    }

    try {
        const SUPABASE_SERVICE_ROLE_KEY =
            process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!SUPABASE_SERVICE_ROLE_KEY) {
            return res.status(500).json({
                success: false,
                error: 'SUPABASE_SERVICE_ROLE_KEY is missing'
            });
        }

        const SUPABASE_BASE_URL =
            'https://kxtiqtcxkcwdvljiadfn.supabase.co';

        // =====================================================
        // SUPABASE REQUEST
        // =====================================================

        async function supabaseRequest(
            table,
            method = 'GET',
            query = '',
            body = null
        ) {
            const url =
                `${SUPABASE_BASE_URL}/rest/v1/${table}` +
                (query ? `?${query}` : '');

            const headers = {
                apikey: SUPABASE_SERVICE_ROLE_KEY,
                Authorization:
                    `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Prefer: 'return=representation'
            };

            const response = await fetch(url, {
                method,
                headers,
                body:
                    body !== null
                        ? JSON.stringify(body)
                        : undefined,
                cache: 'no-store'
            });

            const responseText = await response.text();

            let data;

            try {
                data = responseText
                    ? JSON.parse(responseText)
                    : [];
            } catch {
                throw new Error(
                    'Supabase returned a non-JSON response: ' +
                    responseText.substring(0, 300)
                );
            }

            if (!response.ok) {
                throw new Error(
                    data?.message ||
                    data?.error_description ||
                    data?.error ||
                    `Supabase error ${response.status}`
                );
            }

            return data;
        }

        // =====================================================
        // SAFE NUMBER
        // =====================================================

        function safeNumber(value, fallback = 0) {
            if (
                value === null ||
                value === undefined ||
                value === ''
            ) {
                return fallback;
            }

            const number = Number(value);

            return Number.isFinite(number) && number >= 0
                ? number
                : fallback;
        }

        // =====================================================
        // PUT: SAVE STORE SETTINGS
        // =====================================================

        if (req.method === 'PUT') {
            const body = req.body || {};

            const hasDepositPercent =
                body.depositPercent !== undefined;

            const hasSunbadgeOrderFee =
                body.sunbadgeOrderFee !== undefined;

            const hasSunbrellaRate =
                body.sunbrellaRate !== undefined;

            if (
                !hasDepositPercent &&
                !hasSunbadgeOrderFee &&
                !hasSunbrellaRate
            ) {
                return res.status(400).json({
                    success: false,
                    error: 'لم يتم إرسال أي إعداد للحفظ'
                });
            }

            const updateData = {};

            // نسبة العربون
            if (hasDepositPercent) {
                const depositPercent =
                    Number(body.depositPercent);

                if (
                    !Number.isFinite(depositPercent) ||
                    depositPercent < 0 ||
                    depositPercent > 100
                ) {
                    return res.status(400).json({
                        success: false,
                        error:
                            'نسبة العربون يجب أن تكون بين 0% و100%'
                    });
                }

                updateData.deposit_percent =
                    depositPercent;
            }

            // رسوم صن بيدج العامة
            // منفصلة عن رسوم صن بيدج الخاصة بكل منتج.
            if (hasSunbadgeOrderFee) {
                const sunbadgeOrderFee =
                    Number(body.sunbadgeOrderFee);

                if (
                    !Number.isFinite(sunbadgeOrderFee) ||
                    sunbadgeOrderFee < 0 ||
                    sunbadgeOrderFee > 100000
                ) {
                    return res.status(400).json({
                        success: false,
                        error:
                            'رسوم صن بيدج يجب أن تكون بين 0 و100000 جنيه'
                    });
                }

                updateData.sunbadge_order_fee =
                    sunbadgeOrderFee;
            }

            // سعر صن بريلا
            if (hasSunbrellaRate) {
                const sunbrellaRate =
                    Number(body.sunbrellaRate);

                if (
                    !Number.isFinite(sunbrellaRate) ||
                    sunbrellaRate < 0 ||
                    sunbrellaRate > 100000
                ) {
                    return res.status(400).json({
                        success: false,
                        error:
                            'سعر صن بريلا يجب أن يكون بين 0 و100000 جنيه'
                    });
                }

                updateData.sunbrella_rate =
                    sunbrellaRate;
            }

            // جلب سجل الإعدادات الحالي
            const existingSettings =
                await supabaseRequest(
                    'site_settings',
                    'GET',
                    'select=*&limit=1'
                );

            let savedSettings;

            if (
                Array.isArray(existingSettings) &&
                existingSettings.length > 0
            ) {
                const existingId =
                    existingSettings[0].id;

                savedSettings =
                    await supabaseRequest(
                        'site_settings',
                        'PATCH',
                        `id=eq.${encodeURIComponent(existingId)}`,
                        updateData
                    );
            } else {
                savedSettings =
                    await supabaseRequest(
                        'site_settings',
                        'POST',
                        '',
                        {
                            deposit_percent: 30,
                            sunbadge_order_fee: 0,
                            sunbrella_rate: 200,
                            ...updateData
                        }
                    );
            }

            const saved =
                Array.isArray(savedSettings)
                    ? savedSettings[0] || {}
                    : {};

            return res.status(200).json({
                success: true,
                message: 'تم حفظ إعدادات المتجر بنجاح',

                depositPercent:
                    safeNumber(saved.deposit_percent, 30),

                sunbadgeOrderFee:
                    safeNumber(saved.sunbadge_order_fee, 0),

                sunbrellaRate:
                    safeNumber(saved.sunbrella_rate, 200),

                siteSettings: saved
            });
        }

        // =====================================================
        // GET: LOAD PRODUCTS
        // =====================================================

        const products =
            await supabaseRequest(
                'products',
                'GET',
                'select=*'
            );

        // =====================================================
        // NORMALIZE PRODUCT SUNBADGE FEE
        //
        // sunbadge_fee = رسوم القطعة الواحدة.
        // لا نضرب الرسوم في الكمية هنا.
        // حساب إجمالي الرسوم يتم في السلة والطلب:
        // رسوم القطعة الواحدة × كمية السطر.
        // =====================================================

        const normalizedProducts =
            (Array.isArray(products) ? products : [])
                .map(product => {
                    const rawFee =
                        product.sunbadge_fee ??
                        product.sunbadgeFee ??
                        0;

                    const sunbadgeFee =
                        safeNumber(rawFee, 0);

                    return {
                        ...product,

                        // اسم موحد للواجهة
                        sunbadge_fee: sunbadgeFee,
                        sunbadgeFee: sunbadgeFee
                    };
                });

        // =====================================================
        // LOAD OFFERS
        // =====================================================

        const offers =
            await supabaseRequest(
                'offers',
                'GET',
                'select=*&order=sort_order.asc,created_at.desc'
            );

        // =====================================================
        // LOAD CATEGORIES
        // =====================================================

        const categories =
            await supabaseRequest(
                'categories',
                'GET',
                'select=*'
            );

        // =====================================================
        // LOAD SITE SETTINGS
        // =====================================================

        const siteSettings =
            await supabaseRequest(
                'site_settings',
                'GET',
                'select=*'
            );

        // =====================================================
        // LOAD SHIPPING OPTIONS
        // =====================================================

        const shippingOptions =
            await supabaseRequest(
                'shipping_options',
                'GET',
                'select=*'
            );

        // =====================================================
        // LOAD UPHOLSTERY TYPES
        // =====================================================

        const upholsteryTypes =
            await supabaseRequest(
                'upholstery_types',
                'GET',
                'select=*'
            );

        // =====================================================
        // LOAD STORE COLORS
        // =====================================================

        const storeColors =
            await supabaseRequest(
                'store_colors',
                'GET',
                'select=*'
            );

        // =====================================================
        // SPLIT COLORS BY TYPE
        // =====================================================

        const allColors =
            Array.isArray(storeColors)
                ? storeColors
                : [];

        const cushionColors =
            allColors.filter(
                color => color.type === 'cushion'
            );

        const wickerColors =
            allColors.filter(
                color => color.type === 'wicker'
            );

        const woodColors =
            allColors.filter(
                color => color.type === 'wood'
            );

        // =====================================================
        // STORE SETTINGS
        // =====================================================

        const settings =
            Array.isArray(siteSettings) &&
            siteSettings.length > 0
                ? siteSettings[0]
                : {};

        const depositPercent =
            safeNumber(settings.deposit_percent, 30);

        const sunbadgeOrderFee =
            safeNumber(settings.sunbadge_order_fee, 0);

        const sunbrellaRate =
            safeNumber(settings.sunbrella_rate, 200);

        // =====================================================
        // FINAL RESPONSE
        // =====================================================

        return res.status(200).json({
            success: true,

            products: normalizedProducts,
            offers: Array.isArray(offers) ? offers : [],
            categories: Array.isArray(categories)
                ? categories
                : [],

            siteSettings: settings,

            depositPercent,
            sunbadgeOrderFee,
            sunbrellaRate,

            shippingOptions: Array.isArray(shippingOptions)
                ? shippingOptions
                : [],

            upholsteryTypes: Array.isArray(upholsteryTypes)
                ? upholsteryTypes
                : [],

            cushionColors,
            wickerColors,
            woodColors
        });

    } catch (error) {
        console.error('STORE API ERROR:', error);

        return res.status(500).json({
            success: false,
            error:
                error?.message ||
                'Failed to load store data'
        });
    }
}
