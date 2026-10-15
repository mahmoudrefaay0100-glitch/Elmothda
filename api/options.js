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

        if (req.method === "OPTIONS") {
            res.setHeader("Allow", "GET, POST, DELETE, OPTIONS");
            return res.status(204).end();
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

        const table = isColors
            ? "store_colors"
            : "upholstery_types";

        const headers = {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "application/json"
        };

        // التحقق من جلسة المستخدم قبل أي عملية كتابة أو حذف.
        if (["POST", "DELETE", "PUT", "PATCH"].includes(req.method)) {
            const authHeader = req.headers.authorization || "";
            const token = authHeader.startsWith("Bearer ")
                ? authHeader.substring(7).trim()
                : "";

            if (!token) {
                return res.status(401).json({
                    success: false,
                    error: "يجب تسجيل الدخول أولًا"
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

            if (!authResponse.ok) {
                return res.status(401).json({
                    success: false,
                    error: "جلسة الدخول غير صالحة"
                });
            }

            const userText = await authResponse.text();
            let userData;

            try {
                userData = userText ? JSON.parse(userText) : null;
            } catch {
                userData = null;
            }

            if (!userData?.id) {
                return res.status(401).json({
                    success: false,
                    error: "تعذر التحقق من المستخدم"
                });
            }
        }

        // قراءة استجابة Supabase بأمان.
        async function readResponse(response) {
            const text = await response.text();

            if (!text) {
                return null;
            }

            try {
                return JSON.parse(text);
            } catch {
                return { message: text };
            }
        }

        function getError(data, fallback) {
            return data?.message ||
                data?.error_description ||
                data?.error ||
                data?.details ||
                data?.hint ||
                fallback;
        }

        // GET: جلب الألوان أو أنواع التنجيد المفعّلة.
        if (req.method === "GET") {
            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/${table}?select=*&enabled=eq.true&order=id.asc`,
                {
                    method: "GET",
                    headers,
                    cache: "no-store"
                }
            );

            const data = await readResponse(response);

            if (!response.ok) {
                return res.status(response.status).json({
                    success: false,
                    error: getError(
                        data,
                        isColors
                            ? "فشل جلب الألوان"
                            : "فشل تحميل أنواع التنجيد"
                    )
                });
            }

            const items = Array.isArray(data) ? data : [];

            return res.status(200).json(
                isColors
                    ? { success: true, colors: items }
                    : { success: true, upholsteryTypes: items }
            );
        }

        // POST: إضافة لون جديد.
        if (req.method === "POST" && isColors) {
            const { type, name, hex, enabled } = req.body || {};

            if (
                typeof type !== "string" ||
                typeof name !== "string" ||
                typeof hex !== "string"
            ) {
                return res.status(400).json({
                    success: false,
                    error: "بيانات اللون ناقصة أو غير صحيحة"
                });
            }

            if (!["cushion", "wicker", "wood"].includes(type)) {
                return res.status(400).json({
                    success: false,
                    error: "نوع اللون غير صحيح"
                });
            }

            const cleanName = name.trim();
            const cleanHex = hex.trim();

            if (!cleanName || !/^#[0-9A-Fa-f]{6}$/.test(cleanHex)) {
                return res.status(400).json({
                    success: false,
                    error: "كود اللون أو الاسم غير صحيح"
                });
            }

            const duplicateResponse = await fetch(
                `${SUPABASE_URL}/rest/v1/store_colors?select=id&type=eq.${encodeURIComponent(type)}&name=eq.${encodeURIComponent(cleanName)}&limit=1`,
                {
                    method: "GET",
                    headers,
                    cache: "no-store"
                }
            );

            const existingColors = await readResponse(duplicateResponse);

            if (!duplicateResponse.ok) {
                return res.status(duplicateResponse.status).json({
                    success: false,
                    error: getError(
                        existingColors,
                        "فشل التحقق من اللون"
                    )
                });
            }

            if (
                Array.isArray(existingColors) &&
                existingColors.length > 0
            ) {
                return res.status(409).json({
                    success: false,
                    error: "هذا اللون موجود بالفعل"
                });
            }

            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/store_colors`,
                {
                    method: "POST",
                    headers: {
                        ...headers,
                        Prefer: "return=representation"
                    },
                    body: JSON.stringify({
                        type,
                        name: cleanName,
                        hex: cleanHex,
                        enabled: enabled !== false
                    })
                }
            );

            const data = await readResponse(response);

            if (!response.ok) {
                return res.status(response.status).json({
                    success: false,
                    error: getError(
                        data,
                        "فشل إضافة اللون إلى قاعدة البيانات"
                    )
                });
            }

            const color = Array.isArray(data) ? data[0] : data;

            if (!color) {
                return res.status(500).json({
                    success: false,
                    error: "تم إرسال طلب الإضافة لكن لم يتم تأكيد البيانات المحفوظة"
                });
            }

            return res.status(201).json({
                success: true,
                color
            });
        }

        // POST: إضافة نوع تنجيد جديد.
        if (req.method === "POST" && isUpholstery) {
            const { name, price, enabled } = req.body || {};
            const cleanName =
                typeof name === "string" ? name.trim() : "";

            if (!cleanName) {
                return res.status(400).json({
                    success: false,
                    error: "اسم نوع التنجيد مطلوب"
                });
            }

            const upholsteryPrice =
                price === "" || price === null || price === undefined
                    ? 0
                    : Number(price);

            if (
                !Number.isFinite(upholsteryPrice) ||
                upholsteryPrice < 0
            ) {
                return res.status(400).json({
                    success: false,
                    error: "سعر نوع التنجيد غير صحيح"
                });
            }

            const checkResponse = await fetch(
                `${SUPABASE_URL}/rest/v1/upholstery_types?select=id,name&name=eq.${encodeURIComponent(cleanName)}&limit=1`,
                {
                    method: "GET",
                    headers,
                    cache: "no-store"
                }
            );

            const existing = await readResponse(checkResponse);

            if (!checkResponse.ok) {
                return res.status(checkResponse.status).json({
                    success: false,
                    error: getError(
                        existing,
                        "فشل التحقق من نوع التنجيد"
                    )
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
                    headers: {
                        ...headers,
                        Prefer: "return=representation"
                    },
                    body: JSON.stringify({
                        name: cleanName,
                        price: upholsteryPrice,
                        enabled: enabled !== false
                    })
                }
            );

            const data = await readResponse(response);

            if (!response.ok) {
                return res.status(response.status).json({
                    success: false,
                    error: getError(
                        data,
                        "فشل حفظ نوع التنجيد"
                    )
                });
            }

            const upholsteryType =
                Array.isArray(data) ? data[0] : data;

            if (!upholsteryType) {
                return res.status(500).json({
                    success: false,
                    error: "لم يتم تأكيد حفظ نوع التنجيد"
                });
            }

            return res.status(201).json({
                success: true,
                upholsteryType
            });
        }

        // DELETE: حذف لون أو نوع تنجيد.
        if (req.method === "DELETE") {
            const id = req.query?.id;

            if (
                id === undefined ||
                id === null ||
                String(id).trim() === ""
            ) {
                return res.status(400).json({
                    success: false,
                    error: isColors
                        ? "رقم اللون غير موجود"
                        : "معرف نوع التنجيد مطلوب"
                });
            }

            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(String(id))}`,
                {
                    method: "DELETE",
                    headers: {
                        ...headers,
                        Prefer: "return=representation"
                    }
                }
            );

            const data = await readResponse(response);

            if (!response.ok) {
                return res.status(response.status).json({
                    success: false,
                    error: getError(
                        data,
                        isColors
                            ? "فشل حذف اللون"
                            : "فشل حذف نوع التنجيد"
                    )
                });
            }

            if (!Array.isArray(data) || data.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: "لم يتم العثور على العنصر المطلوب حذفه"
                });
            }

            return res.status(200).json(
                isColors
                    ? {
                        success: true,
                        deleted: data
                    }
                    : {
                        success: true,
                        message: "تم حذف نوع التنجيد بنجاح",
                        deleted: data
                    }
            );
        }

        res.setHeader("Allow", "GET, POST, DELETE, OPTIONS");

        return res.status(405).json({
            success: false,
            error: "Method Not Allowed"
        });
    } catch (error) {
        console.error("OPTIONS API ERROR:", error);

        return res.status(500).json({
            success: false,
            error: error?.message ||
                "حدث خطأ في إعدادات الألوان والتنجيد"
        });
    }
}
