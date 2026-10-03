export default async function handler(req, res) {
    try {
        const {
            SUPABASE_URL,
            SUPABASE_ANON_KEY,
            SUPABASE_SERVICE_ROLE_KEY
        } = process.env;

        // =========================
        // التأكد من إعدادات Supabase
        // =========================

        if (
            !SUPABASE_URL ||
            !SUPABASE_ANON_KEY ||
            !SUPABASE_SERVICE_ROLE_KEY
        ) {
            return res.status(500).json({
                success: false,
                error: "Supabase environment variables are missing"
            });
        }

        // =========================
        // التحقق من الأدمن
        // =========================

        async function verifyAdmin() {

            const authHeader =
                req.headers.authorization || "";

            const token =
                authHeader
                    .replace(/^Bearer\s+/i, "")
                    .trim();

            if (!token) {
                console.error(
                    "ADMIN VERIFY: No token received"
                );

                return false;
            }

            try {

                const response = await fetch(
                    `${SUPABASE_URL}/auth/v1/user`,
                    {
                        method: "GET",

                        headers: {
                            apikey:
                                SUPABASE_ANON_KEY,

                            Authorization:
                                `Bearer ${token}`
                        }
                    }
                );

                if (!response.ok) {

                    const errorText =
                        await response.text();

                    console.error(
                        "ADMIN VERIFY ERROR:",
                        response.status,
                        errorText
                    );

                    return false;
                }

                const user =
                    await response.json();

                if (!user?.id) {
                    console.error(
                        "ADMIN VERIFY: User ID missing"
                    );

                    return false;
                }

                console.log(
                    "ADMIN VERIFIED:",
                    user.email
                );

                return true;

            } catch (error) {

                console.error(
                    "ADMIN VERIFY EXCEPTION:",
                    error
                );

                return false;
            }
        }

        // =========================
        // Headers قاعدة البيانات
        // =========================

        const dbHeaders = {
            apikey:
                SUPABASE_SERVICE_ROLE_KEY,

            Authorization:
                `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,

            "Content-Type":
                "application/json",

            Prefer:
                "return=representation"
        };

        // =========================
        // GET - جلب المنتجات
        // =========================

        if (req.method === "GET") {

            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/products?select=*&order=created_at.desc`,
                {
                    method: "GET",
                    headers: dbHeaders
                }
            );

            const data =
                await response.json();

            if (!response.ok) {

                return res.status(
                    response.status
                ).json({
                    success: false,
                    error:
                        data?.message ||
                        data?.hint ||
                        "Failed to load products"
                });
            }

            return res.status(200).json({
                success: true,
                products: data || []
            });
        }

        // =========================
        // POST - إضافة منتج
        // =========================

        if (req.method === "POST") {

            const isAdmin =
                await verifyAdmin();

            if (!isAdmin) {

                return res.status(401).json({
                    success: false,
                    error:
                        "غير مصرح. يجب تسجيل الدخول كأدمن."
                });
            }

            const product =
                req.body || {};

            // إنشاء ID تلقائي
            if (!product.id) {

                product.id =
                    "prod-" +
                    Date.now() +
                    "-" +
                    Math.random()
                        .toString(36)
                        .substring(2, 8);
            }

            const payload = {

                id:
                    String(product.id),

                name:
                    product.name ||
                    product.title ||
                    "منتج جديد",

                category:
                    product.category || "",

                price:
                    Number(
                        product.price || 0
                    ),

                old_price:
                    Number(
                        product.old_price ||
                        product.oldPrice ||
                        0
                    ),

                sku:
                    product.sku || "",

                description:
                    product.description || "",

                specifications:
                    product.specifications || "",

                dimensions:
                    product.dimensions || "",

                chair_count:
                    Number(
                        product.chair_count ||
                        product.chairCount ||
                        0
                    ),

                image_url:
                    product.image_url ||
                    product.imageUrl ||
                    "",

                visible:
                    product.visible !== false,

                featured:
                    product.featured === true,

                updated_at:
                    new Date().toISOString()
            };

            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/products?on_conflict=id`,
                {
                    method: "POST",

                    headers:
                        dbHeaders,

                    body:
                        JSON.stringify(
                            payload
                        )
                }
            );

            const data =
                await response.json();

            if (!response.ok) {

                return res.status(
                    response.status
                ).json({
                    success: false,
                    error:
                        data?.message ||
                        data?.hint ||
                        "Failed to save product"
                });
            }

            return res.status(200).json({
                success: true,

                product:
                    data?.[0] ||
                    payload
            });
        }

        // =========================
        // PUT - تعديل منتج
        // =========================

        if (req.method === "PUT") {

            const isAdmin =
                await verifyAdmin();

            if (!isAdmin) {

                return res.status(401).json({
                    success: false,
                    error:
                        "غير مصرح. يجب تسجيل الدخول كأدمن."
                });
            }

            const product =
                req.body || {};

            const productId =
                product.id;

            if (!productId) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Product ID is required"
                });
            }

            const payload = {

                name:
                    product.name ||
                    "منتج",

                category:
                    product.category || "",

                price:
                    Number(
                        product.price || 0
                    ),

                old_price:
                    Number(
                        product.old_price || 0
                    ),

                sku:
                    product.sku || "",

                description:
                    product.description || "",

                specifications:
                    product.specifications || "",

                dimensions:
                    product.dimensions || "",

                chair_count:
                    Number(
                        product.chair_count || 0
                    ),

                image_url:
                    product.image_url || "",

                visible:
                    product.visible !== false,

                featured:
                    product.featured === true,

                updated_at:
                    new Date().toISOString()
            };

            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(productId)}`,
                {
                    method: "PATCH",

                    headers:
                        dbHeaders,

                    body:
                        JSON.stringify(
                            payload
                        )
                }
            );

            const data =
                await response.json();

            if (!response.ok) {

                return res.status(
                    response.status
                ).json({
                    success: false,
                    error:
                        data?.message ||
                        data?.hint ||
                        "Failed to update product"
                });
            }

            return res.status(200).json({
                success: true,

                product:
                    data?.[0] || {
                        id:
                            productId,

                        ...payload
                    }
            });
        }

        // =========================
        // DELETE - حذف منتج
        // =========================

        if (req.method === "DELETE") {

            const isAdmin =
                await verifyAdmin();

            if (!isAdmin) {

                return res.status(401).json({
                    success: false,
                    error:
                        "غير مصرح. يجب تسجيل الدخول كأدمن."
                });
            }

            const id =
                req.query?.id ||
                req.body?.id;

            if (!id) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Product ID is required"
                });
            }

            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(id)}`,
                {
                    method: "DELETE",

                    headers:
                        dbHeaders
                }
            );

            if (!response.ok) {

                const data =
                    await response.json();

                return res.status(
                    response.status
                ).json({
                    success: false,
                    error:
                        data?.message ||
                        "Failed to delete product"
                });
            }

            return res.status(200).json({
                success: true,
                deleted: id
            });
        }

        // =========================
        // Method غير مسموح
        // =========================

        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });

    } catch (error) {

        console.error(
            "PRODUCTS API ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                error?.message ||
                "Server error"
        });
    }
}
