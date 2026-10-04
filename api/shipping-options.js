export default async function handler(req, res) {

    try {

        const {
            SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY
        } = process.env;

        if (
            !SUPABASE_URL ||
            !SUPABASE_SERVICE_ROLE_KEY
        ) {
            return res.status(500).json({
                success: false,
                error: 'بيانات Supabase غير موجودة في Vercel'
            });
        }

        // =========================
        // التحقق من تسجيل دخول الأدمن
        // =========================

        const authHeader =
            req.headers.authorization || '';

        const token =
            authHeader.startsWith('Bearer ')
                ? authHeader.substring(7)
                : null;

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'غير مصرح'
            });
        }

        const userResponse = await fetch(
            `${SUPABASE_URL}/auth/v1/user`,
            {
                method: 'GET',
                headers: {
                    apikey:
                        SUPABASE_SERVICE_ROLE_KEY,
                    Authorization:
                        'Bearer ' + token
                }
            }
        );

        const userText =
            await userResponse.text();

        let userData = {};

        try {
            userData = userText
                ? JSON.parse(userText)
                : {};
        } catch {
            userData = {};
        }

        if (
            !userResponse.ok ||
            !userData?.id
        ) {
            return res.status(401).json({
                success: false,
                error: 'جلسة الدخول غير صالحة'
            });
        }

        // =========================
        // GET
        // =========================

        if (req.method === 'GET') {

            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/shipping_options?select=*&order=id.asc`,
                {
                    method: 'GET',
                    headers: {
                        apikey:
                            SUPABASE_SERVICE_ROLE_KEY,
                        Authorization:
                            'Bearer ' +
                            SUPABASE_SERVICE_ROLE_KEY,
                        'Content-Type':
                            'application/json'
                    }
                }
            );

            const text =
                await response.text();

            let data = [];

            try {
                data = text
                    ? JSON.parse(text)
                    : [];
            } catch {
                data = [];
            }

            if (!response.ok) {
                throw new Error(
                    data?.message ||
                    data?.error ||
                    'فشل جلب بيانات الشحن'
                );
            }

            return res.status(200).json({
                success: true,
                shippingOptions:
                    data || []
            });
        }

        // =========================
        // POST
        // =========================

        if (req.method === 'POST') {

            const {
                name,
                price,
                duration,
                enabled
            } = req.body || {};

            const cleanName =
                String(name || '').trim();

            const cleanDuration =
                String(duration || '').trim();

            const cleanPrice =
                Number(price);

            if (!cleanName) {
                return res.status(400).json({
                    success: false,
                    error: 'اسم الشحن مطلوب'
                });
            }

            if (
                !Number.isFinite(cleanPrice) ||
                cleanPrice < 0
            ) {
                return res.status(400).json({
                    success: false,
                    error: 'سعر الشحن غير صحيح'
                });
            }

            if (!cleanDuration) {
                return res.status(400).json({
                    success: false,
                    error: 'مدة التوصيل مطلوبة'
                });
            }

            // =========================
            // إضافة إلى Supabase
            // =========================

            const insertResponse =
                await fetch(
                    `${SUPABASE_URL}/rest/v1/shipping_options`,
                    {
                        method: 'POST',

                        headers: {
                            apikey:
                                SUPABASE_SERVICE_ROLE_KEY,

                            Authorization:
                                'Bearer ' +
                                SUPABASE_SERVICE_ROLE_KEY,

                            'Content-Type':
                                'application/json',

                            Prefer:
                                'return=representation'
                        },

                        body: JSON.stringify({
                            name:
                                cleanName,

                            price:
                                cleanPrice,

                            duration:
                                cleanDuration,

                            enabled:
                                enabled !== false
                        })
                    }
                );

            const insertText =
                await insertResponse.text();

            let insertedData = [];

            try {
                insertedData =
                    insertText
                        ? JSON.parse(
                            insertText
                        )
                        : [];
            } catch {
                insertedData = [];
            }

            if (!insertResponse.ok) {

                throw new Error(
                    insertedData?.message ||
                    insertedData?.error ||
                    'فشل حفظ بيانات الشحن'
                );

            }

            return res.status(201).json({
                success: true,
                shippingOption:
                    Array.isArray(
                        insertedData
                    )
                        ? insertedData[0] ||
                          null
                        : insertedData
            });
        }

        // =========================
        // DELETE
        // =========================

        if (req.method === 'DELETE') {

            const id =
                req.query?.id;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error:
                        'رقم خيار الشحن غير موجود'
                });
            }

            const deleteResponse =
                await fetch(
                    `${SUPABASE_URL}/rest/v1/shipping_options?id=eq.${encodeURIComponent(id)}`,
                    {
                        method: 'DELETE',

                        headers: {
                            apikey:
                                SUPABASE_SERVICE_ROLE_KEY,

                            Authorization:
                                'Bearer ' +
                                SUPABASE_SERVICE_ROLE_KEY,

                            'Content-Type':
                                'application/json'
                        }
                    }
                );

            const deleteText =
                await deleteResponse.text();

            if (!deleteResponse.ok) {

                let deleteData = {};

                try {
                    deleteData =
                        deleteText
                            ? JSON.parse(
                                deleteText
                            )
                            : {};
                } catch {
                    deleteData = {};
                }

                throw new Error(
                    deleteData?.message ||
                    deleteData?.error ||
                    'فشل حذف بيانات الشحن'
                );
            }

            return res.status(200).json({
                success: true
            });
        }

        return res.status(405).json({
            success: false,
            error: 'Method Not Allowed'
        });

    } catch (error) {

        console.error(
            'SHIPPING OPTIONS API ERROR:',
            error
        );

        return res.status(500).json({
            success: false,
            error:
                error?.message ||
                'حدث خطأ في خادم الشحن'
        });
    }
}
