
module.exports = async function handler(req, res) {
    // منع التخزين المؤقت
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
        const SUPABASE_URL = (
            process.env.SUPABASE_URL ||
            'https://kxtiqtcxkcwdvljiadfn.supabase.co'
        ).replace(/\/+$/, '');

        const SERVICE_KEY =
            process.env.SUPABASE_SERVICE_ROLE_KEY;

        const ANON_KEY =
            process.env.SUPABASE_ANON_KEY;

        if (!SERVICE_KEY) {
            return res.status(500).json({
                success: false,
                error: 'SUPABASE_SERVICE_ROLE_KEY is missing'
            });
        }

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
                `${SUPABASE_URL}/rest/v1/${table}` +
                (query ? `?${query}` : '');

            const response = await fetch(url, {
                method,
                headers: {
                    apikey: SERVICE_KEY,
                    Authorization: `Bearer ${SERVICE_KEY}`,
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    Prefer: 'return=representation'
                },
                body: body !== null
                    ? JSON.stringify(body)
                    : undefined,
                cache: 'no-store',
                signal: AbortSignal.timeout(10000)
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
        // VERIFY ADMIN
        // مطلوب للحفظ فقط، وليس لتحميل المتجر العام
        // =====================================================

        async function verifyAdmin() {
            const authorization =
                req.headers.authorization ||
                req.headers.Authorization ||
                '';

            const match = authorization.match(/^Bearer\s+(.+)$/i);
            const accessToken = match?.[1]?.trim();

            if (!accessToken) {
                return {
                    valid: false,
                    status: 401,
                    error: 'يجب تسجيل الدخول كمدير لحفظ الإعدادات'
                };
            }

            if (!ANON_KEY) {
                return {
                    valid: false,
                    status: 500,
                    error: 'SUPABASE_ANON_KEY is missing'
                };
            }

            const adminEmail = (
                process.env.ADMIN_EMAIL || ''
            ).trim().toLowerCase();

            if (!adminEmail) {
                return {
                    valid: false,
                    status: 500,
                    error: 'ADMIN_EMAIL is missing'
                };
            }

            const response = await fetch(
                `${SUPABASE_URL}/auth/v1/user`,
                {
                    method: 'GET',
                    headers: {
                        apikey: ANON_KEY,
                        Authorization: `Bearer ${accessToken}`,
                        Accept: 'application/json'
                    },
                    cache: 'no-store',
                    signal: AbortSignal.timeout(10000)
                }
            );

            if (!response.ok) {
                return {
                    valid: false,
                    status: 401,
                    error: 'جلسة المدير غير صالحة أو انتهت. سجّل الدخول مرة أخرى.'
                };
            }

            const user = await response.json();

            if (
                !user?.email ||
                user.email.trim().toLowerCase() !== adminEmail
            ) {
                return {
                    valid: false,
                    status: 403,
                    error: 'غير مسموح إلا لمدير الموقع بتعديل الإعدادات'
                };
            }

            return { valid: true };
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
            const auth = await verifyAdmin();

            if (!auth.valid) {
                return res.status(auth.status).json({
                    success: false,
                    error: auth.error
                });
            }

            const body = req.body || {};

            const allowedFields = {
                depositPercent: {
                    column: 'deposit_percent',
                    validate: value =>
                        value !== '' &&
                        Number.isFinite(Number(value)) &&
                        Number(value) >= 0 &&
                        Number(value) <= 100,
                    error: 'نسبة العربون يجب أن تكون بين 0% و100%'
                },

                sunbadgeOrderFee: {
                    column: 'sunbadge_order_fee',
                    validate: value =>
                        value !== '' &&
                        Number.isFinite(Number(value)) &&
                        Number(value) >= 0 &&
                        Number(value) <= 100000,
                    error: 'رسوم صن بيدج يجب أن تكون بين 0 و100000 جنيه'
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
                if (body[field] === undefined) {
                    continue;
                }

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
                    error: 'لم يتم إرسال أي إعداد صالح للحفظ'
                });
            }

            // قراءة صف الإعدادات الحالي
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
                const current = existingSettings[0];

                savedSettings = await supabaseRequest(
                    'site_settings',
                    'PATCH',
                    `id=eq.${encodeURIComponent(current.id)}&select=*`,
                    updateData
                );
            } else {
                // لا نستخدم أعمدة غير موجودة في الجدول
                savedSettings = await supabaseRequest(
                    'site_settings',
                    'POST',
                    'select=*',
                    {
                        id: 1,
                        title: 'المتحدة للرتان والأثاث',
                        deposit_percent: 30,
                        sunbadge_order_fee: 0,
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
                depositPercent: safeNumber(
                    saved.deposit_percent,
                    30
                ),
                sunbadgeOrderFee: safeNumber(
                    saved.sunbadge_order_fee,
                    0
                ),
                siteSettings: saved
            });
        }

        // =====================================================
        // GET: LOAD ALL STORE DATA
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
            supabaseRequest('products', 'GET', 'select=*'),

            supabaseRequest(
                'offers',
                'GET',
                'select=*&order=sort_order.asc,created_at.desc'
            ),

            supabaseRequest('categories', 'GET', 'select=*'),

            supabaseRequest('site_settings', 'GET', 'select=*'),

            supabaseRequest('shipping_options', 'GET', 'select=*'),

            supabaseRequest('upholstery_types', 'GET', 'select=*'),

            supabaseRequest('store_colors', 'GET', 'select=*')
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
                sunbadgeFee
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

        const depositPercent = safeNumber(
            settings.deposit_percent,
            30
        );

        const sunbadgeOrderFee = safeNumber(
            settings.sunbadge_order_fee,
            0
        );

        // قيمة توافقية للواجهة القديمة فقط؛ لا نحفظها في قاعدة البيانات
        const sunbrellaRate = 200;

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
            error: error?.message || 'Failed to load store data'
        });
    }
};
