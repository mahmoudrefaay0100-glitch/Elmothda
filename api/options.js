
export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store, max-age=0");

    try {
        const {
            SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY,
            ADMIN_EMAIL
        } = process.env;

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            return res.status(500).json({
                success: false,
                error: "متغيرات Supabase غير موجودة في Vercel"
            });
        }

        if (req.method === "OPTIONS") {
            res.setHeader(
                "Allow",
                "GET, POST, DELETE, OPTIONS"
            );
            return res.status(204).end();
        }

        const resource = req.query?.resource;
        const isColors = resource === "colors";
        const isUpholstery = resource === "upholstery-types";
        const isShipping = resource === "shipping-options";

        if (!isColors && !isUpholstery && !isShipping) {
            return res.status(400).json({
                success: false,
                error: "نوع الإعدادات غير صحيح"
            });
        }

        const table = isColors
            ? "store_colors"
            : isUpholstery
                ? "upholstery_types"
                : "shipping_options";

        const headers = {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "application/json"
        };

        async function readResponse(response) {
            const text = await response.text();

            if (!text) return null;

            try {
                return JSON.parse(text);
            } catch {
                return { message: text };
            }
        }

        function getError(data, fallback) {
            return (
                data?.message ||
                data?.error_description ||
                data?.error ||
                data?.details ||
                data?.hint ||
                fallback
            );
        }

        function parseBody() {
            if (req.body && typeof req.body === "object") {
                return req.body;
            }

            if (typeof req.body === "string") {
                try {
                    return JSON.parse(req.body);
                } catch {
                    return null;
                }
            }

            return {};
        }

        // التحقق من الجلسة وصلاحية الإدارة.
        async function verifyAdmin() {
            const authHeader = req.headers.authorization || "";
            const token = authHeader.startsWith("Bearer ")
                ? authHeader.slice(7).trim()
                : "";

            if (!token) {
                return {
                    ok: false,
                    status: 401,
                    error: "يجب تسجيل الدخول أولًا"
                };
            }

            const response = await fetch(
                `${SUPABASE_URL}/auth/v1/user`,
                {
                    method: "GET",
                    headers: {
                        apikey: SUPABASE_SERVICE_ROLE_KEY,
                        Authorization: "Bearer " + token
                    },
                    signal: AbortSignal.timeout(5000)
                }
            );

            const user = await readResponse(response);

            if (!response.ok || !user?.id) {
                return {
                    ok: false,
                    status: 401,
                    error: "جلسة الدخول غير صالحة"
                };
            }

            const expectedEmail = (
                ADMIN_EMAIL || "admin@elmothda.com"
            ).trim().toLowerCase();

            const actualEmail = String(
                user.email || ""
            ).trim().toLowerCase();

            if (!actualEmail || actualEmail !== expectedEmail) {
                return {
                    ok: false,
                    status: 403,
                    error: "ليس لديك صلاحية تنفيذ هذه العملية"
                };
            }

            return { ok: true };
        }

        // خيارات الشحن كانت تتطلب تسجيل الدخول حتى عند القراءة.
        // أما الألوان والتنجيد فتبقى قراءتهما متاحة كما كانتا.
        if (
            isShipping ||
            ["POST", "DELETE", "PUT", "PATCH"].includes(req.method)
        ) {
            const auth = await verifyAdmin();

            if (!auth.ok) {
                return res.status(auth.status).json({
                    success: false,
                    error: auth.error
                });
            }
        }

        // GET: قراءة الألوان أو أنواع التنجيد أو خيارات الشحن.
        if (req.method === "GET") {
            const filters = isColors || isUpholstery
                ? "?select=*&enabled=eq.true&order=id.asc"
                : "?select=*&order=id.asc";

            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/${table}${filters}`,
                {
                    method: "GET",
                    headers,
                    signal: AbortSignal.timeout(5000)
                }
            );

            const data = await readResponse(response);

            if (!response.ok) {
                return res.status(response.status).json({
                    success: false,
                    error: getError(data, "فشل جلب الإعدادات")
                });
            }

            const items = Array.isArray(data) ? data : [];

            if (isColors) {
                return res.status(200).json({
                    success: true,
                    colors: items
                });
            }

            if (isUpholstery) {
                return res.status(200).json({
                    success: true,
                    upholsteryTypes: items
                });
            }

            return res.status(200).json({
                success: true,
                shippingOptions: items
            });
        }

        const body = parseBody();

        if (!body) {
            return res.status(400).json({
                success: false,
                error: "بيانات الطلب ليست بصيغة JSON صحيحة"
            });
        }

        // POST: إضافة لون.
        if (req.method === "POST" && isColors) {
            const { type, name, hex, enabled } = body;

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

            if (
                !cleanName ||
                !/^#[0-9A-Fa-f]{6}$/.test(cleanHex)
            ) {
                return res.status(400).json({
                    success: false,
                    error: "كود اللون أو الاسم غير صحيح"
                });
            }

            const checkResponse = await fetch(
                `${SUPABASE_URL}/rest/v1/store_colors?select=id&type=eq.${encodeURIComponent(type)}&name=eq.${encodeURIComponent(cleanName)}&limit=1`,
                {
                    headers,
                    signal: AbortSignal.timeout(5000)
                }
            );

            const existing = await readResponse(checkResponse);

            if (!checkResponse.ok) {
                return res.status(checkResponse.status).json({
                    success: false,
                    error: getError(existing, "فشل التحقق من اللون")
                });
            }

            if (Array.isArray(existing) && existing.length) {
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
                    }),
                    signal: AbortSignal.timeout(5000)
                }
            );

            const data = await readResponse(response);

            if (!response.ok) {
                return res.status(response.status).json({
                    success: false,
                    error: getError(data, "فشل إضافة اللون")
                });
            }

            const color = Array.isArray(data) ? data[0] : data;

            return res.status(201).json({
                success: true,
                color
            });
        }

        // POST: إضافة نوع تنجيد.
        if (req.method === "POST" && isUpholstery) {
            const name =
                typeof body.name === "string"
                    ? body.name.trim()
                    : "";

            const price =
                body.price === "" ||
                body.price === null ||
                body.price === undefined
                    ? 0
                    : Number(body.price);

            if (!name) {
                return res.status(400).json({
                    success: false,
                    error: "اسم نوع التنجيد مطلوب"
                });
            }

            if (!Number.isFinite(price) || price < 0) {
                return res.status(400).json({
                    success: false,
                    error: "سعر نوع التنجيد غير صحيح"
                });
            }

            const checkResponse = await fetch(
                `${SUPABASE_URL}/rest/v1/upholstery_types?select=id,name&name=eq.${encodeURIComponent(name)}&limit=1`,
                {
                    headers,
                    signal: AbortSignal.timeout(5000)
                }
            );

            const existing = await readResponse(checkResponse);

            if (!checkResponse.ok) {
                return res.status(checkResponse.status).json({
                    success: false,
                    error: getError(existing, "فشل التحقق من نوع التنجيد")
                });
            }

            if (Array.isArray(existing) && existing.length) {
                return res.status(409).json({
                    success: false,
                    error: "نوع التنجيد موجود بالفعل: " + name
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
                        name,
                        price,
                        enabled: body.enabled !== false
                    }),
                    signal: AbortSignal.timeout(5000)
                }
            );

            const data = await readResponse(response);

            if (!response.ok) {
                return res.status(response.status).json({
                    success: false,
                    error: getError(data, "فشل حفظ نوع التنجيد")
                });
            }

            const upholsteryType =
                Array.isArray(data) ? data[0] : data;

            return res.status(201).json({
                success: true,
                upholsteryType
            });
        }

        // POST: إضافة خيار شحن.
        if (req.method === "POST" && isShipping) {
            const name =
                typeof body.name === "string"
                    ? body.name.trim()
                    : "";

            const price = Number(body.price);
            const deliveryDays = Number(body.delivery_days);

            if (
                !name ||
                body.price === "" ||
                body.price === undefined ||
                !Number.isFinite(price) ||
                price < 0
            ) {
                return res.status(400).json({
                    success: false,
                    error: "اسم خيار الشحن وسعر صحيح غير سالب مطلوبان"
                });
            }

            if (
                body.delivery_days === "" ||
                body.delivery_days === undefined ||
                !Number.isFinite(deliveryDays) ||
                deliveryDays < 0
            ) {
                return res.status(400).json({
                    success: false,
                    error: "عدد أيام التوصيل غير صحيح"
                });
            }

            const payload = {
                name,
                price,
                delivery_days: deliveryDays
            };

            if (
                body.id !== undefined &&
                body.id !== null &&
                String(body.id).trim() !== ""
            ) {
                payload.id = body.id;
            }

            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/shipping_options`,
                {
                    method: "POST",
                    headers: {
                        ...headers,
                        Prefer: "return=representation"
                    },
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(5000)
                }
            );

            const data = await readResponse(response);

            if (!response.ok) {
                return res.status(response.status).json({
                    success: false,
                    error: getError(data, "فشل إضافة خيار الشحن")
                });
            }

            const shippingOption =
                Array.isArray(data) ? data[0] : data;

            return res.status(201).json({
                success: true,
                shippingOption
            });
        }

        // DELETE: حذف عنصر من المورد المحدد.
        if (req.method === "DELETE") {
            const id = req.query?.id;

            if (
                id === undefined ||
                id === null ||
                String(id).trim() === ""
            ) {
                return res.status(400).json({
                    success: false,
                    error: "معرف العنصر المطلوب حذفه غير موجود"
                });
            }

            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(String(id))}`,
                {
                    method: "DELETE",
                    headers: {
                        ...headers,
                        Prefer: "return=representation"
                    },
                    signal: AbortSignal.timeout(5000)
                }
            );

            const data = await readResponse(response);

            if (!response.ok) {
                return res.status(response.status).json({
                    success: false,
                    error: getError(data, "فشل حذف العنصر")
                });
            }

            if (!Array.isArray(data) || data.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: "لم يتم العثور على العنصر المطلوب حذفه"
                });
            }

            return res.status(200).json({
                success: true,
                deleted: data
            });
        }

        res.setHeader("Allow", "GET, POST, DELETE, OPTIONS");

        return res.status(405).json({
            success: false,
            error: "Method Not Allowed"
        });
    } catch (error) {
        console.error(
            "OPTIONS API ERROR:",
            error?.message || "Unknown error"
        );

        return res.status(500).json({
            success: false,
            error: "حدث خطأ أثناء معالجة إعدادات المتجر"
        });
    }
}
