export default async function handler(req, res) {
    try {
        const {
            SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY
        } = process.env;

        if (
            !SUPABASE_URL ||
            !SUPABASE_SERVICE_ROLE_KEY
        ) {
            return res.status(500).json({
                success: false,
                error: "متغيرات Supabase غير موجودة في Vercel"
            });
        }

        const headers = {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization:
                "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "application/json"
        };

        // ========================================
        // إضافة نوع تنجيد جديد
        // ========================================
        if (req.method === "POST") {

            const {
                name,
                price,
                enabled
            } = req.body || {};

            if (!name || !String(name).trim()) {
                return res.status(400).json({
                    success: false,
                    error: "اسم نوع التنجيد مطلوب"
                });
            }

            const upholsteryPrice =
                Number(price) || 0;

            // التحقق من عدم تكرار الاسم
            const checkResponse = await fetch(
                `${SUPABASE_URL}/rest/v1/upholstery_types?select=id,name&name=eq.${encodeURIComponent(String(name).trim())}&limit=1`,
                {
                    method: "GET",
                    headers
                }
            );

            const checkText =
                await checkResponse.text();

            let existing = [];

            try {
                existing = checkText
                    ? JSON.parse(checkText)
                    : [];
            } catch {
                existing = [];
            }

            if (
                checkResponse.ok &&
                Array.isArray(existing) &&
                existing.length > 0
            ) {
                return res.status(409).json({
                    success: false,
                    error:
                        "نوع التنجيد موجود بالفعل: " +
                        String(name).trim()
                });
            }

            // إضافة الصف الجديد
            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/upholstery_types`,
                {
                    method: "POST",
                    headers: {
                        ...headers,
                        Prefer: "return=representation"
                    },
                    body: JSON.stringify({
                        name:
                            String(name).trim(),

                        price:
                            upholsteryPrice,

                        enabled:
                            enabled !== false
                    })
                }
            );

            const text =
                await response.text();

            let data = {};

            try {
                data = text
                    ? JSON.parse(text)
                    : {};
            } catch {
                data = {
                    message: text
                };
            }

            if (!response.ok) {

                console.error(
                    "SUPABASE UPHOLSTERY ERROR:",
                    data
                );

                return res.status(
                    response.status
                ).json({
                    success: false,
                    error:
                        data?.message ||
                        data?.error ||
                        data?.details ||
                        "فشل حفظ نوع التنجيد"
                });
            }

            return res.status(200).json({
                success: true,

                upholsteryType:
                    Array.isArray(data)
                        ? data[0]
                        : data
            });
        }


        // ========================================
        // جلب أنواع التنجيد
        // ========================================
        if (req.method === "GET") {

            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/upholstery_types?select=*&enabled=eq.true&order=id.asc`,
                {
                    method: "GET",
                    headers
                }
            );

            const text =
                await response.text();

            let data = [];

            try {
                data = text
                    ? JSON.parse(text)
                    : [];
            } catch {
                data = [];
            }

            if (!response.ok) {

                return res.status(
                    response.status
                ).json({
                    success: false,
                    error:
                        "فشل تحميل أنواع التنجيد"
                });
            }

            return res.status(200).json({
                success: true,
                upholsteryTypes:
                    Array.isArray(data)
                        ? data
                        : []
            });
        }


        // ========================================
        // حذف نوع تنجيد
        // ========================================
        if (req.method === "DELETE") {

            const id = req.query?.id;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: "معرف نوع التنجيد مطلوب"
                });
            }

            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/upholstery_types?id=eq.${encodeURIComponent(id)}`,
                {
                    method: "DELETE",
                    headers: {
                        ...headers,
                        Prefer: "return=representation"
                    }
                }
            );

            const text =
                await response.text();

            let data = {};

            try {
                data = text
                    ? JSON.parse(text)
                    : {};
            } catch {
                data = {
                    message: text
                };
            }

            if (!response.ok) {

                console.error(
                    "SUPABASE DELETE UPHOLSTERY ERROR:",
                    data
                );

                return res.status(
                    response.status
                ).json({
                    success: false,
                    error:
                        data?.message ||
                        data?.error ||
                        data?.details ||
                        "فشل حذف نوع التنجيد"
                });
            }

            return res.status(200).json({
                success: true,
                message: "تم حذف نوع التنجيد بنجاح",
                deleted:
                    Array.isArray(data)
                        ? data
                        : []
            });
        }


        // ========================================
        // طريقة غير مسموحة
        // ========================================
        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });

    } catch (error) {

        console.error(
            "UPHOLSTERY TYPES API ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                error?.message ||
                "حدث خطأ في الخادم"
        });
    }
}
