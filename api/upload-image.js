export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });
    }

    try {
        const SUPABASE_URL = (
            process.env.SUPABASE_URL || ""
        ).replace(/\/+$/, "");

        const SUPABASE_SERVICE_ROLE_KEY =
            process.env.SUPABASE_SERVICE_ROLE_KEY || "";

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            return res.status(500).json({
                success: false,
                error: "متغيرات Supabase غير موجودة في Vercel"
            });
        }

        let body = req.body;

        if (typeof body === "string") {
            try {
                body = JSON.parse(body);
            } catch {
                return res.status(400).json({
                    success: false,
                    error: "بيانات الطلب غير صالحة"
                });
            }
        }

        const {
            fileName,
            fileType,
            fileData,
            folder = "products"
        } = body || {};

        if (
            typeof fileData !== "string" ||
            !fileData.trim()
        ) {
            return res.status(400).json({
                success: false,
                error: "لم يتم إرسال الصورة"
            });
        }

        const allowedTypes = {
            "image/jpeg": "jpg",
            "image/jpg": "jpg",
            "image/png": "png",
            "image/webp": "webp"
        };

        if (!allowedTypes[fileType]) {
            return res.status(400).json({
                success: false,
                error: "نوع الصورة غير مدعوم. استخدم JPG أو PNG أو WEBP"
            });
        }

        const destinations = {
            products: {
                bucket: "product-images",
                folder: "products",
                prefix: "product"
            },
            offers: {
                bucket: "product-images",
                folder: "offers",
                prefix: "offer"
            },
            "payment-proofs": {
                bucket: "payment-proofs",
                folder: "orders",
                prefix: "payment"
            }
        };

        const destination = destinations[folder];

        if (!destination) {
            return res.status(400).json({
                success: false,
                error: "مجلد رفع الصور غير مسموح به"
            });
        }

        const base64Data = fileData.includes(",")
            ? fileData.substring(fileData.indexOf(",") + 1)
            : fileData;

        const normalizedBase64 = base64Data.replace(/\s/g, "");

        if (
            !normalizedBase64 ||
            !/^[A-Za-z0-9+/]*={0,2}$/.test(normalizedBase64)
        ) {
            return res.status(400).json({
                success: false,
                error: "بيانات الصورة غير صالحة"
            });
        }

        const fileBuffer = Buffer.from(
            normalizedBase64,
            "base64"
        );

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

        // التحقق من نوع الملف الحقيقي لتقليل رفع ملفات غير الصور.
        const isJpeg =
            fileBuffer.length >= 3 &&
            fileBuffer[0] === 0xff &&
            fileBuffer[1] === 0xd8 &&
            fileBuffer[2] === 0xff;

        const isPng =
            fileBuffer.length >= 8 &&
            fileBuffer.subarray(0, 8).equals(
                Buffer.from([
                    0x89, 0x50, 0x4e, 0x47,
                    0x0d, 0x0a, 0x1a, 0x0a
                ])
            );

        const isWebp =
            fileBuffer.length >= 12 &&
            fileBuffer.toString("ascii", 0, 4) === "RIFF" &&
            fileBuffer.toString("ascii", 8, 12) === "WEBP";

        const actualType = isJpeg
            ? "image/jpeg"
            : isPng
                ? "image/png"
                : isWebp
                    ? "image/webp"
                    : null;

        if (!actualType) {
            return res.status(400).json({
                success: false,
                error: "محتوى الملف ليس صورة JPG أو PNG أو WEBP صالحة"
            });
        }

        if (
            actualType === "image/jpeg" &&
            !["image/jpeg", "image/jpg"].includes(fileType)
        ) {
            return res.status(400).json({
                success: false,
                error: "امتداد الصورة لا يتوافق مع محتواها"
            });
        }

        if (actualType !== fileType) {
            return res.status(400).json({
                success: false,
                error: "نوع الصورة المرسل لا يتوافق مع محتواها"
            });
        }

        const extension = allowedTypes[actualType];

        const newFileName =
            `${destination.prefix}-${Date.now()}-${Math.random()
                .toString(36)
                .substring(2, 10)}.${extension}`;

        const filePath =
            `${destination.folder}/${newFileName}`;

        const uploadUrl =
            `${SUPABASE_URL}/storage/v1/object/` +
            `${destination.bucket}/${filePath}`;

        const uploadResponse = await fetch(uploadUrl, {
            method: "POST",
            headers: {
                apikey: SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                "Content-Type": actualType,
                "x-upsert": "true"
            },
            body: fileBuffer
        });

        const responseText = await uploadResponse.text();

        if (!uploadResponse.ok) {
            console.error("SUPABASE STORAGE ERROR:", {
                status: uploadResponse.status,
                response: responseText,
                bucket: destination.bucket,
                path: filePath
            });

            let storageError = responseText;

            try {
                const parsed = JSON.parse(responseText);
                storageError =
                    parsed.message ||
                    parsed.error ||
                    responseText;
            } catch {
                // الاحتفاظ برسالة الخطأ الأصلية.
            }

            if (
                uploadResponse.status === 401 ||
                uploadResponse.status === 403
            ) {
                return res.status(502).json({
                    success: false,
                    error:
                        "Supabase رفض رفع الصورة بسبب صلاحيات المفتاح أو سياسة Storage. " +
                        "راجع مفتاح الخادم في Vercel وتأكد أنه من نفس مشروع Supabase. " +
                        "لا تنشئ سياسة رفع عامة.",
                    details: storageError
                });
            }

            return res.status(502).json({
                success: false,
                error: "فشل رفع الصورة إلى Supabase Storage",
                details: storageError
            });
        }

        const imageUrl =
            `${SUPABASE_URL}/storage/v1/object/public/` +
            `${destination.bucket}/${filePath}`;

        return res.status(200).json({
            success: true,
            message: "تم رفع الصورة بنجاح",
            image_url: imageUrl,
            bucket: destination.bucket,
            path: filePath
        });

    } catch (error) {
        console.error("UPLOAD IMAGE FUNCTION ERROR:", {
            message: error?.message || "Unknown error"
        });

        return res.status(500).json({
            success: false,
            error: "حدث خطأ أثناء رفع الصورة",
            details: error?.message || "خطأ غير معروف"
        });
    }
}
