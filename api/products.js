
export default async function handler(req, res) {
    try {
        const {
            SUPABASE_URL,
            SUPABASE_ANON_KEY,
            SUPABASE_SERVICE_ROLE_KEY
        } = process.env;

        // =========================================
        // إعدادات Supabase
        // =========================================

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

        const SUPABASE = SUPABASE_URL.replace(/\/+$/, "");

        // =========================================
        // التحقق من جلسة الأدمن
        // =========================================

        async function verifyAdmin() {
            const authHeader =
                req.headers.authorization || "";

            const token = authHeader
                .replace(/^Bearer\s+/i, "")
                .trim();

            if (!token) return false;

            try {
                const response = await fetch(
                    `${SUPABASE}/auth/v1/user`,
                    {
                        method: "GET",
                        headers: {
                            apikey: SUPABASE_ANON_KEY,
                            Authorization: `Bearer ${token}`
                        },
                        cache: "no-store"
                    }
                );

                if (!response.ok) return false;

                const user = await response.json();

                if (!user?.id || !user?.email) {
                    return false;
                }

                // السماح لحساب الأدمن المحدد فقط.
                // اضبط ADMIN_EMAIL في متغيرات البيئة.
                const adminEmail = String(
                    process.env.ADMIN_EMAIL || ""
                ).trim().toLowerCase();

                if (
                    !adminEmail ||
                    String(user.email).toLowerCase() !== adminEmail
                ) {
                    console.error(
                        "PRODUCTS API: User is not the configured admin."
                    );
                    return false;
                }

                return true;
            } catch (error) {
                console.error("ADMIN VERIFY ERROR:", error);
                return false;
            }
        }

        // =========================================
        // Headers قاعدة البيانات
        // =========================================

        const dbHeaders = {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=representation"
        };

        // =========================================
        // قراءة رسوم صن بيدج
        // لا توجد رسوم افتراضية مخفية
        // =========================================

        function readSunbadgeFee(product) {
            const rawFee =
                product.sunbadge_fee ??
                product.sunbadgeFee;

            // إذا لم تُرسل قيمة صريحة، نعتبرها صفرًا.
            if (
                rawFee === undefined ||
                rawFee === null ||
                rawFee === ""
            ) {
                return 0;
            }

            const fee = Number(rawFee);

            if (!Number.isFinite(fee) || fee < 0) {
                return null;
            }

            return fee;
        }

        // =========================================
        // التحقق من الأرقام
        // =========================================

        function readNonNegativeNumber(value, fallback = 0) {
            if (
                value === undefined ||
                value === null ||
                value === ""
            ) {
                return fallback;
            }

            const number = Number(value);

            if (!Number.isFinite(number) || number < 0) {
                return null;
            }

            return number;
        }

        // =========================================
        // إعداد بيانات المنتج
        // =========================================

        function buildProductPayload(product, options = {}) {
            const {
                includeId = false,
                existingProduct = null
            } = options;

const rawSunbadgeFee =
    product.sunbadge_fee ??
    product.sunbadgeFee ??
    product.sunbadge_unit_fee ??
    product.sunbadgeUnitFee;

const sunbadgeFee =
    rawSunbadgeFee === undefined ||
    rawSunbadgeFee === null ||
    rawSunbadgeFee === ""
        ? (
            existingProduct?.sunbadge_fee ??
            existingProduct?.sunbadgeFee ??
            0
        )
        : Number(rawSunbadgeFee);

if (
    !Number.isFinite(Number(sunbadgeFee)) ||
    Number(sunbadgeFee) < 0
) {
    throw new Error(
        "رسوم الصن بيدج يجب أن تكون رقمًا صحيحًا أو صفرًا."
    );
}



            if (sunbadgeFee === null) {
                throw new Error(
                    "رسوم الصن بيدج يجب أن تكون رقمًا صحيحًا أو صفرًا."
                );
            }

            const price = readNonNegativeNumber(product.price);
            const oldPrice = readNonNegativeNumber(
                product.old_price ?? product.oldPrice
            );

            const chairCount = readNonNegativeNumber(
                product.chair_count ?? product.chairCount
            );

            const sofa2Count = readNonNegativeNumber(
                product.sofa_2_count ??
                product.sofa2Count
            );

            const sofa3Count = readNonNegativeNumber(
                product.sofa_3_count ??
                product.sofa3Count
            );

            const tableCount = readNonNegativeNumber(
                product.table_count ??
                product.tableCount
            );

            if (
                price === null ||
                oldPrice === null ||
                chairCount === null ||
                sofa2Count === null ||
                sofa3Count === null ||
                tableCount === null
            ) {
                throw new Error(
                    "السعر أو أعداد القطع يجب أن تكون أرقامًا صحيحة غير سالبة."
                );
            }

            const name = String(
                product.name ??
                product.title ??
                existingProduct?.name ??
                ""
            ).trim();

            const category = String(
                product.category ??
                existingProduct?.category ??
                ""
            ).trim();

            if (!name) {
                throw new Error("اسم المنتج مطلوب.");
            }

            if (!category) {
                throw new Error("قسم المنتج مطلوب.");
            }

            const payload = {
                name,
                category,
                price,
                old_price: oldPrice,

                // الرسوم الخاصة بالمنتج نفسه
                sunbadge_fee: sunbadgeFee,

                sku: String(
                    product.sku ??
                    existingProduct?.sku ??
                    ""
                ),

                description: String(
                    product.description ??
                    existingProduct?.description ??
                    ""
                ),

                specifications: String(
                    product.specifications ??
                    existingProduct?.specifications ??
                    ""
                ),

                dimensions: String(
                    product.dimensions ??
                    existingProduct?.dimensions ??
                    ""
                ),

                chair_count: chairCount,
                sofa_2_count: sofa2Count,
                sofa_3_count: sofa3Count,
                table_count: tableCount,

                image_url: String(
                    product.image_url ??
                    product.imageUrl ??
                    existingProduct?.image_url ??
                    existingProduct?.imageUrl ??
                    ""
                ),

                visible:
                    product.visible === undefined
                        ? (existingProduct?.visible !== false)
                        : product.visible === true,

                featured:
                    product.featured === undefined
                        ? (existingProduct?.featured === true)
                        : product.featured === true,

                updated_at: new Date().toISOString()
            };

            if (includeId) {
                payload.id = String(product.id);
            }

            return payload;
        }

        // =========================================
        // GET - جلب المنتجات
        // =========================================

        if (req.method === "GET") {
            const response = await fetch(
                `${SUPABASE}/rest/v1/products?select=*&order=created_at.desc`,
                {
                    method: "GET",
                    headers: dbHeaders,
                    cache: "no-store"
                }
            );

            const responseText = await response.text();

            let data;

            try {
                data = responseText
                    ? JSON.parse(responseText)
                    : [];
            } catch {
                data = [];
            }

            if (!response.ok) {
                console.error("LOAD PRODUCTS ERROR:", data);

                return res.status(response.status).json({
                    success: false,
                    error:
                        data?.message ||
                        data?.hint ||
                        "Failed to load products"
                });
            }

            const products = Array.isArray(data)
                ? data.map(product => ({
                    ...product,

                    // إظهار القيمة المحفوظة فعليًا.
                    // لا نستخدم 1000 كقيمة افتراضية.
                    sunbadge_fee: Number(
                        product.sunbadge_fee ?? 0
                    )
                }))
                : [];

            return res.status(200).json({
                success: true,
                products
            });
        }

        // =========================================
        // POST - إضافة منتج
        // =========================================

        if (req.method === "POST") {
            const isAdmin = await verifyAdmin();

            if (!isAdmin) {
                return res.status(401).json({
                    success: false,
                    error: "غير مصرح. يجب تسجيل الدخول بحساب الأدمن."
                });
            }

            const product = req.body || {};

            const productId = String(
                product.id ||
                (
                    "prod-" +
                    Date.now() +
                    "-" +
                    Math.random().toString(36).substring(2, 8)
                )
            ).trim();

            let payload;

            try {
                payload = buildProductPayload(product, {
                    includeId: true
                });
            } catch (error) {
                return res.status(400).json({
                    success: false,
                    error: error.message
                });
            }

            payload.id = productId;

            const response = await fetch(
                `${SUPABASE}/rest/v1/products?on_conflict=id`,
                {
                    method: "POST",
                    headers: {
                        ...dbHeaders,
                        Prefer:
                            "return=representation,resolution=merge-duplicates"
                    },
                    body: JSON.stringify(payload),
                    cache: "no-store"
                }
            );

            const responseText = await response.text();

            let data;

            try {
                data = responseText
                    ? JSON.parse(responseText)
                    : [];
            } catch {
                data = [];
            }

            if (!response.ok) {
                console.error("SAVE PRODUCT ERROR:", data);

                return res.status(response.status).json({
                    success: false,
                    error:
                        data?.message ||
                        data?.hint ||
                        data?.details ||
                        "Failed to save product"
                });
            }

            const savedProduct = Array.isArray(data)
                ? data[0]
                : null;

            if (!savedProduct) {
                return res.status(500).json({
                    success: false,
                    error:
                        "تم إرسال المنتج لكن لم يرجع السيرفر بيانات المنتج المحفوظ."
                });
            }

            console.log("PRODUCT SAVED:", {
                id: savedProduct.id,
                sunbadge_fee: savedProduct.sunbadge_fee
            });

            return res.status(200).json({
                success: true,
                product: {
                    ...savedProduct,
                    sunbadge_fee: Number(
                        savedProduct.sunbadge_fee ?? 0
                    )
                }
            });
        }

        // =========================================
        // PUT - تعديل منتج
        // =========================================

        if (req.method === "PUT") {
            const isAdmin = await verifyAdmin();

            if (!isAdmin) {
                return res.status(401).json({
                    success: false,
                    error: "غير مصرح. يجب تسجيل الدخول بحساب الأدمن."
                });
            }

            const product = req.body || {};
            const productId = String(product.id || "").trim();

            if (!productId) {
                return res.status(400).json({
                    success: false,
                    error: "معرّف المنتج مطلوب."
                });
            }

            // جلب المنتج الحالي حتى لا نفقد حقولًا
            // إذا لم تكن موجودة في طلب التعديل.
            const existingResponse = await fetch(
                `${SUPABASE}/rest/v1/products?id=eq.${encodeURIComponent(productId)}&select=*`,
                {
                    method: "GET",
                    headers: dbHeaders,
                    cache: "no-store"
                }
            );

            const existingText = await existingResponse.text();

            let existingData;

            try {
                existingData = existingText
                    ? JSON.parse(existingText)
                    : [];
            } catch {
                existingData = [];
            }

            if (!existingResponse.ok) {
                return res.status(existingResponse.status).json({
                    success: false,
                    error:
                        existingData?.message ||
                        existingData?.hint ||
                        "تعذر قراءة بيانات المنتج الحالية."
                });
            }

            const existingProduct = Array.isArray(existingData)
                ? existingData[0]
                : null;

            if (!existingProduct) {
                return res.status(404).json({
                    success: false,
                    error: "المنتج غير موجود في قاعدة البيانات."
                });
            }

            let payload;

            try {
                payload = buildProductPayload(product, {
                    existingProduct
                });
            } catch (error) {
                return res.status(400).json({
                    success: false,
                    error: error.message
                });
            }

            const response = await fetch(
                `${SUPABASE}/rest/v1/products?id=eq.${encodeURIComponent(productId)}`,
                {
                    method: "PATCH",
                    headers: dbHeaders,
                    body: JSON.stringify(payload),
                    cache: "no-store"
                }
            );

            const responseText = await response.text();

            let data;

            try {
                data = responseText
                    ? JSON.parse(responseText)
                    : [];
            } catch {
                data = [];
            }

            if (!response.ok) {
                console.error("UPDATE PRODUCT ERROR:", data);

                return res.status(response.status).json({
                    success: false,
                    error:
                        data?.message ||
                        data?.hint ||
                        data?.details ||
                        "Failed to update product"
                });
            }

            if (!Array.isArray(data) || data.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: "لم يتم تعديل المنتج في قاعدة البيانات."
                });
            }

            const savedProduct = data[0];

            console.log("PRODUCT UPDATED:", {
                id: savedProduct.id,
                sunbadge_fee: savedProduct.sunbadge_fee
            });

            return res.status(200).json({
                success: true,
                product: {
                    ...savedProduct,
                    sunbadge_fee: Number(
                        savedProduct.sunbadge_fee ?? 0
                    )
                }
            });
        }

        // =========================================
        // DELETE - حذف منتج
        // =========================================

        if (req.method === "DELETE") {
            const isAdmin = await verifyAdmin();

            if (!isAdmin) {
                return res.status(401).json({
                    success: false,
                    error: "غير مصرح. يجب تسجيل الدخول بحساب الأدمن."
                });
            }

            const id = String(
                req.query?.id ||
                req.body?.id ||
                ""
            ).trim();

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: "معرّف المنتج مطلوب."
                });
            }

            const response = await fetch(
                `${SUPABASE}/rest/v1/products?id=eq.${encodeURIComponent(id)}`,
                {
                    method: "DELETE",
                    headers: dbHeaders,
                    cache: "no-store"
                }
            );

            if (!response.ok) {
                const responseText = await response.text();

                let data;

                try {
                    data = responseText
                        ? JSON.parse(responseText)
                        : {};
                } catch {
                    data = {};
                }

                console.error("DELETE PRODUCT ERROR:", data);

                return res.status(response.status).json({
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

        // =========================================
        // طريقة غير مدعومة
        // =========================================

        res.setHeader("Allow", "GET, POST, PUT, DELETE");

        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });

    } catch (error) {
        console.error("PRODUCTS API ERROR:", error);

        return res.status(500).json({
            success: false,
            error: error?.message || "Server error"
        });
    }
}
