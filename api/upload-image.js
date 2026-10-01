export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });
    }

    try {
        const token =
            req.headers.authorization?.replace("Bearer ", "");

        if (!token) {
            return res.status(401).json({
                success: false,
                error: "غير مصرح"
            });
        }

        const SUPABASE_URL =
            process.env.SUPABASE_URL;

        const SERVICE_KEY =
            process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!SUPABASE_URL || !SERVICE_KEY) {
            return res.status(500).json({
                success: false,
                error: "بيانات Supabase غير موجودة في Vercel"
            });
        }

        // =========================
        // التحقق من جلسة الأدمن
        // =========================

        const userResponse = await fetch(
            `${SUPABASE_URL}/auth/v1/user`,
            {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "apikey": SERVICE_KEY
                }
            }
        );

        if (!userResponse.ok) {
            const userError =
                await userResponse.text();

            console.error(
                "AUTH ERROR:",
                userError
            );

            return res.status(401).json({
                success: false,
                error: "جلسة تسجيل الدخول غير صالحة"
            });
        }

        // =========================
        // قراءة بيانات الصورة
        // =========================

        const body = req.body || {};

        const {
            fileName,
            contentType,
            base64
        } = body;

        if (!fileName || !contentType || !base64) {
            return res.status(400).json({
                success: false,
                error: "بيانات الصورة ناقصة"
            });
        }

        // =========================
        // تحويل Base64 إلى ملف
        // =========================

        const cleanBase64 =
            base64.includes(",")
                ? base64.split(",")[1]
                : base64;

        const buffer =
            Buffer.from(cleanBase64, "base64");

        if (!buffer || buffer.length === 0) {
            return res.status(400).json({
                success: false,
                error: "الصورة فارغة أو غير صالحة"
            });
        }

        // =========================
        // اسم آمن للصورة
        // =========================

        const safeName =
            fileName.replace(
                /[^a-zA-Z0-9._-]/g,
                "-"
            );

        const path =
            `products/${Date.now()}-${safeName}`;

        // =========================
        // رفع الصورة إلى Supabase
        // =========================

        const uploadResponse =
            await fetch(
                `${SUPABASE_URL}/storage/v1/object/product-images/${path}`,
                {
                    method: "POST",
                    headers: {
                        "Authorization":
                            `Bearer ${SERVICE_KEY}`,

                        "apikey":
                            SERVICE_KEY,

                        "Content-Type":
                            contentType,

                        "x-upsert":
                            "true"
                    },
                    body: buffer
                }
            );

        const uploadData =
            await uploadResponse.text();

        // =========================
        // إظهار الخطأ الحقيقي
        // =========================

        if (!uploadResponse.ok) {

            console.error(
                "IMAGE UPLOAD ERROR:",
                uploadData
            );

            return res.status(
                uploadResponse.status
            ).json({
                success: false,
                error:
                    uploadData ||
                    "فشل رفع الصورة إلى Supabase"
            });
        }

        // =========================
        // رابط الصورة
        // =========================

        const publicUrl =
            `${SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;

        return res.status(200).json({
            success: true,
            url: publicUrl
        });

    } catch (error) {

        console.error(
            "UPLOAD ERROR:",
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
