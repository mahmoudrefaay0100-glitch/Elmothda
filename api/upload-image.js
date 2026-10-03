export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });
    }

    try {
        const SUPABASE_URL =
            process.env.SUPABASE_URL;

        const SUPABASE_SERVICE_ROLE_KEY =
            process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (
            !SUPABASE_URL ||
            !SUPABASE_SERVICE_ROLE_KEY
        ) {
            return res.status(500).json({
                success: false,
                error:
                    "متغيرات Supabase غير موجودة في Vercel"
            });
        }

        const {
            fileName,
            fileType,
            fileData
        } = req.body || {};

        if (!fileData) {
            return res.status(400).json({
                success: false,
                error: "لم يتم إرسال الصورة"
            });
        }

        if (
            !fileType ||
            !fileType.startsWith("image/")
        ) {
            return res.status(400).json({
                success: false,
                error: "الملف يجب أن يكون صورة"
            });
        }

        const base64Data =
            fileData.includes(",")
                ? fileData.split(",")[1]
                : fileData;

        const fileBuffer =
            Buffer.from(base64Data, "base64");

        if (
            fileBuffer.length >
            10 * 1024 * 1024
        ) {
            return res.status(400).json({
                success: false,
                error:
                    "حجم الصورة يجب ألا يتجاوز 10 ميجابايت"
            });
        }

        const extension =
            fileName && fileName.includes(".")
                ? fileName
                    .split(".")
                    .pop()
                    .toLowerCase()
                : "jpg";

        const newFileName =
            `product-${Date.now()}-${Math.random()
                .toString(36)
                .substring(2, 10)}.${extension}`;

        const filePath =
            `products/${newFileName}`;

        const uploadResponse =
            await fetch(
                `${SUPABASE_URL}/storage/v1/object/product-images/${filePath}`,
                {
                    method: "POST",

                    headers: {
                        apikey:
                            SUPABASE_SERVICE_ROLE_KEY,

                        Authorization:
                            "Bearer " +
                            SUPABASE_SERVICE_ROLE_KEY,

                        "Content-Type":
                            fileType,

                        "x-upsert":
                            "true"
                    },

                    body: fileBuffer
                }
            );

        const responseText =
            await uploadResponse.text();

        let uploadData = {};

        try {
            uploadData =
                responseText
                    ? JSON.parse(responseText)
                    : {};
        } catch {
            uploadData = {
                message: responseText
            };
        }

        if (!uploadResponse.ok) {
            console.error(
                "SUPABASE STORAGE ERROR:",
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
