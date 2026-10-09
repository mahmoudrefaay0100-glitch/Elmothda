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

            const token = authHeader
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
                            apikey: SUPABASE_ANON_KEY,
                            Authorization: `Bearer ${token}`
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

                const user = await response.json();

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
            apikey: SUPABASE_SERVICE_ROLE_KEY,

            Authorization:
                `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,

            "Content-Type": "application/json",

            Prefer: "return=representation"
        };

        // =========================
        // دالة قراءة رسوم الصن بيدج
        // كل منتج له رسوم مستقلة
        // =========================

        function getSunbadgeFee(product, defaultValue = 1000) {
            const rawFee =
                product.sunbadge_fee ??
                product.sunbadgeFee;

            if (
                rawFee === undefined ||
                rawFee === null ||
                rawFee === ""
            ) {
                return defaultValue;
            }

            const fee = Number(rawFee);

            if (
                !Number.isFinite(fee) ||
                fee < 0
            ) {
                return null;
            }

            return fee;
        }

        // =========================
        // GET - جلب المنتجات
        // =========================

        if (req.method === "GET") {
            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/products?select=*&order=created_at.desc`,
                {
                    method: "GET",
                    headers: dbHeaders,
                    cache: "no-store"
                }
            );

            const text = await response.text();

            let data;

            try {
                data = text ? JSON.parse(text) : [];
            } catch {
                data = [];
            }

            if (!response.ok) {
                console.error(
                    "LOAD PRODUCTS ERROR:",
                    data
                );

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

                products: Array.isArray(data)
                    ? data.map(product => ({
                        ...product,
                        sunbadge_fee: Number(
                            product.sunbadge_fee ?? 1000
                        )
                    }))
                    : []
            });
        }

        // =========================
        // POST - إضافة منتج
        // =========================

        if (req.method === "POST") {
            const isAdmin = await verifyAdmin();

            if (!isAdmin) {
                return res.status(401).json({
                    success: false,
                    error:
                        "غير مصرح. يجب تسجيل الدخول كأدمن."
                });
            }

            const product = req.body || {};

            if (!product.id) {
                product.id =
                    "prod-" +
                    Date.now() +
                    "-" +
                    Math.random()
                        .toString(36)
                        .substring(2, 8);
            }

            const sunbadgeFee =
                getSunbadgeFee(product, 1000);

            if (sunbadgeFee === null) {
                return res.status(400).json({
                    success: false,
                    error:
                        "رسوم الصن بيدج يجب أن تكون رقمًا صحيحًا أو صفرًا."
                });
            }

            // =========================
            // بيانات المنتج
            // =========================

            const payload = {
                id: String(product.id),

                name:
                    product.name ||
                    product.title ||
                    "منتج جديد",

                category:
                    product.category || "",

                price: Number(
                    product.price ?? 0
                ),

                old_price: Number(
                    product.old_price ??
                    product.oldPrice ??
                    0
                ),

                // ⭐ رسوم الصن بيدج الخاصة بهذا المنتج
                sunbadge_fee: sunbadgeFee,

                sku:
                    product.sku || "",

                description:
                    product.description || "",

                specifications:
                    product.specifications || "",

                dimensions:
                    product.dimensions || "",

                chair_count: Number(
                    product.chair_count ??
                    product.chairCount ??
                    0
                ),

                sofa_2_count: Number(
                    product.sofa_2_count ?? 0
                ),

                sofa_3_count: Number(
                    product.sofa_3_count ?? 0
                ),

                table_count: Number(
                    product.table_count ?? 0
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
                    headers: {
                        ...dbHeaders,
                        Prefer:
                            "return=representation,resolution=merge-duplicates"
                    },
                    body: JSON.stringify(payload)
                }
            );

            const text = await response.text();

            let data;

            try {
                data = text ? JSON.parse(text) : [];
            } catch {
                data = [];
            }

            if (!response.ok) {
                console.error(
                    "SAVE PRODUCT ERROR:",
                    data
                );

                return res.status(
                    response.status
                ).json({
                    success: false,
                    error:
                        data?.message ||
                        data?.hint ||
                        data?.details ||
                        "Failed to save product"
                });
            }

            return res.status(200).json({
                success: true,

                product:
                    data?.[0] || payload
            });
        }

        // =========================
        // PUT - تعديل منتج
        // =========================

        if (req.method === "PUT") {
            const isAdmin = await verifyAdmin();

            if (!isAdmin) {
                return res.status(401).json({
                    success: false,
                    error:
                        "غير مصرح. يجب تسجيل الدخول كأدمن."
                });
            }

            const product = req.body || {};
            const productId = product.id;

            if (!productId) {
                return res.status(400).json({
                    success: false,
                    error: "Product ID is required"
                });
            }

            const sunbadgeFee =
                getSunbadgeFee(product, 1000);

            if (sunbadgeFee === null) {
                return res.status(400).json({
                    success: false,
                    error:
                        "رسوم الصن بيدج يجب أن تكون رقمًا صحيحًا أو صفرًا."
                });
            }

            // =========================
            // بيانات التعديل
            // =========================

            const payload = {
                name:
                    product.name ||
                    product.title ||
                    "منتج",

                category:
                    product.category || "",

                price: Number(
                    product.price ?? 0
                ),

                old_price: Number(
                    product.old_price ??
                    product.oldPrice ??
                    0
                ),

                // ⭐ حفظ رسوم الصن بيدج لهذا المنتج
                sunbadge_fee: sunbadgeFee,

                sku:
                    product.sku || "",

                description:
                    product.description || "",

                specifications:
                    product.specifications || "",

                dimensions:
                    product.dimensions || "",

                chair_count: Number(
                    product.chair_count ??
                    product.chairCount ??
                    0
                ),

                sofa_2_count: Number(
                    product.sofa_2_count ?? 0
                ),

                sofa_3_count: Number(
                    product.sofa_3_count ?? 0
                ),

                table_count: Number(
                    product.table_count ?? 0
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
                `${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(productId)}`,
                {
                    method: "PATCH",
                    headers: dbHeaders,
                    body: JSON.stringify(payload)
                }
            );

            const text = await response.text();

            let data;

            try {
                data = text ? JSON.parse(text) : [];
            } catch {
                data = [];
            }

            if (!response.ok) {
                console.error(
                    "UPDATE PRODUCT ERROR:",
                    data
                );

                return res.status(
                    response.status
                ).json({
                    success: false,
                    error:
                        data?.message ||
                        data?.hint ||
                        data?.details ||
                        "Failed to update product"
                });
            }

            if (
                !Array.isArray(data) ||
                data.length === 0
            ) {
                return res.status(404).json({
                    success: false,
                    error:
                        "المنتج غير موجود في قاعدة البيانات."
                });
            }

            return res.status(200).json({
                success: true,
                product: data[0]
            });
        }

        // =========================
        // DELETE - حذف منتج
        // =========================

        if (req.method === "DELETE") {
            const isAdmin = await verifyAdmin();

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
                    error: "Product ID is required"
                });
            }

            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(id)}`,
                {
                    method: "DELETE",
                    headers: dbHeaders
                }
            );

            if (!response.ok) {
                const text = await response.text();

                let data;

                try {
                    data = text ? JSON.parse(text) : {};
                } catch {
                    data = {};
                }

                console.error(
                    "DELETE PRODUCT ERROR:",
                    data
                );

                return res.status(
                    response.status
                ).json({
                    success: false,
                    error:
                        data?.message ||
                        data?.hint ||
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
