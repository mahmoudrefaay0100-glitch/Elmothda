module.exports = async function handler(req, res) {
    // =====================================================
    // HEADERS
    // =====================================================

    res.setHeader(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate'
    );
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (req.method !== 'GET' && req.method !== 'PUT') {
        res.setHeader('Allow', 'GET, PUT');

        return res.status(405).json({
            success: false,
            error: 'Method not allowed'
        });
    }

    try {
        // =====================================================
        // ENVIRONMENT
        // =====================================================

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
        // HELPERS
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

        function isValidPercentage(value) {
            if (
                value === null ||
                value === undefined ||
                value === ''
            ) {
                return false;
            }

            const number = Number(value);

            return (
                Number.isFinite(number) &&
                number >= 0 &&
                number <= 100
            );
        }

        function isValidNonNegativeNumber(
            value,
            maximum = Number.MAX_SAFE_INTEGER
        ) {
            if (
                value === null ||
                value === undefined ||
                value === ''
            ) {
                return false;
            }

            const number = Number(value);

            return (
                Number.isFinite(number) &&
                number >= 0 &&
                number <= maximum
            );
        }

        function normalizeError(error) {
            if (typeof error === 'string') {
                return error;
            }

            return (
                error?.message ||
                error?.error_description ||
                error?.details ||
                'حدث خطأ غير معروف'
            );
        }

        function sendError(status, message, details) {
            const payload = {
                success: false,
                error: message
            };

            if (details) {
                payload.details = details;
            }

            return res.status(status).json(payload);
        }

        // =====================================================
        // SUPABASE REQUEST
        // =====================================================

        async function supabaseRequest(
            table,
            method = 'GET',
            query = '',
            body = null,
            options = {}
        ) {
            const allowedMethods = [
                'GET',
                'POST',
                'PATCH',
                'DELETE'
            ];

            if (!allowedMethods.includes(method)) {
                throw new Error(
                    `Unsupported Supabase method: ${method}`
                );
            }

            const url =
                `${SUPABASE_URL}/rest/v1/${table}` +
                (query ? `?${query}` : '');

            const headers = {
                apikey: SERVICE_KEY,
                Authorization: `Bearer ${SERVICE_KEY}`,
                Accept: 'application/json'
            };

            if (body !== null) {
                headers['Content-Type'] = 'application/json';
            }

            if (method === 'POST' || method === 'PATCH') {
                headers.Prefer =
                    options.prefer || 'return=representation';
            }

            let response;

            try {
                response = await fetch(url, {
                    method,
                    headers,
                    body: body !== null
                        ? JSON.stringify(body)
                        : undefined,
                    cache: 'no-store',
                    signal: AbortSignal.timeout(10000)
                });
            } catch (error) {
                throw new Error(
                    `الاتصال بجدول ${table} فشل: ` +
                    normalizeError(error)
                );
            }

            const responseText = await response.text();

            let data = null;

            if (responseText) {
                try {
                    data = JSON.parse(responseText);
                } catch {
                    throw new Error(
                        `جدول ${table}: استجابة غير صالحة من Supabase. ` +
                        responseText.substring(0, 250)
                    );
                }
            }

            if (!response.ok) {
                const message =
                    data?.message ||
                    data?.error_description ||
                    data?.details ||
                    data?.hint ||
                    data?.error ||
                    `HTTP ${response.status}`;

                const error = new Error(
                    `جدول ${table}: ${message}`
                );

                error.status = response.status;
                error.table = table;
                error.supabaseCode = data?.code;

                throw error;
            }

            return data;
        }

        // =====================================================
        // VERIFY ADMIN
        // =====================================================

        async function verifyAdmin() {
            const authorization =
                req.headers.authorization ||
                req.headers.Authorization ||
                '';

            const match = authorization.match(
                /^Bearer\s+(.+)$/i
            );

            const accessToken = match?.[1]?.trim();

            if (!accessToken) {
                return {
                    valid: false,
                    status: 401,
                    error:
                        'يجب تسجيل الدخول كمدير لحفظ الإعدادات'
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

            let response;

            try {
                response = await fetch(
                    `${SUPABASE_URL}/auth/v1/user`,
                    {
                        method: 'GET',
                        headers: {
                            apikey: ANON_KEY,
                            Authorization:
                                `Bearer ${accessToken}`,
                            Accept: 'application/json'
                        },
                        cache: 'no-store',
                        signal: AbortSignal.timeout(10000)
                    }
                );
            } catch (error) {
                console.error(
                    'ADMIN AUTH CONNECTION ERROR:',
                    normalizeError(error)
                );

                return {
                    valid: false,
                    status: 503,
                    error:
                        'تعذر التحقق من جلسة المدير. حاول مرة أخرى.'
                };
            }

            if (!response.ok) {
                return {
                    valid: false,
                    status: 401,
                    error:
                        'جلسة المدير غير صالحة أو انتهت. ' +
                        'سجّل الدخول مرة أخرى.'
                };
            }

            let user;

            try {
                user = await response.json();
            } catch {
                return {
                    valid: false,
                    status: 401,
                    error:
                        'تعذر قراءة بيانات جلسة المدير.'
                };
            }

            if (
                !user?.email ||
                user.email.trim().toLowerCase() !== adminEmail
            ) {
                return {
                    valid: false,
                    status: 403,
                    error:
                        'غير مسموح إلا لمدير الموقع بتعديل الإعدادات'
                };
            }

            return {
                valid: true,
                user
            };
        }

        // =====================================================
        // GET: LOAD STORE DATA
        // =====================================================

        if (req.method === 'GET') {
            /*
             * نحافظ على أسماء الجداول والحقول المستخدمة
             * في الواجهة الحالية.
             *
             * في حالة فشل أي استعلام، يظهر اسم الجدول
             * ورسالة Supabase بدل إرجاع بيانات مضللة.
             */

            const tableRequests = [
                {
                    key: 'products',
                    table: 'products',
                    query: 'select=*'
                },
                {
                    key: 'offers',
                    table: 'offers',
                    query: 'select=*&order=sort_order.asc,created_at.desc'
                },
                {
                    key: 'categories',
                    table: 'categories',
                    query: 'select=*'
                },
                {
                    key: 'siteSettings',
                    table: 'site_settings',
                    query: 'select=*'
                },
                {
                    key: 'shippingOptions',
                    table: 'shipping_options',
                    query: 'select=*'
                },
                {
                    key: 'upholsteryTypes',
                    table: 'upholstery_types',
                    query: 'select=*'
                },
                {
                    key: 'storeColors',
                    table: 'store_colors',
                    query: 'select=*'
                }
            ];

            const results = await Promise.all(
                tableRequests.map(async function(request) {
                    try {
                        const data = await supabaseRequest(
                            request.table,
                            'GET',
                            request.query
                        );

                        if (!Array.isArray(data)) {
                            throw new Error(
                                `جدول ${request.table} لم يُرجع قائمة بيانات`
                            );
                        }

                        return {
                            key: request.key,
                            table: request.table,
                            success: true,
                            data
                        };
                    } catch (error) {
                        console.error(
                            `STORE LOAD ERROR [${request.table}]:`,
                            error
                        );

                        return {
                            key: request.key,
                            table: request.table,
                            success: false,
                            error: normalizeError(error),
                            status: error?.status || 500,
                            code: error?.supabaseCode || null
                        };
                    }
                })
            );

            const failedRequests = results.filter(
                result => !result.success
            );

            if (failedRequests.length > 0) {
                const failedTables = failedRequests.map(
                    result => ({
                        table: result.table,
                        error: result.error,
                        code: result.code
                    })
                );

                console.error(
                    'STORE TABLES FAILED:',
                    failedTables
                );

                return res.status(500).json({
                    success: false,
                    error:
                        'تعذر تحميل بيانات المتجر بالكامل. ' +
                        'راجع تفاصيل الجداول التي فشل تحميلها.',
                    failedTables
                });
            }

            const storeData = {};

            results.forEach(function(result) {
                storeData[result.key] = result.data;
            });

            const products = storeData.products;
            const offers = storeData.offers;
            const categories = storeData.categories;
            const siteSettings = storeData.siteSettings;
            const shippingOptions = storeData.shippingOptions;
            const upholsteryTypes = storeData.upholsteryTypes;
            const storeColors = storeData.storeColors;

            // =================================================
            // NORMALIZE PRODUCT SUNBADGE FEE
            // =================================================

            function normalizeProduct(product) {
                const rawFee =
                    product.sunbadge_fee ??
                    product.sunbadgeFee ??
                    product.sunbadge_unit_fee ??
                    product.sunbadgeUnitFee ??
                    0;

                const sunbadgeFee = safeNumber(rawFee, 0);

                return {
                    ...product,
                    sunbadge_fee: sunbadgeFee,
                    sunbadgeFee
                };
            }

            const normalizedProducts = products.map(
                normalizeProduct
            );

            // =================================================
            // SPLIT COLORS BY TYPE
            // =================================================

            const cushionColors = storeColors.filter(
                color => color.type === 'cushion'
            );

            const wickerColors = storeColors.filter(
                color => color.type === 'wicker'
            );

            const woodColors = storeColors.filter(
                color => color.type === 'wood'
            );

            // =================================================
            // STORE SETTINGS
            // =================================================

            const settings = siteSettings[0] || {};

            const depositPercent = isValidPercentage(
                settings.deposit_percent
            )
                ? Number(settings.deposit_percent)
                : 30;

            const sunbadgeOrderFee = safeNumber(
                settings.sunbadge_order_fee,
                0
            );

            /*
             * قيمة توافقية للواجهة القديمة فقط.
             * رسوم صن بادج الخاصة بكل منتج تُقرأ من المنتج نفسه.
             */
            const sunbrellaRate = 200;

            // =================================================
            // FINAL RESPONSE
            // =================================================

            return res.status(200).json({
                success: true,

                products: normalizedProducts,
                offers,
                categories,

                siteSettings: settings,

                depositPercent,
                sunbadgeOrderFee,
                sunbrellaRate,

                shippingOptions,
                upholsteryTypes,

                cushionColors,
                wickerColors,
                woodColors
            });
        }

        // =====================================================
        // PUT: SAVE STORE SETTINGS
        // =====================================================

        const auth = await verifyAdmin();

        if (!auth.valid) {
            return sendError(
                auth.status,
                auth.error
            );
        }

        const body =
            req.body &&
            typeof req.body === 'object' &&
            !Array.isArray(req.body)
                ? req.body
                : null;

        if (!body) {
            return sendError(
                400,
                'بيانات الإعدادات المرسلة غير صحيحة'
            );
        }

        // =====================================================
        // ALLOWED FIELDS
        // =====================================================

        const allowedFields = {
            depositPercent: {
                column: 'deposit_percent',

                validate: isValidPercentage,

                normalize: value => Number(value),

                error:
                    'نسبة العربون يجب أن تكون بين 0% و100%'
            },

            sunbadgeOrderFee: {
                column: 'sunbadge_order_fee',

                validate: value =>
                    isValidNonNegativeNumber(value, 100000),

                normalize: value => Number(value),

                error:
                    'رسوم صن بادج يجب أن تكون بين 0 و100000 جنيه'
            },

            whatsappNotifyNewOrder: {
                column: 'whatsapp_notify_new_order',

                validate: value =>
                    typeof value === 'boolean',

                normalize: value => value,

                error:
                    'قيمة إشعار الطلب الجديد غير صحيحة'
            },

            whatsappNotifyOrderStatus: {
                column: 'whatsapp_notify_order_status',

                validate: value =>
                    typeof value === 'boolean',

                normalize: value => value,

                error:
                    'قيمة إشعارات حالة الطلب غير صحيحة'
            },

            whatsappNotifyPaymentStatus: {
                column: 'whatsapp_notify_payment_status',

                validate: value =>
                    typeof value === 'boolean',

                normalize: value => value,

                error:
                    'قيمة إشعارات حالة الدفع غير صحيحة'
            },

            whatsappNotifyCustomer: {
                column: 'whatsapp_notify_customer',

                validate: value =>
                    typeof value === 'boolean',

                normalize: value => value,

                error:
                    'قيمة إشعارات العميل غير صحيحة'
            }
        };

        const updateData = {};

        for (const [field, config] of Object.entries(
            allowedFields
        )) {
            if (body[field] === undefined) {
                continue;
            }

            if (!config.validate(body[field])) {
                return sendError(
                    400,
                    config.error
                );
            }

            updateData[config.column] =
                config.normalize(body[field]);
        }

        if (Object.keys(updateData).length === 0) {
            return sendError(
                400,
                'لم يتم إرسال أي إعداد صالح للحفظ'
            );
        }

        // =====================================================
        // READ CURRENT SETTINGS
        // =====================================================

        const existingSettings = await supabaseRequest(
            'site_settings',
            'GET',
            'select=*&limit=1'
        );

        let savedSettings;

        // =====================================================
        // UPDATE EXISTING ROW
        // =====================================================

        if (
            Array.isArray(existingSettings) &&
            existingSettings.length > 0
        ) {
            const current = existingSettings[0];

            if (
                current.id === null ||
                current.id === undefined
            ) {
                return sendError(
                    500,
                    'صف إعدادات المتجر لا يحتوي على معرّف صالح'
                );
            }

            const query =
                'id=eq.' +
                encodeURIComponent(String(current.id)) +
                '&select=*';

            savedSettings = await supabaseRequest(
                'site_settings',
                'PATCH',
                query,
                updateData
            );
        } else {
            // =============================================
            // CREATE INITIAL SETTINGS ROW
            // =============================================

            const initialSettings = {
                id: 1,
                title: 'المتحدة للرتان والأثاث',
                deposit_percent: 30,
                sunbadge_order_fee: 0,
                whatsapp_notify_new_order: true,
                whatsapp_notify_order_status: true,
                whatsapp_notify_payment_status: true,
                whatsapp_notify_customer: false,
                ...updateData
            };

            savedSettings = await supabaseRequest(
                'site_settings',
                'POST',
                'select=*',
                initialSettings
            );
        }

        // =====================================================
        // VERIFY SAVED RESULT
        // =====================================================

        if (
            !Array.isArray(savedSettings) ||
            savedSettings.length === 0
        ) {
            /*
             * عدم وجود صف را لا نعتبره نجاحًا مؤكدًا.
             * نقرأ الإعدادات مجددًا لمعرفة هل تم الحفظ.
             */
            const verification = await supabaseRequest(
                'site_settings',
                'GET',
                'select=*&limit=1'
            );

            if (
                !Array.isArray(verification) ||
                verification.length === 0
            ) {
                return sendError(
                    500,
                    'لم يتم العثور على إعدادات محفوظة بعد عملية الحفظ'
                );
            }

            savedSettings = verification;
        }

        const saved = savedSettings[0];

        // =====================================================
        // SUCCESS
        // =====================================================

        return res.status(200).json({
            success: true,

            message: 'تم حفظ إعدادات المتجر بنجاح',

            depositPercent: isValidPercentage(
                saved.deposit_percent
            )
                ? Number(saved.deposit_percent)
                : 30,

            sunbadgeOrderFee: safeNumber(
                saved.sunbadge_order_fee,
                0
            ),

            siteSettings: saved
        });

    } catch (error) {
        console.error('STORE API ERROR:', {
            message: normalizeError(error),
            table: error?.table || null,
            code: error?.supabaseCode || null
        });

        const status =
            Number.isInteger(error?.status) &&
            error.status >= 400 &&
            error.status <= 599
                ? error.status
                : 500;

        return res.status(status).json({
            success: false,
            error: normalizeError(error),
            table: error?.table || undefined,
            code: error?.supabaseCode || undefined
        });
    }
};
