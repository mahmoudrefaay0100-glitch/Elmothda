export default async function handler(req, res) {

    res.setHeader(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate'
    );

    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (
        req.method !== 'GET' &&
        req.method !== 'PUT'
    ) {
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
        // رابط Supabase
        // =========================

        const SUPABASE_BASE_URL =
            'https://kxtiqtcxkcwdvljiadfn.supabase.co';

        // =========================
        // دالة الاتصال بـ Supabase
        // =========================

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
                apikey:
                    SUPABASE_SERVICE_ROLE_KEY,

                Authorization:
                    `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,

                Accept:
                    'application/json',

                'Content-Type':
                    'application/json',

                Prefer:
                    'return=representation'
            };

            const response =
                await fetch(url, {
                    method,
                    headers,
                    body:
                        body !== null
                            ? JSON.stringify(body)
                            : undefined
                });

            const text =
                await response.text();

            let data = [];

            try {
                data = text
                    ? JSON.parse(text)
                    : [];
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

        // =====================================================
        // حفظ إعدادات المتجر
        // =====================================================

        if (req.method === 'PUT') {

            const depositPercent =
                Number(
                    req.body?.depositPercent
                );

            if (
                !Number.isFinite(
                    depositPercent
                )
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        'نسبة الديبوزت غير صحيحة'
                });
            }

            if (
                depositPercent < 0 ||
                depositPercent > 100
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        'نسبة الديبوزت يجب أن تكون بين 0% و100%'
                });
            }

            const percent =
                Math.round(
                    depositPercent
                );

            // =========================
            // جلب أول إعدادات موجودة
            // =========================

            const existingSettings =
                await supabaseRequest(
                    'site_settings',
                    'GET',
                    'select=*&limit=1'
                );

            let savedSettings;

            // =========================
            // لو يوجد سجل إعدادات
            // =========================

            if (
                Array.isArray(
                    existingSettings
                ) &&
                existingSettings.length > 0
            ) {

                const existingId =
                    existingSettings[0].id;

                savedSettings =
                    await supabaseRequest(
                        'site_settings',
                        'PATCH',
                        `id=eq.${encodeURIComponent(existingId)}`,
                        {
                            deposit_percent:
                                percent
                        }
                    );

            }

            // =========================
            // لو لا يوجد سجل
            // =========================

            else {

                savedSettings =
                    await supabaseRequest(
                        'site_settings',
                        'POST',
                        '',
                        {
                            deposit_percent:
                                percent
                        }
                    );

            }

            return res.status(200).json({

                success: true,

                message:
                    'تم حفظ نسبة الديبوزت بنجاح',

                depositPercent:
                    percent,

                siteSettings:
                    Array.isArray(
                        savedSettings
                    )
                        ? (
                            savedSettings[0] ||
                            {}
                        )
                        : {}
            });
        }

        // =====================================================
        // GET
        // =====================================================

        // =========================
        // المنتجات
        // =========================

        const products =
            await supabaseRequest(
                'products',
                'GET',
                'select=*'
            );

        // =========================
        // العروض
        // =========================

        const offers =
            await supabaseRequest(
                'offers',
                'GET',
                'select=*&order=sort_order.asc,created_at.desc'
            );

        // =========================
        // الأقسام
        // =========================

        const categories =
            await supabaseRequest(
                'categories',
                'GET',
                'select=*'
            );

        // =========================
        // إعدادات الموقع
        // =========================

        const siteSettings =
            await supabaseRequest(
                'site_settings',
                'GET',
                'select=*'
            );

        // =========================
        // الشحن
        // =========================

        const shippingOptions =
            await supabaseRequest(
                'shipping_options',
                'GET',
                'select=*'
            );

        // =========================
        // أنواع التنجيد
        // =========================

        const upholsteryTypes =
            await supabaseRequest(
                'upholstery_types',
                'GET',
                'select=*'
            );

        // =========================
        // الألوان
        // =========================

        const storeColors =
            await supabaseRequest(
                'store_colors',
                'GET',
                'select=*'
            );

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
        // إعدادات الموقع
        // =========================

        const settings =
            siteSettings?.[0] || {};

        // =========================
        // نسبة الديبوزت
        // =========================

        const depositPercent =
            Number(
                settings.deposit_percent ?? 30
            );

        // =========================
        // النتيجة
        // =========================

        return res.status(200).json({

            success: true,

            // =========================
            // المنتجات
            // =========================

            products:
                products || [],

            // =========================
            // العروض
            // =========================

            offers:
                offers || [],

            // =========================
            // الأقسام
            // =========================

            categories:
                categories || [],

            // =========================
            // إعدادات الموقع
            // =========================

            siteSettings:
                settings,

            // =========================
            // نسبة الديبوزت
            // =========================

            depositPercent,

            // =========================
            // خيارات الشحن
            // =========================

            shippingOptions:
                shippingOptions || [],

            // =========================
            // أنواع التنجيد
            // =========================

            upholsteryTypes:
                upholsteryTypes || [],

            // =========================
            // ألوان التنجيد
            // =========================

            cushionColors,

            // =========================
            // ألوان الوتَر
            // =========================

            wickerColors,

            // =========================
            // ألوان الخشب
            // =========================

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
