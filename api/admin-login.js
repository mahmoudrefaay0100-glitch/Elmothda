export default async function handler(req, res) {
    // =========================
    // السماح بـ POST فقط
    // =========================
    if (req.method !== "POST") {
        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });
    }

    try {
        // =========================
        // بيانات تسجيل الدخول
        // =========================
        const { email, password } = req.body || {};

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: "البريد الإلكتروني وكلمة المرور مطلوبان"
            });
        }

        // =========================
        // Supabase
        // =========================
        const SUPABASE_URL =
            process.env.SUPABASE_URL;

        const SUPABASE_ANON_KEY =
            process.env.SUPABASE_ANON_KEY;

        if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
            return res.status(500).json({
                success: false,
                error:
                    "SUPABASE_URL أو SUPABASE_ANON_KEY غير موجود في Vercel"
            });
        }

        // =========================
        // تسجيل الدخول في Supabase
        // =========================
        const response = await fetch(
            `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "apikey": SUPABASE_ANON_KEY
                },

                body: JSON.stringify({
                    email: String(email).trim(),
                    password: String(password)
                })
            }
        );

        const data = await response.json();

        // =========================
        // فشل تسجيل الدخول
        // =========================
        if (!response.ok) {
            console.error(
                "SUPABASE LOGIN ERROR:",
                data
            );

            return res.status(401).json({
                success: false,
                error:
                    data?.error_description ||
                    data?.msg ||
                    data?.message ||
                    "البريد الإلكتروني أو كلمة المرور غير صحيحة"
            });
        }

        // =========================
        // التأكد من وجود Access Token
        // =========================
        if (!data?.access_token) {
            console.error(
                "SUPABASE LOGIN ERROR: Access token missing",
                data
            );

            return res.status(401).json({
                success: false,
                error:
                    "تم تسجيل الدخول لكن لم يتم الحصول على Access Token"
            });
        }

        // =========================
        // إرسال بيانات الجلسة
        // =========================
        return res.status(200).json({
            success: true,

            access_token:
                data.access_token,

            refresh_token:
                data.refresh_token || "",

            token_type:
                data.token_type || "bearer",

            expires_in:
                data.expires_in || null,

            expires_at:
                data.expires_at || null,

            user: {
                id:
                    data.user?.id || null,

                email:
                    data.user?.email || email
            }
        });

    } catch (error) {

        console.error(
            "ADMIN LOGIN ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                error?.message ||
                "حدث خطأ في الخادم"
        });
    }
}
