export default async function handler(req, res) {

    res.setHeader(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate'
    );

    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (req.method !== 'GET') {
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

        // =========================
        // رابط Supabase ثابت للتجربة
        // =========================

        const SUPABASE_BASE_URL =
            'https://kxtiqtcxkcwdvljiadfn.supabase.co';

        // =========================
        // دالة الاتصال بـ Supabase
        // =========================

        async function getTable(table, query = '') {

            const url =
                `${SUPABASE_BASE_URL}/rest/v1/${table}` +
                (query ? `?${query}` : '');

            console.log(
                'SUPABASE TEST URL:',
                url
            );

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    apikey: SUPABASE_SERVICE_ROLE_KEY,
                    Authorization:
                        `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    Accept: 'application/json'
                }
            });

            const text =
                await response.text();

            console.log(
                'SUPABASE STATUS:',
                response.status
            );

            console.log(
                'SUPABASE RESPONSE:',
                text.substring(0, 500)
            );

            let data;

            try {
                data = JSON.parse(text);
            } catch {
                throw new Error(
                    `Supabase returned non-JSON response: ${text.substring(0, 300)}`
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

        // =========================
        // اختبار المنتجات أولاً
        // =========================

        const products = await getTable(
            'products',
            'select=*'
        );

        // =========================
        // اختبار الأقسام
        // =========================

        const categories = await getTable(
            'categories',
            'select=*'
        );

        // =========================
        // باقي البيانات
        // =========================

        const siteSettings = await getTable(
            'site_settings',
            'select=*'
        );

        const shippingOptions = await getTable(
            'shipping_options',
            'select=*'
        );

        const upholsteryTypes = await getTable(
            'upholstery_types',
            'select=*'
        );

        const storeColors = await getTable(
            'store_colors',
            'select=*'
        );

        // =========================
        // تقسيم الألوان
        // =========================

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

        // =========================
        // النتيجة
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
