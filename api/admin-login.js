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

        if (!adminEmail || email.trim().toLowerCase() !== adminEmail.trim().toLowerCase()) {
            return res.status(401).json({
                error: "غير مسموح بالدخول."
            });
        }

        const response = await fetch(
            `${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "apikey": process.env.SUPABASE_ANON_KEY
                },
                body: JSON.stringify({
                    email: email.trim(),
                    password: password
                })
            }
        );

        const data = await response.json();

        if (!response.ok || !data.access_token) {
            return res.status(401).json({
                error: "البريد الإلكتروني أو كلمة المرور غير صحيحة."
            });
        }

        return res.status(200).json({
            access_token: data.access_token,
            refresh_token: data.refresh_token
        });

    } catch (error) {
        console.error("Admin login error:", error);

        return res.status(500).json({
            error: "حدث خطأ في تسجيل الدخول."
        });
    }
}
