
module.exports = async function handler(req, res) {    // منع تخزين بيانات المتجر مؤقتًا
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
    body: body !== null
        ? JSON.stringify(body)
        : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(7000)
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

    const allowedFields = {
        depositPercent: {
            column: 'deposit_percent',
            validate: value =>
                Number.isFinite(Number(value)) &&
                Number(value) >= 0 &&
                Number(value) <= 100,
            error: 'نسبة العربون يجب أن تكون بين 0% و100%'
        },
        sunbadgeOrderFee: {
            column: 'sunbadge_order_fee',
            validate: value =>
                Number.isFinite(Number(value)) &&
                Number(value) >= 0 &&
                Number(value) <= 100000,
            error: 'رسوم صن بيدج يجب أن تكون بين 0 و100000 جنيه'
        },
        sunbrellaRate: {
            column: 'sunbrella_rate',
            validate: value =>
                Number.isFinite(Number(value)) &&
                Number(value) >= 0 &&
                Number(value) <= 100000,
            error: 'سعر صن بريلا يجب أن يكون بين 0 و100000 جنيه'
        },
        whatsappNotifyNewOrder: {
            column: 'whatsapp_notify_new_order',
            validate: value => typeof value === 'boolean',
            error: 'قيمة إشعار الطلب الجديد غير صحيحة'
        },
        whatsappNotifyOrderStatus: {
            column: 'whatsapp_notify_order_status',
            validate: value => typeof value === 'boolean',
            error: 'قيمة إشعارات حالة الطلب غير صحيحة'
        },
        whatsappNotifyPaymentStatus: {
            column: 'whatsapp_notify_payment_status',
            validate: value => typeof value === 'boolean',
            error: 'قيمة إشعارات حالة الدفع غير صحيحة'
        },
        whatsappNotifyCustomer: {
            column: 'whatsapp_notify_customer',
            validate: value => typeof value === 'boolean',
            error: 'قيمة إشعارات العميل غير صحيحة'
        }
    };

    const updateData = {};

    for (const [field, config] of Object.entries(allowedFields)) {
        if (body[field] === undefined) continue;

        if (!config.validate(body[field])) {
            return res.status(400).json({
                success: false,
                error: config.error
            });
        }

        updateData[config.column] =
            typeof body[field] === 'boolean'
                ? body[field]
                : Number(body[field]);
    }

    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
            success: false,
            error: 'لم يتم إرسال أي إعداد للحفظ'
        });
    }

    const existingSettings = await supabaseRequest(
        'site_settings',
        'GET',
        'select=*&limit=1'
    );

    let savedSettings;

    if (
        Array.isArray(existingSettings) &&
        existingSettings.length > 0
    ) {
        savedSettings = await supabaseRequest(
            'site_settings',
            'PATCH',
            `id=eq.${encodeURIComponent(existingSettings[0].id)}`,
            updateData
        );
    } else {
        savedSettings = await supabaseRequest(
            'site_settings',
            'POST',
            '',
            {
                deposit_percent: 30,
                sunbadge_order_fee: 0,
                sunbrella_rate: 200,
                whatsapp_notify_new_order: true,
                whatsapp_notify_order_status: true,
                whatsapp_notify_payment_status: true,
                whatsapp_notify_customer: false,
                ...updateData
            }
        );
    }

    const saved = Array.isArray(savedSettings)
        ? savedSettings[0] || {}
        : {};

    return res.status(200).json({
        success: true,
        message: 'تم حفظ إعدادات المتجر بنجاح',
        depositPercent: safeNumber(saved.deposit_percent, 30),
        sunbadgeOrderFee: safeNumber(saved.sunbadge_order_fee, 0),
        sunbrellaRate: safeNumber(saved.sunbrella_rate, 200),
        siteSettings: saved
    });
}

       
        // =====================================================
        // LOAD ALL STORE DATA IN PARALLEL
        // =====================================================

        const [
            products,
            offers,
            categories,
            siteSettings,
            shippingOptions,
            upholsteryTypes,
            storeColors
        ] = await Promise.all([
            supabaseRequest(
                'products',
                'GET',
                'select=*'
            ),
            supabaseRequest(
                'offers',
                'GET',
                'select=*&order=sort_order.asc,created_at.desc'
            ),
            supabaseRequest(
                'categories',
                'GET',
                'select=*'
            ),
            supabaseRequest(
                'site_settings',
                'GET',
                'select=*'
            ),
            supabaseRequest(
                'shipping_options',
                'GET',
                'select=*'
            ),
            supabaseRequest(
                'upholstery_types',
                'GET',
                'select=*'
            ),
            supabaseRequest(
                'store_colors',
                'GET',
                'select=*'
            )
        ]);

        // =====================================================
        // NORMALIZE PRODUCT SUNBADGE FEE
        // =====================================================

        function normalizeProduct(product) {
            const rawFee =
                product.sunbadge_fee ??
                product.sunbadgeFee ??
                0;

            const sunbadgeFee = safeNumber(rawFee, 0);

            return {
                ...product,
                sunbadge_fee: sunbadgeFee,
                sunbadgeFee: sunbadgeFee
            };
        }

        const normalizedProducts = (
            Array.isArray(products) ? products : []
        ).map(normalizeProduct);

        // =====================================================
        // SPLIT COLORS BY TYPE
        // =====================================================

        const allColors = Array.isArray(storeColors)
            ? storeColors
            : [];

        const cushionColors = allColors.filter(
            color => color.type === 'cushion'
        );

        const wickerColors = allColors.filter(
            color => color.type === 'wicker'
        );

        const woodColors = allColors.filter(
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
