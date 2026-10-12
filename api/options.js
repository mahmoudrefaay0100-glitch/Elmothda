
export default async function handler(req, res) {
    try {
        const {
            SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY
        } = process.env;

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            return res.status(500).json({
                success: false,
                error: "متغيرات Supabase غير موجودة في Vercel"
            });
        }

        const resource = req.query?.resource;
        const isColors = resource === "colors";
        const isUpholstery = resource === "upholstery-types";

        if (!isColors && !isUpholstery) {
            return res.status(400).json({
                success: false,
                error: "نوع الإعدادات غير صحيح"
            });
        }

        const headers = {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "application/json"
        };

        // التحقق من تسجيل الدخول للألوان كما في الكود الأصلي.
        if (isColors) {
            const authHeader = req.headers.authorization || "";
            const token = authHeader.startsWith("Bearer ")
                ? authHeader.substring(7)
                : null;

            if (!token) {
                return res.status(401).json({
                    success: false,
                    error: "غير مصرح"
                });
            }

            const authResponse = await fetch(
                `${SUPABASE_URL}/auth/v1/user`,
                {
                    method: "GET",
                    headers: {
                        apikey: SUPABASE_SERVICE_ROLE_KEY,
                        Authorization: "Bearer " + token
                    }
                }
            );

            const authText = await authResponse.text();
            let userData = {};

            try {
                userData = authText ? JSON.parse(authText) : {};
            } catch {
                userData = {};
            }

            if (!authResponse.ok || !userData?.id) {
                return res.status(401).json({
                    success: false,
                    error: "جلسة الدخول غير صالحة"
                });
            }
        }

        const table = isColors ? "store_colors" : "upholstery_types";

        // GET: جلب البيانات.
        if (req.method === "GET") {
            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/${table}?select=*&enabled=eq.true&order=id.asc`,
                { method: "GET", headers }
            );

            const text = await response.text();
            let data = [];

            try {
                data = text ? JSON.parse(text) : [];
            } catch {
                data = [];
            }

            if (!response.ok) {
                return res.status(response.status).json({
                    success: false,
                    error: data?.message || data?.error ||
                        (isColors ? "فشل جلب الألوان" : "فشل تحميل أنواع التنجيد")
                });
            }

            return res.status(200).json(
                isColors
                    ? { success: true, colors: Array.isArray(data) ? data : [] }
                    : { success: true, upholsteryTypes: Array.isArray(data) ? data : [] }
            );
        }

        // POST: إضافة لون.
        if (req.method === "POST" && isColors) {
            const { type, name, hex, enabled } = req.body || {};

            if (!type || !name || !hex) {
                return res.status(400).json({
                    success: false,
                    error: "بيانات اللون ناقصة"
                });
            }

            if (!["cushion", "wicker", "wood"].includes(type)) {
                return res.status(400).json({
                    success: false,
                    error: "نوع اللون غير صحيح"
                });
            }

            const cleanName = String(name).trim();
            const cleanHex = String(hex).trim();

            if (!cleanName || !/^#[0-9A-Fa-f]{6}$/.test(cleanHex)) {
                return res.status(400).json({
                    success: false,
                    error: "كود اللون أو الاسم غير صحيح"
                });
            }

            const duplicateResponse = await fetch(
                `${SUPABASE_URL}/rest/v1/store_colors?select=id&type=eq.${encodeURIComponent(type)}&name=eq.${encodeURIComponent(cleanName)}&limit=1`,
                { method: "GET", headers }
            );

            const duplicateText = await duplicateResponse.text();
            let existingColors = [];

            try {
                existingColors = duplicateText ? JSON.parse(duplicateText) : [];
            } catch {
                existingColors = [];
            }

            if (!duplicateResponse.ok) {
                return res.status(duplicateResponse.status).json({
                    success: false,
                    error: existingColors?.message || existingColors?.error ||
                        "فشل التحقق من اللون"
                });
            }

            if (Array.isArray(existingColors) && existingColors.length > 0) {
                return res.status(409).json({
                    success: false,
                    error: "هذا اللون موجود بالفعل"
                });
            }

            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/store_colors`,
                {
                    method: "POST",
                    headers: { ...headers, Prefer: "return=representation" },
                    body: JSON.stringify({
                        type,
                        name: cleanName,
                        hex: cleanHex,
                        enabled: enabled !== false
                    })
                }
            );

            const text = await response.text();
            let data = [];

            try {
                data = text ? JSON.parse(text) : [];
            } catch {
                data = [];
            }

            if (!response.ok) {
                return res.status(response.status).json({
                    success: false,
                    error: data?.message || data?.error ||
                        "فشل إضافة اللون إلى قاعدة البيانات"
                });
            }

            return res.status(201).json({
                success: true,
                color: Array.isArray(data) ? data[0] || null : data
            });
        }

        // POST: إضافة نوع تنجيد.
        if (req.method === "POST" && isUpholstery) {
            const { name, price, enabled } = req.body || {};
            const cleanName = String(name || "").trim();

            if (!cleanName) {
                return res.status(400).json({
                    success: false,
                    error: "اسم نوع التنجيد مطلوب"
                });
            }

            const upholsteryPrice = Number(price) || 0;

            if (!Number.isFinite(upholsteryPrice) || upholsteryPrice < 0) {
                return res.status(400).json({
                    success: false,
                    error: "سعر نوع التنجيد غير صحيح"
                });
            }

            const checkResponse = await fetch(
                `${SUPABASE_URL}/rest/v1/upholstery_types?select=id,name&name=eq.${encodeURIComponent(cleanName)}&limit=1`,
                { method: "GET", headers }
            );

            const checkText = await checkResponse.text();
            let existing = [];

            try {
                existing = checkText ? JSON.parse(checkText) : [];
            } catch {
                existing = [];
            }

            if (!checkResponse.ok) {
                return res.status(checkResponse.status).json({
                    success: false,
                    error: existing?.message || existing?.error ||
                        "فشل التحقق من نوع التنجيد"
                });
            }

            if (Array.isArray(existing) && existing.length > 0) {
                return res.status(409).json({
                    success: false,
                    error: "نوع التنجيد موجود بالفعل: " + cleanName
                });
            }

            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/upholstery_types`,
                {
                    method: "POST",
                    headers: { ...headers, Prefer: "return=representation" },
                    body: JSON.stringify({
                        name: cleanName,
                        price: upholsteryPrice,
                        enabled: enabled !== false
                    })
                }
            );

            const text = await response.text();
            let data = {};

            try {
                data = text ? JSON.parse(text) : {};
            } catch {
                data = { message: text };
            }

            if (!response.ok) {
                return res.status(response.status).json({
                    success: false,
                    error: data?.message || data?.error || data?.details ||
                        "فشل حفظ نوع التنجيد"
                });
            }

            return res.status(200).json({
                success: true,
                upholsteryType: Array.isArray(data) ? data[0] : data
            });
        }

        // DELETE: حذف لون أو نوع تنجيد.
        if (req.method === "DELETE") {
            const id = req.query?.id;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: isColors ? "رقم اللون غير موجود" : "معرف نوع التنجيد مطلوب"
                });
            }

            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
                {
                    method: "DELETE",
                    headers: {
                        ...headers,
                        ...(isUpholstery ? { Prefer: "return=representation" } : {})
                    }
                }
            );

            const text = await response.text();
            let data = {};

            try {
                data = text ? JSON.parse(text) : {};
            } catch {
                data = { message: text };
            }

            if (!response.ok) {
                return res.status(response.status).json({
                    success: false,
                    error: data?.message || data?.error || data?.details ||
                        (isColors ? "فشل حذف اللون" : "فشل حذف نوع التنجيد")
                });
            }

            return res.status(200).json(
                isColors
                    ? { success: true }
                    : {
                        success: true,
                        message: "تم حذف نوع التنجيد بنجاح",
                        deleted: Array.isArray(data) ? data : []
                    }
            );
        }

        return res.status(405).json({
            success: false,
            error: "Method Not Allowed"
        });
    } catch (error) {
        console.error("OPTIONS API ERROR:", error);

        return res.status(500).json({
            success: false,
            error: error?.message || "حدث خطأ في إعدادات الألوان والتنجيد"
        });
    }
}
