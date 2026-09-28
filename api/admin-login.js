export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    try {
        const { email, password } = req.body || {};

        if (!email || !password) {
            return res.status(400).json({
                error: "البريد الإلكتروني وكلمة المرور مطلوبان."
            });
        }

        const adminEmail = process.env.ADMIN_EMAIL;
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

        // التأكد من وجود إعدادات السيرفر
        if (!adminEmail || !supabaseUrl || !supabaseAnonKey) {
            console.error("Missing environment variables");

            return res.status(500).json({
                error: "إعدادات تسجيل الدخول غير مكتملة على السيرفر."
            });
        }

        // التأكد أن البريد هو بريد الأدمن
        if (email.trim().toLowerCase() !== adminEmail.trim().toLowerCase()) {
            return res.status(401).json({
                error: "البريد الإلكتروني غير مسموح له بالدخول."
            });
        }

        // تسجيل الدخول في Supabase
        const response = await fetch(
            `${supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=password`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "apikey": supabaseAnonKey
                },
                body: JSON.stringify({
                    email: email.trim(),
                    password: password
                })
            }
        );

        const data = await response.json();

        console.log("Supabase login status:", response.status);
        console.log("Supabase login response:", {
            error: data?.error,
            error_code: data?.error_code,
            message: data?.msg || data?.message
        });

        if (!response.ok || !data.access_token) {
            return res.status(401).json({
                error:
                    data?.msg ||
                    data?.message ||
                    data?.error_description ||
                    "فشل تسجيل الدخول في Supabase."
            });
        }

        return res.status(200).json({
            access_token: data.access_token,
            refresh_token: data.refresh_token
        });

    } catch (error) {
        console.error("Admin login error:", error);

        return res.status(500).json({
            error: "حدث خطأ أثناء الاتصال بـ Supabase."
        });
    }
}
