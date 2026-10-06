export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });
    }

    try {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_SERVICE_ROLE_KEY =
            process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            return res.status(500).json({
                success: false,
                error: "متغيرات Supabase غير موجودة في Vercel"
            });
        }

        const {
            fileName,
            fileType,
            fileData,
            folder = "products"
        } = req.body || {};

        if (!fileData) {
            return res.status(400).json({
                success: false,
                error: "لم يتم إرسال الصورة"
            });
        }

        if (!fileType || !fileType.startsWith("image/")) {
            return res.status(400).json({
                success: false,
                error: "الملف يجب أن يكون صورة"
            });
        }

        let bucketName = "product-images";
        let folderName = "products";
        let prefix = "product";

        if (folder === "offers") {
            bucketName = "product-images";
            folderName = "offers";
            prefix = "offer";
        }

        if (folder === "payment-proofs") {
            bucketName = "payment-proofs";
            folderName = "orders";
            prefix = "payment";
        }

        const base64Data = fileData.includes(",")
            ? fileData.split(",")[1]
            : fileData;

        const fileBuffer = Buffer.from(base64Data, "base64");

        if (!fileBuffer.length) {
            return res.status(400).json({
                success: false,
                error: "الصورة فارغة أو غير صالحة"
            });
        }

        if (fileBuffer.length > 10 * 1024 * 1024) {
            return res.status(400).json({
                success: false,
                error: "حجم الصورة يجب ألا يتجاوز 10 ميجابايت"
            });
        }

        const extension =
            fileName && fileName.includes(".")
                ? fileName.split(".").pop().toLowerCase()
                : "jpg";

        const safeExtension = [
            "jpg",
            "jpeg",
            "png",
            "webp"
        ].includes(extension)
            ? extension
            : "jpg";

        const newFileName =
            `${prefix}-${Date.now()}-${Math.random()
                .toString(36)
                .substring(2, 10)}.${safeExtension}`;

        const filePath = `${folderName}/${newFileName}`;

        const uploadUrl =
            `${SUPABASE_URL}/storage/v1/object/${bucketName}/${filePath}`;

        const uploadResponse = await fetch(uploadUrl, {
            method: "POST",
            headers: {
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization":
                    `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                "Content-Type": fileType,
                "x-upsert": "true"
            },
            body: fileBuffer
        });

        const responseText = await uploadResponse.text();

        if (!uploadResponse.ok) {
            console.error(
                "SUPABASE STORAGE ERROR:",
                responseText
            );

            return res.status(uploadResponse.status).json({
                success: false,
                error:
                    responseText ||
                    "فشل رفع الصورة إلى Supabase Storage"
            });
        }

        const imageUrl =
            `${SUPABASE_URL}/storage/v1/object/public/${bucketName}/${filePath}`;

        return res.status(200).json({
            success: true,
            image_url: imageUrl,
            bucket: bucketName,
            path: filePath
        });

    } catch (error) {
        console.error(
            "UPLOAD IMAGE FUNCTION ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                error?.message ||
                "حدث خطأ أثناء تشغيل رفع الصورة"
        });
    }
}
