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

    res.setHeader('Allow', 'GET, PUT');

    if (req.method !== 'GET' && req.method !== 'PUT') {
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
                error:
                    'SUPABASE_SERVICE_ROLE_KEY is missing'
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

        function getRequestBody() {
            if (
                req.body &&
                typeof req.body === 'object' &&
                !Array.isArray(req.body)
            ) {
                return req.body;
            }

            if (typeof req.body === 'string') {
                try {
                    const parsed = JSON.parse(req.body);

                    if (
                        parsed &&
                        typeof parsed === 'object' &&
                        !Array.isArray(parsed)
                    ) {
                        return parsed;
                    }
                } catch (error) {
                    return null;
                }
            }

            return null;
        }

        function compareValue(value) {
            if (value === undefined) {
                return undefined;
            }

            if (value === null || value === '') {
                return null;
            }

            if (typeof value === 'boolean') {
                return value;
            }

            if (
                typeof value === 'number' ||
                (
                    typeof value === 'string' &&
                    value.trim() !== '' &&
                    Number.isFinite(Number(value))
                )
            ) {
                return Number(value);
            }

            return value;
        }

        function verifySavedFields(saved, expected) {
            if (!saved || typeof saved !== 'object') {
                return false;
            }

            for (const [key, expectedValue] of Object.entries(
                expected
            )) {
                const actualValue = saved[key];

                if (
                    compareValue(actualValue) !==
                    compareValue(expectedValue)
                ) {
                    return false;
                }
            }

            return true;
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

            if (
                method === 'POST' ||
                method === 'PATCH' ||
                method === 'DELETE'
            ) {
                headers.Prefer =
                    options.prefer ||
                    'return=representation';
            }

            let response;

            try {
                response = await fetch(url, {
                    method,
                    headers,
                    body:
                        body !== null
                            ? JSON.stringify(body)
                            : undefined,
                    cache: 'no-store',
                    signal: AbortSignal.timeout(15000)
                });
            } catch (error) {
                const wrappedError = new Error(
                    `الاتصال بجدول ${table} فشل: ` +
                    normalizeError(error)
                );

                wrappedError.table = table;
                wrappedError.status = 502;

                throw wrappedError;
            }

            const responseText = await response.text();

            let data = null;

            if (responseText) {
                try {
                    data = JSON.parse(responseText);
                } catch (error) {
                    const wrappedError = new Error(
                        `جدول ${table}: استجابة غير صالحة من Supabase`
                    );

                    wrappedError.table = table;
                    wrappedError.status = 502;

                    throw wrappedError;
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

                const wrappedError = new Error(
                    `جدول ${table}: ${message}`
                );

                wrappedError.status = response.status;
                wrappedError.table = table;
                wrappedError.supabaseCode = data?.code;

                throw wrappedError;
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

            const match = String(authorization).match(
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
                process.env.ADMIN_EMAIL ||
                'admin@elmothda.com'
            ).trim().toLowerCase();

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
                        'جلسة المدير غير صالحة أو انتهت. سجّل الدخول مرة أخرى.'
                };
            }

            let user;

            try {
                user = await response.json();
            } catch (error) {
                return {
                    valid: false,
                    status: 401,
                    error:
                        'تعذر قراءة بيانات جلسة المدير'
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
            const tableRequests = [
                {
                    key: 'products',
                    table: 'products',
                    query: 'select=*'
                },
                {
                    key: 'offers',
                    table: 'offers',
                    query:
                        'select=*&order=sort_order.asc,created_at.desc'
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
                            normalizeError(error)
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
                return res.status(500).json({
                    success: false,
                    error:
                        'تعذر تحميل بيانات المتجر بالكامل',
                    failedTables: failedRequests.map(
                        result => ({
                            table: result.table,
                            error: result.error,
                            code: result.code
                        })
                    )
                });
            }

            const storeData = {};

            results.forEach(function(result) {
                storeData[result.key] = result.data;
            });

            // =================================================
            // PRODUCTS / SUNBADGE
            // =================================================

            const normalizedProducts =
                storeData.products.map(function(product) {
                    const rawFee =
                        product.sunbadge_fee ??
                        product.sunbadgeFee ??
                        product.sunbadge_unit_fee ??
                        product.sunbadgeUnitFee ??
                        0;

                    const sunbadgeFee = safeNumber(
                        rawFee,
                        0
                    );

                    return {
                        ...product,
                        sunbadge_fee: sunbadgeFee,
                        sunbadgeFee
                    };
                });

            // =================================================
            // COLORS
            // =================================================

            const cushionColors =
                storeData.storeColors.filter(
                    color => color.type === 'cushion'
                );

            const wickerColors =
                storeData.storeColors.filter(
                    color => color.type === 'wicker'
                );

            const woodColors =
                storeData.storeColors.filter(
                    color => color.type === 'wood'
                );

            // =================================================
            // SETTINGS
            // =================================================

            const settings =
                storeData.siteSettings[0] || {};

            const depositPercent =
                isValidPercentage(settings.deposit_percent)
                    ? Number(settings.deposit_percent)
                    : 30;

            const sunbadgeOrderFee = safeNumber(
                settings.sunbadge_order_fee,
                0
            );

            // قيمة توافقية للواجهة القديمة.
            // الرسوم الخاصة بالمنتج تظل من sunbadge_fee.
            const sunbrellaRate = 200;

            // =================================================
            // RESPONSE
            // =================================================

            return res.status(200).json({
                success: true,

                products: normalizedProducts,
                offers: storeData.offers,
                categories: storeData.categories,

                siteSettings: settings,

                depositPercent,
                sunbadgeOrderFee,
                sunbrellaRate,

                shippingOptions: storeData.shippingOptions,
                upholsteryTypes: storeData.upholsteryTypes,

                cushionColors,
                wickerColors,
                woodColors
            });
        }

        // =====================================================
        // PUT: VERIFY ADMIN
        // =====================================================

        const auth = await verifyAdmin();

        if (!auth.valid) {
            return sendError(
                auth.status,
                auth.error
            );
        }

        const body = getRequestBody();

        if (!body) {
            return sendError(
                400,
                'بيانات الإعدادات المرسلة غير صحيحة'
            );
        }

        // =====================================================
        // ALLOWED SETTINGS
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
        // LOAD CURRENT SETTINGS
        // =====================================================

        const existingSettings = await supabaseRequest(
            'site_settings',
            'GET',
            'select=*&limit=1'
        );

        let savedSettings;

        // =====================================================
        // UPDATE EXISTING SETTINGS
        // =====================================================

        if (
            Array.isArray(existingSettings) &&
            existingSettings.length > 0
        ) {
            const current = existingSettings[0];

            if (
                current.id === undefined ||
                current.id === null
            ) {
                return sendError(
                    500,
                    'صف إعدادات المتجر لا يحتوي على معرّف صالح'
                );
            }

            const query =
                'id=eq.' +
                encodeURIComponent(String(current.id));

            savedSettings = await supabaseRequest(
                'site_settings',
                'PATCH',
                query,
                updateData
            );

            // =================================================
            // VERIFY PATCH RESULT
            // =================================================

            if (
                !Array.isArray(savedSettings) ||
                savedSettings.length === 0
            ) {
                const verification = await supabaseRequest(
                    'site_settings',
                    'GET',
                    'id=eq.' +
                        encodeURIComponent(String(current.id)) +
                        '&select=*&limit=1'
                );

                if (
                    !Array.isArray(verification) ||
                    verification.length === 0 ||
                    !verifySavedFields(
                        verification[0],
                        updateData
                    )
                ) {
                    return sendError(
                        409,
                        'لم يتم تأكيد حفظ الإعدادات المطلوبة. راجع قاعدة البيانات وحاول مرة أخرى.'
                    );
                }

                savedSettings = verification;
            }
        } else {
            // =================================================
            // CREATE INITIAL SETTINGS
            // لا نفترض نوع العمود id ولا نفرض القيمة 1.
            // =================================================

            const initialSettings = {
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
                '',
                initialSettings
            );

            if (
                !Array.isArray(savedSettings) ||
                savedSettings.length === 0
            ) {
                const verification = await supabaseRequest(
                    'site_settings',
                    'GET',
                    'select=*&limit=1'
                );

                if (
                    !Array.isArray(verification) ||
                    verification.length === 0 ||
                    !verifySavedFields(
                        verification[0],
                        updateData
                    )
                ) {
                    return sendError(
                        409,
                        'تعذر تأكيد إنشاء إعدادات المتجر وحفظ القيم المطلوبة'
                    );
                }

                savedSettings = verification;
            }
        }

        // =====================================================
        // FINAL VERIFICATION
        // =====================================================

        const saved = savedSettings[0];

        if (!verifySavedFields(saved, updateData)) {
            return sendError(
                409,
                'الإعدادات التي رجعت من قاعدة البيانات لا تطابق القيم المطلوبة'
            );
        }

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
