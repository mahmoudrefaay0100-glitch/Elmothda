export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });
    }

    try {
        const { email, password } = req.body || {};

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: "البريد الإلكتروني وكلمة المرور مطلوبان"
            });
        }

        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

        if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
            return res.status(500).json({
                success: false,
                error: "SUPABASE_URL أو SUPABASE_ANON_KEY غير موجود في Vercel"
            });
        }

        const response = await fetch(
            `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "apikey": SUPABASE_ANON_KEY
                },
                body: JSON.stringify({
                    email,
                    password
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            return res.status(401).json({
                success: false,
                error:
                    data?.error_description ||
                    data?.msg ||
                    data?.message ||
                    "البريد الإلكتروني أو كلمة المرور غير صحيحة"
            });
        }

        return res.status(200).json({
            success: true,
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            user: {
                id: data.user?.id,
                email: data.user?.email
            }
        });

    } catch (error) {
        console.error("ADMIN LOGIN ERROR:", error);

        return res.status(500).json({
            success: false,
            error: error?.message || "حدث خطأ في الخادم"
        });
    }
}
