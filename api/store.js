
export default async function handler(req, res) {
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

        // رابط Supabase
        const SUPABASE_BASE_URL =
            'https://kxtiqtcxkcwdvljiadfn.supabase.co';

        // الاتصال بقاعدة البيانات
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

            let data = [];

            try {
                data = responseText
                    ? JSON.parse(responseText)
                    : [];
            } catch {
                throw new Error(
                    `Supabase returned non-JSON response: ${responseText.substring(0, 300)}`
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
        // PUT: حفظ إعدادات المتجر
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

            // نسبة الديبوزت
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
                            'نسبة الديبوزت يجب أن تكون بين 0% و100%'
                    });
                }

                updateData.deposit_percent =
                    Math.round(depositPercent);
            }

            // رسوم صن بيدج العامة للطلب
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

            // جلب إعدادات المتجر الحالية
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
                // القيم الافتراضية عند إنشاء أول سجل
                savedSettings =
                    await supabaseRequest(
                        'site_settings',
                        'POST',
                        '',
                        {
                            deposit_percent: 30,
                            sunbadge_order_fee: 0,
                            ...updateData
                        }
                    );
            }

            const saved =
                Array.isArray(savedSettings)
                    ? (savedSettings[0] || {})
                    : {};

            return res.status(200).json({
                success: true,
                message: 'تم حفظ إعدادات المتجر بنجاح',

                depositPercent:
                    Number(saved.deposit_percent ?? 30),

                sunbadgeOrderFee:
                    Number(saved.sunbadge_order_fee ?? 0),

                sunbrellaRate:
                    Number(saved.sunbrella_rate ?? 200),

                siteSettings: saved
            });
        }

        // =====================================================
        // GET: تحميل بيانات المتجر
        // =====================================================

        const products =
            await supabaseRequest(
                'products',
                'GET',
                'select=*'
            );

        const offers =
            await supabaseRequest(
                'offers',
                'GET',
                'select=*&order=sort_order.asc,created_at.desc'
            );

        const categories =
            await supabaseRequest(
                'categories',
                'GET',
                'select=*'
            );

        const siteSettings =
            await supabaseRequest(
                'site_settings',
                'GET',
                'select=*'
            );

        const shippingOptions =
            await supabaseRequest(
                'shipping_options',
                'GET',
                'select=*'
            );

        const upholsteryTypes =
            await supabaseRequest(
                'upholstery_types',
                'GET',
                'select=*'
            );

        const storeColors =
            await supabaseRequest(
                'store_colors',
                'GET',
                'select=*'
            );

        // تقسيم الألوان
        const cushionColors =
            (storeColors || []).filter(
                color => color.type === 'cushion'
            );

        const wickerColors =
            (storeColors || []).filter(
                color => color.type === 'wicker'
            );

        const woodColors =
            (storeColors || []).filter(
                color => color.type === 'wood'
            );

        // إعدادات المتجر
        const settings =
            siteSettings?.[0] || {};

        const depositPercent =
            Number(settings.deposit_percent ?? 30);

        const sunbadgeOrderFee =
            Number(settings.sunbadge_order_fee ?? 0);

        const sunbrellaRate =
            Number(settings.sunbrella_rate ?? 200);

        // الاستجابة النهائية
        return res.status(200).json({
            success: true,

            products: products || [],
            offers: offers || [],
            categories: categories || [],

            siteSettings: settings,

            depositPercent,
            sunbadgeOrderFee,
            sunbrellaRate,

            shippingOptions: shippingOptions || [],
            upholsteryTypes: upholsteryTypes || [],

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
