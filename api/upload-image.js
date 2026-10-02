export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });
    }

    try {
        const token = req.headers.authorization?.replace("Bearer ", "");

        if (!token) {
            return res.status(401).json({
                success: false,
                error: "غير مصرح"
            });
        }

        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!SUPABASE_URL || !SERVICE_KEY) {
            return res.status(500).json({
                success: false,
                error: "إعدادات Supabase غير موجودة في Vercel"
            });
        }

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

        const cleanBase64 = base64.includes(",")
            ? base64.split(",")[1]
            : base64;

        const buffer = Buffer.from(cleanBase64, "base64");

        const safeName = fileName
            .replace(/[^a-zA-Z0-9._-]/g, "-");

        const path = `categories/${Date.now()}-${safeName}`;

        const uploadResponse = await fetch(
            `${SUPABASE_URL}/storage/v1/object/product-images/${path}`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${SERVICE_KEY}`,
                    "apikey": SERVICE_KEY,
                    "Content-Type": contentType,
                    "x-upsert": "true"
                },
                body: buffer
            }
        );

        const uploadText = await uploadResponse.text();

        if (!uploadResponse.ok) {
            console.error("SUPABASE UPLOAD ERROR:", uploadText);

            return res.status(500).json({
                success: false,
                error: "فشل رفع الصورة إلى Supabase",
                details: uploadText
            });
        }

        const publicUrl =
            `${SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;

        return res.status(200).json({
            success: true,
            url: publicUrl
        });

    } catch (error) {
        console.error("UPLOAD IMAGE ERROR:", error);

        return res.status(500).json({
            success: false,
            error: error?.message || "حدث خطأ في السيرفر"
        });
    }
}
