```js
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
    // السماح بـ GET فقط
    // =========================

    if (req.method !== 'GET') {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed'
        });
    }

    try {

        const {
            SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY
        } = process.env;

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

        const supabaseBaseUrl =
            SUPABASE_URL
                .trim()
                .replace(/\/+$/, '')
                .replace(/\/rest\/v1$/i, '');

        // =========================
        // التحقق من شكل الرابط
        // =========================

        try {
            const parsedUrl = new URL(supabaseBaseUrl);

            if (!parsedUrl.hostname.endsWith('.supabase.co')) {
                throw new Error(
                    'SUPABASE_URL must be your Supabase project URL'
                );
            }

        } catch (urlError) {
            return res.status(500).json({
                success: false,
                error: 'Invalid SUPABASE_URL'
            });
        }

        // =========================
        // جلب بيانات أي جدول
        // =========================

        async function getTable(table, options = '') {

            const url =
                `${supabaseBaseUrl}/rest/v1/${table}` +
                (options ? `?${options}` : '');

            const response = await fetch(url, {
                method: 'GET',

                headers: {
                    apikey: SUPABASE_SERVICE_ROLE_KEY,

                    Authorization:
                        `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,

                    'Content-Type': 'application/json'
                }
            });

            const text = await response.text();

            let data;

            try {
                data = text ? JSON.parse(text) : null;
            } catch {
                throw new Error(
                    `Supabase returned invalid response for ${table}: ${text}`
                );
            }

            if (!response.ok) {

                throw new Error(
                    data?.message ||
                    data?.error_description ||
                    data?.error ||
                    `Failed to load ${table}`
                );
            }

            return data;
        }

        // =========================
        // تحميل كل بيانات المتجر
        // =========================

        const [
            products,
            categories,
            siteSettings,
            shippingOptions,
            upholsteryTypes,
            storeColors
        ] = await Promise.all([

            // المنتجات
            getTable(
                'products',
                'select=*&visible=eq.true&order=created_at.desc'
            ),

            // الأقسام
            getTable(
                'categories',
                'select=*&visible=eq.true&order=sort_order.asc'
            ),

            // إعدادات الموقع
            getTable(
                'site_settings',
                'select=*&id=eq.1&limit=1'
            ),

            // خيارات الشحن
            getTable(
                'shipping_options',
                'select=*&enabled=eq.true'
            ),

            // أنواع التنجيد
            getTable(
                'upholstery_types',
                'select=*&enabled=eq.true&order=id.asc'
            ),

            // الألوان
            getTable(
                'store_colors',
                'select=*&enabled=eq.true&order=id.asc'
            )
        ]);

        // =========================
        // تقسيم الألوان
        // =========================

        const cushionColors = (storeColors || []).filter(
            color => color.type === 'cushion'
        );

        const wickerColors = (storeColors || []).filter(
            color => color.type === 'wicker'
        );

        const woodColors = (storeColors || []).filter(
            color => color.type === 'wood'
        );

        // =========================
        // إرسال بيانات المتجر
        // =========================

        return res.status(200).json({

            success: true,

            products: products || [],

            categories: categories || [],

            siteSettings:
                siteSettings?.[0] || {},

            shippingOptions:
                shippingOptions || [],

            upholsteryTypes:
                upholsteryTypes || [],

            cushionColors,

            wickerColors,

            woodColors
        });

    } catch (error) {

        console.error(
            'STORE API ERROR:',
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
```
