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

    if (req.method !== "GET") {
        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });
    }

    try {
        const {
            SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY
        } = process.env;

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            return res.status(500).json({
                success: false,
                error: "Supabase environment variables are missing"
            });
        }

        // =========================
        // جلب بيانات أي جدول
        // =========================

        async function getTable(table, options = "") {

            const url =
                `${SUPABASE_URL}/rest/v1/${table}?${options}`;

            const response = await fetch(url, {
                method: "GET",

                headers: {
                    apikey: SUPABASE_SERVICE_ROLE_KEY,

                    Authorization:
                        "Bearer " + SUPABASE_SERVICE_ROLE_KEY,

                    "Content-Type": "application/json"
                }
            });

            const text = await response.text();

            let data;

            try {
                data = JSON.parse(text);
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

            // =========================
            // المنتجات
            // =========================

            getTable(
                "products",
                "select=*&visible=eq.true&order=created_at.desc"
            ),

            // =========================
            // الأقسام
            // =========================

            getTable(
                "categories",
                "select=*&visible=eq.true&order=sort_order.asc"
            ),

            // =========================
            // إعدادات الموقع
            // =========================

            getTable(
                "site_settings",
                "select=*&id=eq.1&limit=1"
            ),

            // =========================
            // خيارات الشحن
            // =========================

            getTable(
                "shipping_options",
                "select=*&enabled=eq.true"
            ),

            // =========================
            // أنواع التنجيد
            // =========================

            getTable(
                "upholstery_types",
                "select=*&enabled=eq.true&order=id.asc"
            ),

            // =========================
            // جميع الألوان
            // =========================

            getTable(
                "store_colors",
                "select=*&enabled=eq.true&order=id.asc"
            )
        ]);

        // =========================
        // تقسيم الألوان حسب النوع
        // =========================

        const cushionColors = (storeColors || []).filter(
            color => color.type === "cushion"
        );

        const wickerColors = (storeColors || []).filter(
            color => color.type === "wicker"
        );

        const woodColors = (storeColors || []).filter(
            color => color.type === "wood"
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

            cushionColors:
                cushionColors,

            wickerColors:
                wickerColors,

            woodColors:
                woodColors
        });

    } catch (error) {

        console.error(
            "STORE API ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                error?.message ||
                "Failed to load store data"
        });
    }
}
