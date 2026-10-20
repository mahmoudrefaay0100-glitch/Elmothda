
export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");

        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
        const SUPABASE_URL = (
            process.env.SUPABASE_URL || ""
        ).replace(/\/+$/, "");

        const SUPABASE_SECRET_KEY =
            process.env.SUPABASE_SERVICE_ROLE_KEY || "";

        if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
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

        const normalizedFileType =
            fileType === "image/jpg"
                ? "image/jpeg"
                : fileType;

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
            },
            "design-previews": {
                bucket: "product-images",
                folder: "design-previews",
                prefix: "design"
            }
        };

        const destination = destinations[folder];

        if (!destination) {
            return res.status(400).json({
                success: false,
                error: "مجلد رفع الصور غير مسموح به"
            });
        }

        const commaIndex = fileData.indexOf(",");
        const base64Data = commaIndex >= 0
            ? fileData.substring(commaIndex + 1)
            : fileData;

        const normalizedBase64 = base64Data.replace(/\s/g, "");

        if (
            !normalizedBase64 ||
            !/^[A-Za-z0-9+/]*={0,2}$/.test(normalizedBase64) ||
            normalizedBase64.length % 4 === 1
        ) {
            return res.status(400).json({
                success: false,
                error: "بيانات الصورة غير صالحة"
            });
        }

        const fileBuffer = Buffer.from(normalizedBase64, "base64");

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

        // التحقق من نوع الملف الفعلي، وليس امتداده فقط.
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

        let actualType = null;

        if (isJpeg) {
            actualType = "image/jpeg";
        } else if (isPng) {
            actualType = "image/png";
        } else if (isWebp) {
            actualType = "image/webp";
        }

        if (
            !actualType ||
            actualType !== normalizedFileType
        ) {
            return res.status(400).json({
                success: false,
                error: "محتوى الصورة غير صالح أو لا يتوافق مع نوع الملف"
            });
        }

        const extension = allowedTypes[actualType];

        const safeFileName =
            `${destination.prefix}-${Date.now()}-${Math.random()
                .toString(36)
                .substring(2, 10)}.${extension}`;

        const filePath =
            `${destination.folder}/${safeFileName}`;

        const uploadUrl =
            `${SUPABASE_URL}/storage/v1/object/` +
            `${destination.bucket}/${filePath}`;

        const uploadResponse = await fetch(uploadUrl, {
            method: "POST",
            signal: controller.signal,
            headers: {
                apikey: SUPABASE_SECRET_KEY,
                Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
                "Content-Type": actualType,
                "x-upsert": "false"
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

            let details = responseText;

            try {
                const parsed = JSON.parse(responseText);
                details =
                    parsed.message ||
                    parsed.error ||
                    parsed.error_description ||
                    responseText;
            } catch {
                // الاحتفاظ برسالة الخطأ الأصلية.
            }

            return res.status(502).json({
                success: false,
                error: "فشل رفع الصورة إلى Supabase Storage",
                details,
                status: uploadResponse.status
            });
        }

        const imageUrl =
            `${SUPABASE_URL}/storage/v1/object/public/` +
            `${destination.bucket}/${filePath}`;

        // إرجاع الاسمين لدعم الأكواد الحالية والقديمة.
        return res.status(200).json({
            success: true,
            message: "تم رفع الصورة بنجاح",
            url: imageUrl,
            image_url: imageUrl,
            fileName: fileName || safeFileName,
            bucket: destination.bucket,
            path: filePath
        });

    } catch (error) {
        const timedOut = error?.name === "AbortError";

        console.error("UPLOAD IMAGE FUNCTION ERROR:", {
            message: error?.message || "Unknown error",
            timedOut
        });

        return res.status(timedOut ? 504 : 500).json({
            success: false,
            error: timedOut
                ? "انتهت مهلة الاتصال أثناء رفع الصورة"
                : "حدث خطأ أثناء رفع الصورة",
            details: error?.message || "خطأ غير معروف"
        });
    } finally {
        clearTimeout(timeout);
    }
}
