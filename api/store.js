export default async function handler(req, res) {

    // =========================
    // منع التخزين المؤقت
    // =========================

    res.setHeader(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate'
    );

    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // =========================
    // GET فقط
    // =========================

    if (req.method !== 'GET') {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed'
        });
    }

    try {

        // =========================
        // Environment Variables
        // =========================

        const SUPABASE_URL =
            process.env.SUPABASE_URL;

        const SUPABASE_SERVICE_ROLE_KEY =
            process.env.SUPABASE_SERVICE_ROLE_KEY;

        // =========================
        // التحقق من المتغيرات
        // =========================

        if (!SUPABASE_URL) {
            return res.status(500).json({
                success: false,
                error: 'SUPABASE_URL is missing'
            });
        }

        if (!SUPABASE_SERVICE_ROLE_KEY) {
            return res.status(500).json({
                success: false,
                error: 'SUPABASE_SERVICE_ROLE_KEY is missing'
            });
        }

        // =========================
        // تنظيف رابط Supabase
        // =========================

        let supabaseBaseUrl =
            SUPABASE_URL
                .trim()
                .replace(/\/+$/, '');

        // لو الرابط متخزن بالغلط مع /rest/v1
        supabaseBaseUrl =
            supabaseBaseUrl.replace(
                /\/rest\/v1$/i,
                ''
            );

        // =========================
        // التحقق من URL
        // =========================

        let parsedUrl;

        try {

            parsedUrl =
                new URL(supabaseBaseUrl);

        } catch {

            return res.status(500).json({
                success: false,
                error: 'Invalid SUPABASE_URL'
            });

        }

        if (
            !parsedUrl.hostname.endsWith(
                '.supabase.co'
            )
        ) {

            return res.status(500).json({
                success: false,
                error:
                    'SUPABASE_URL must be your Supabase project URL'
            });

        }

        // =========================
        // دالة جلب جدول
        // =========================

        async function getTable(
            table,
            options = ''
        ) {

            const url =
                `${supabaseBaseUrl}/rest/v1/${table}` +
                (
                    options
                        ? `?${options}`
                        : ''
                );

            // =========================
            // تسجيل الرابط للتشخيص
            // =========================

            console.log(
                '================================'
            );

            console.log(
                'SUPABASE TABLE:',
                table
            );

            console.log(
                'SUPABASE REQUEST URL:',
                url
            );

            console.log(
                '================================'
            );

            // =========================
            // طلب Supabase
            // =========================

            const response =
                await fetch(url, {

                    method: 'GET',

                    headers: {

                        apikey:
                            SUPABASE_SERVICE_ROLE_KEY,

                        Authorization:
                            `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,

                        Accept:
                            'application/json'
                    }
                });

            // =========================
            // قراءة الرد
            // =========================

            const text =
                await response.text();

            let data = null;

            try {

                data =
                    text
                        ? JSON.parse(text)
                        : null;

            } catch {

                throw new Error(
                    `Supabase returned invalid JSON for table "${table}": ${text}`
                );

            }

            // =========================
            // لو Supabase رجع خطأ
            // =========================

            if (!response.ok) {

                console.error(
                    'SUPABASE ERROR:',
                    {
                        table,
                        status:
                            response.status,
                        statusText:
                            response.statusText,
                        response:
                            data
                    }
                );

                throw new Error(
                    data?.message ||
                    data?.error_description ||
                    data?.error ||
                    `Failed to load table "${table}"`
                );

            }

            console.log(
                `TABLE "${table}" LOADED SUCCESSFULLY`
            );

            return data;
        }

        // =====================================================
        // اختبار الجداول واحد واحد
        // =====================================================

        let products;
        let categories;
        let siteSettings;
        let shippingOptions;
        let upholsteryTypes;
        let storeColors;

        // =========================
        // PRODUCTS
        // =========================

        try {

            products =
                await getTable(
                    'products',
                    'select=*&visible=eq.true&order=created_at.desc'
                );

        } catch (error) {

            return res.status(500).json({

                success: false,

                failed_table:
                    'products',

                error:
                    error?.message ||
                    'Failed to load products'
            });

        }

        // =========================
        // CATEGORIES
        // =========================

        try {

            categories =
                await getTable(
                    'categories',
                    'select=*&visible=eq.true&order=sort_order.asc'
                );

        } catch (error) {

            return res.status(500).json({

                success: false,

                failed_table:
                    'categories',

                error:
                    error?.message ||
                    'Failed to load categories'
            });

        }

        // =========================
        // SITE SETTINGS
        // =========================

        try {

            siteSettings =
                await getTable(
                    'site_settings',
                    'select=*&id=eq.1&limit=1'
                );

        } catch (error) {

            return res.status(500).json({

                success: false,

                failed_table:
                    'site_settings',

                error:
                    error?.message ||
                    'Failed to load site settings'
            });

        }

        // =========================
        // SHIPPING OPTIONS
        // =========================

        try {

            shippingOptions =
                await getTable(
                    'shipping_options',
                    'select=*&enabled=eq.true'
                );

        } catch (error) {

            return res.status(500).json({

                success: false,

                failed_table:
                    'shipping_options',

                error:
                    error?.message ||
                    'Failed to load shipping options'
            });

        }

        // =========================
        // UPHOLSTERY TYPES
        // =========================

        try {

            upholsteryTypes =
                await getTable(
                    'upholstery_types',
                    'select=*&enabled=eq.true&order=id.asc'
                );

        } catch (error) {

            return res.status(500).json({

                success: false,

                failed_table:
                    'upholstery_types',

                error:
                    error?.message ||
                    'Failed to load upholstery types'
            });

        }

        // =========================
        // STORE COLORS
        // =========================

        try {

            storeColors =
                await getTable(
                    'store_colors',
                    'select=*&enabled=eq.true&order=id.asc'
                );

        } catch (error) {

            return res.status(500).json({

                success: false,

                failed_table:
                    'store_colors',

                error:
                    error?.message ||
                    'Failed to load store colors'
            });

        }

        // =========================
        // تقسيم الألوان
        // =========================

        const cushionColors =
            (storeColors || []).filter(
                color =>
                    color.type === 'cushion'
            );

        const wickerColors =
            (storeColors || []).filter(
                color =>
                    color.type === 'wicker'
            );

        const woodColors =
            (storeColors || []).filter(
                color =>
                    color.type === 'wood'
            );

        // =========================
        // نجاح
        // =========================

        return res.status(200).json({

            success: true,

            products:
                products || [],

            categories:
                categories || [],

            siteSettings:
                siteSettings?.[0] || {},

            shippingOptions:
                shippingOptions || [],

            upholsteryTypes:
                upholsteryTypes || [],

            cushionColors:
                cushionColors,

            wickerColors:
                wickerColors,

            woodColors:
                woodColors
        });

    } catch (error) {

        console.error(
            'STORE API FATAL ERROR:',
            error
        );

        return res.status(500).json({

            success: false,

            error:
                error?.message ||
                'Failed to load store data'
        });

    }
}
