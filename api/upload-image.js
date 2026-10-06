```javascript
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
            fileData,
            folder = "products"
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

        /*
         * تحديد مكان التخزين
         *
         * products
         * -> product-images / products
         *
         * offers
         * -> product-images / offers
         *
         * payment-proofs
         * -> payment-proofs / orders
         */

        let bucketName;
        let folderName;

        if (folder === "payment-proofs") {

            bucketName = "payment-proofs";
            folderName = "orders";

        } else if (folder === "offers") {

            bucketName = "product-images";
            folderName = "offers";

        } else {

            bucketName = "product-images";
            folderName = "products";
        }

        const base64Data =
            fileData.includes(",")
                ? fileData.split(",")[1]
                : fileData;

        const fileBuffer =
            Buffer.from(
                base64Data,
                "base64"
            );

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
            fileName &&
            fileName.includes(".")
                ? fileName
                    .split(".")
                    .pop()
                    .toLowerCase()
                : "jpg";

        const safeExtension =
            [
                "jpg",
                "jpeg",
                "png",
                "webp"
            ].includes(extension)
                ? extension
                : "jpg";

        const prefix =
            folder === "payment-proofs"
                ? "payment"
                : folder === "offers"
                    ? "offer"
                    : "product";

        const newFileName =
            `${prefix}-${Date.now()}-${Math.random()
                .toString(36)
                .substring(2, 10)}.${safeExtension}`;

        const filePath =
            `${folderName}/${newFileName}`;

        /*
         * رفع الصورة إلى Supabase Storage
         */

        const uploadResponse =
            await fetch(
                `${SUPABASE_URL}/storage/v1/object/${bucketName}/${filePath}`,
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

                    body:
                        fileBuffer
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
                message:
                    responseText
            };
        }

        /*
         * فشل رفع الصورة
         */

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

        /*
         * رابط الصورة العام
         */

        const imageUrl =
            `${SUPABASE_URL}/storage/v1/object/public/${bucketName}/${filePath}`;

        return res.status(200).json({

            success: true,

            image_url:
                imageUrl,

            bucket:
                bucketName,

            path:
                filePath

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
```
