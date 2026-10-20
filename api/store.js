
module.exports = async function handler(req, res) {
    const startedAt = Date.now();
    const isGet = req.method === 'GET';

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
                error: 'SUPABASE_SERVICE_ROLE_KEY is missing'
            });
        }

        // =====================================================
        // TIMEOUTS
        // =====================================================

        const GET_TIMEOUT_MS = 5000;
        const PUT_TIMEOUT_MS = 4500;
        const AUTH_TIMEOUT_MS = 4500;

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

            if (error?.name === 'TimeoutError') {
                return 'انتهت مهلة الاتصال';
            }

            if (error?.name === 'AbortError') {
                return 'تم إيقاف الاتصال بسبب انتهاء المهلة';
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

            if (details !== undefined) {
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
                if (
                    compareValue(saved[key]) !==
                    compareValue(expectedValue)
                ) {
                    return false;
                }
            }

            return true;
        }

        function logRequestTiming(table, method, elapsed, success) {
            const log = {
                table,
                method,
                durationMs: elapsed,
                success
            };

            if (elapsed >= 2500 || !success) {
                console.warn(
                    'SUPABASE REQUEST DIAGNOSTICS:',
                    log
                );
            } else {
                console.info('SUPABASE REQUEST:', log);
            }
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

            const requestStartedAt = Date.now();

            const timeoutMs =
                options.timeoutMs ||
                (method === 'GET'
                    ? (
                        isGet
                            ? GET_TIMEOUT_MS
                            : PUT_TIMEOUT_MS
                    )
                    : PUT_TIMEOUT_MS);

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
            let responseText;

            try {
                response = await fetch(url, {
                    method,
                    headers,
                    body:
                        body !== null
                            ? JSON.stringify(body)
                            : undefined,
                    cache: 'no-store',
                    signal: AbortSignal.timeout(timeoutMs)
                });

                responseText = await response.text();
            } catch (error) {
                const elapsed =
                    Date.now() - requestStartedAt;

                logRequestTiming(
                    table,
                    method,
                    elapsed,
                    false
                );

                const isTimeout =
                    error?.name === 'TimeoutError' ||
                    error?.name === 'AbortError';

                const wrappedError = new Error(
                    isTimeout
                        ? `انتهت مهلة الاتصال بجدول ${table} بعد ${elapsed}ms`
                        : `الاتصال بجدول ${table} فشل: ${normalizeError(error)}`
                );

                wrappedError.table = table;
                wrappedError.status = isTimeout ? 504 : 502;
                wrappedError.code = isTimeout
                    ? 'SUPABASE_REQUEST_TIMEOUT'
                    : 'SUPABASE_CONNECTION_ERROR';

                throw wrappedError;
            }

            let data = null;

            if (responseText) {
                try {
                    data = JSON.parse(responseText);
                } catch (error) {
                    logRequestTiming(
                        table,
                        method,
                        Date.now() - requestStartedAt,
                        false
                    );

                    const wrappedError = new Error(
                        `جدول ${table}: استجابة غير صالحة من Supabase`
                    );

                    wrappedError.table = table;
                    wrappedError.status = 502;
                    wrappedError.code =
                        'INVALID_SUPABASE_RESPONSE';

                    throw wrappedError;
                }
            }

            const elapsed =
                Date.now() - requestStartedAt;

            if (!response.ok) {
                logRequestTiming(
                    table,
                    method,
                    elapsed,
                    false
                );

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

                wrappedError.status =
                    response.status === 408 ||
                    response.status === 504
                        ? 503
                        : response.status;

                wrappedError.table = table;
                wrappedError.supabaseCode = data?.code;

                throw wrappedError;
            }

            logRequestTiming(
                table,
                method,
                elapsed,
                true
            );

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
            let responseText;

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
                        signal: AbortSignal.timeout(
                            AUTH_TIMEOUT_MS
                        )
                    }
                );

                responseText = await response.text();
            } catch (error) {
                console.error(
                    'ADMIN AUTH CONNECTION ERROR:',
                    normalizeError(error)
                );

                const timedOut =
                    error?.name === 'TimeoutError' ||
                    error?.name === 'AbortError';

                return {
                    valid: false,
                    status: timedOut ? 503 : 502,
                    error: timedOut
                        ? 'انتهت مهلة التحقق من جلسة المدير'
                        : 'تعذر الاتصال بخدمة تسجيل الدخول'
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
                user = JSON.parse(responseText);
            } catch (error) {
                return {
                    valid: false,
                    status: 502,
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
                    query: 'select=*',
                    required: true
                },
                {
                    key: 'offers',
                    table: 'offers',
                    query:
                        'select=*&order=sort_order.asc,created_at.desc',
                    required: false
                },
                {
                    key: 'categories',
                    table: 'categories',
                    query: 'select=*',
                    required: true
                },
                {
                    key: 'siteSettings',
                    table: 'site_settings',
                    query: 'select=*',
                    required: true
                },
                {
                    key: 'shippingOptions',
                    table: 'shipping_options',
                    query: 'select=*',
                    required: false
                },
                {
                    key: 'upholsteryTypes',
                    table: 'upholstery_types',
                    query: 'select=*',
                    required: false
                },
                {
                    key: 'storeColors',
                    table: 'store_colors',
                    query: 'select=*',
                    required: false
                }
            ];

            console.info('STORE LOAD START:', {
                tables: tableRequests.length,
                timestamp: new Date().toISOString()
            });

            const results = await Promise.all(
                tableRequests.map(async function(request) {
                    try {
                        const data = await supabaseRequest(
                            request.table,
                            'GET',
                            request.query
                        );

                        if (!Array.isArray(data)) {
                            const error = new Error(
                                `جدول ${request.table} لم يُرجع قائمة بيانات`
                            );

                            error.table = request.table;
                            error.status = 502;
                            error.code =
                                'INVALID_TABLE_RESPONSE';

                            throw error;
                        }

                        return {
                            key: request.key,
                            table: request.table,
                            required: request.required,
                            success: true,
                            data
                        };
                    } catch (error) {
                        const failure = {
                            key: request.key,
                            table: request.table,
                            required: request.required,
                            success: false,
                            error: normalizeError(error),
                            status: error?.status || 500,
                            code:
                                error?.supabaseCode ||
                                error?.code ||
                                null
                        };

                        console.error(
                            `STORE LOAD ERROR [${request.table}]:`,
                            {
                                message: failure.error,
                                status: failure.status,
                                code: failure.code,
                                required: failure.required
                            }
                        );

                        return failure;
                    }
                })
            );

            // =================================================
            // REQUIRED TABLES
            // Only failures in core tables block store loading.
            // =================================================

            const failedRequired = results.filter(
                result =>
                    !result.success &&
                    result.required
            );

            // =================================================
            // OPTIONAL TABLES
            // A failed optional table must not block products.
            // No database data is changed or deleted here.
            // =================================================

            const failedOptional = results.filter(
                result =>
                    !result.success &&
                    !result.required
            );

            if (failedOptional.length > 0) {
                console.warn(
                    'STORE OPTIONAL TABLES UNAVAILABLE:',
                    {
                        durationMs: Date.now() - startedAt,
                        failedTables: failedOptional.map(
                            result => ({
                                table: result.table,
                                status: result.status,
                                code: result.code,
                                message: result.error
                            })
                        )
                    }
                );
            }

            if (failedRequired.length > 0) {
                const timedOut = failedRequired.some(
                    result =>
                        result.status === 504 ||
                        result.status === 503 ||
                        result.code ===
                            'SUPABASE_REQUEST_TIMEOUT'
                );

                const elapsed = Date.now() - startedAt;

                console.error('STORE LOAD FAILED:', {
                    durationMs: elapsed,
                    failedTables: failedRequired.map(
                        result => ({
                            table: result.table,
                            status: result.status,
                            code: result.code
                        })
                    ),
                    optionalTablesUnavailable:
                        failedOptional.map(
                            result => result.table
                        )
                });

                return res.status(timedOut ? 503 : 502).json({
                    success: false,
                    error: timedOut
                        ? 'استغرق الاتصال بقاعدة البيانات وقتًا أطول من المسموح'
                        : 'تعذر تحميل بيانات المتجر الأساسية',
                    durationMs: elapsed,
                    failedTables: failedRequired.map(
                        result => ({
                            table: result.table,
                            error: result.error,
                            code: result.code
                        })
                    )
                });
            }

            // Successful results are kept unchanged.
            // Failed optional tables use an empty array for
            // this response only. Supabase data is untouched.
            const storeData = {};

            results.forEach(function(result) {
                storeData[result.key] = result.success
                    ? result.data
                    : [];
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

            // Compatibility value for the existing frontend.
            // Per-product Sunbadge fees remain in sunbadge_fee.
            const sunbrellaRate = 200;

            // =================================================
            // RESPONSE
            // =================================================

            const payload = {
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
                woodColors,

                // Frontend can inspect these flags if needed.
                partialLoad: failedOptional.length > 0,
                unavailableTables: failedOptional.map(
                    result => result.table
                )
            };

            console.info('STORE LOAD SUCCESS:', {
                durationMs: Date.now() - startedAt,
                products: payload.products.length,
                offers: payload.offers.length,
                categories: payload.categories.length,
                partialLoad: payload.partialLoad,
                unavailableTables: payload.unavailableTables
            });

            return res.status(200).json(payload);
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

        console.info('STORE SETTINGS SAVED:', {
            durationMs: Date.now() - startedAt,
            fields: Object.keys(updateData)
        });

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
        const elapsed = Date.now() - startedAt;

        console.error('STORE API ERROR:', {
            message: normalizeError(error),
            table: error?.table || null,
            code:
                error?.supabaseCode ||
                error?.code ||
                null,
            status: error?.status || null,
            durationMs: elapsed,
            method: req.method
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
            code:
                error?.supabaseCode ||
                error?.code ||
                undefined
        });
    }
};
