```js
export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });
    }

    try {
        const {
            SUPABASE_URL,
            SUPABASE_ANON_KEY,
            SUPABASE_SERVICE_ROLE_KEY
        } = process.env;

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
        // التحقق من جلسة الأدمن
        // =========================

        const authHeader =
            req.headers.authorization || "";

        const token =
            authHeader
                .replace(/^Bearer\s+/i, "")
                .trim();

        if (!token) {
            return res.status(401).json({
                success: false,
                error: "غير مصرح. سجل الدخول أولاً."
            });
        }

        const verifyResponse = await fetch(
            `${SUPABASE_URL}/auth/v1/user`,
            {
                method: "GET",
                headers: {
                    apikey: SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const verifyData =
            await verifyResponse.json();

        if (!verifyResponse.ok) {
            console.error(
                "SUPABASE USER VERIFY ERROR:",
                verifyData
            );

            return res.status(401).json({
                success: false,
                error: "جلسة الأدمن غير صالحة."
            });
        }

        // =========================
        // قراءة الصورة
        // =========================

        const formData =
            await req.formData();

        const file =
            formData.get("file");

        if (!file) {
            return res.status(400).json({
                success: false,
                error: "لم يتم اختيار صورة."
            });
        }

        if (
            !file.type ||
            !file.type.startsWith("image/")
        ) {
            return res.status(400).json({
                success: false,
                error: "الملف يجب أن يكون صورة."
            });
        }

        const maxSize =
            10 * 1024 * 1024;

        if (file.size > maxSize) {
            return res.status(400).json({
                success: false,
                error:
                    "حجم الصورة يجب ألا يتجاوز 10 ميجابايت."
            });
        }

        // =========================
        // اسم الصورة
        // =========================

        const extension =
            file.name.includes(".")
                ? file.name
                    .split(".")
                    .pop()
                    .toLowerCase()
                : "jpg";

        const fileName =
            `product-${Date.now()}-${Math.random()
                .toString(36)
                .substring(2, 10)}.${extension}`;

        const filePath =
            `products/${fileName}`;

        // =========================
        // تحويل الصورة إلى Buffer
        // =========================

        const fileBuffer =
            Buffer.from(
                await file.arrayBuffer()
            );

        // =========================
        // رفع الصورة إلى Supabase
        // =========================

        const uploadResponse =
            await fetch(
                `${SUPABASE_URL}/storage/v1/object/product-images/${filePath}`,
                {
                    method: "POST",
                    headers: {
                        apikey:
                            SUPABASE_SERVICE_ROLE_KEY,

                        Authorization:
                            `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,

                        "Content-Type":
                            file.type,

                        "x-upsert":
                            "true"
                    },

                    body: fileBuffer
                }
            );

        const uploadData =
            await uploadResponse.json();

        if (!uploadResponse.ok) {
            console.error(
                "SUPABASE IMAGE UPLOAD ERROR:",
                uploadData
            );

            return res.status(
                uploadResponse.status
            ).json({
                success: false,
                error:
                    uploadData?.message ||
                    uploadData?.error ||
                    "فشل رفع الصورة إلى Supabase"
            });
        }

        // =========================
        // رابط الصورة
        // =========================

        const imageUrl =
            `${SUPABASE_URL}/storage/v1/object/public/product-images/${filePath}`;

        return res.status(200).json({
            success: true,
            image_url: imageUrl
        });

    } catch (error) {

        console.error(
            "UPLOAD IMAGE ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                error?.message ||
                "حدث خطأ أثناء رفع الصورة"
        });
    }
}

