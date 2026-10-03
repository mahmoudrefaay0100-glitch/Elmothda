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
        // التحقق من تسجيل الدخول
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

        // التحقق من التوكن عن طريق Supabase REST API
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
            !userData ||
            !userData.id
        ) {
            return res.status(401).json({
                success: false,
                error: 'جلسة الدخول غير صالحة'
            });
        }

        // =========================
        // GET - جلب الألوان
        // =========================

        if (req.method === 'GET') {

            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/store_colors?select=*&enabled=eq.true&order=id.asc`,
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
                    'فشل جلب الألوان'
                );
            }

            return res.status(200).json({
                success: true,
                colors: data || []
            });
        }

        // =========================
        // POST - إضافة لون
        // =========================

        if (req.method === 'POST') {

            const {
                type,
                name,
                hex,
                enabled
            } = req.body || {};

            if (
                !type ||
                !name ||
                !hex
            ) {
                return res.status(400).json({
                    success: false,
                    error: 'بيانات اللون ناقصة'
                });
            }

            const validTypes = [
                'cushion',
                'wicker',
                'wood'
            ];

            if (!validTypes.includes(type)) {
                return res.status(400).json({
                    success: false,
                    error: 'نوع اللون غير صحيح'
                });
            }

            const cleanName =
                String(name).trim();

            const cleanHex =
                String(hex).trim();

            if (
                !/^#[0-9A-Fa-f]{6}$/.test(
                    cleanHex
                )
            ) {
                return res.status(400).json({
                    success: false,
                    error: 'كود اللون غير صحيح'
                });
            }

            // =========================
            // التأكد من عدم التكرار
            // =========================

            const duplicateResponse =
                await fetch(
                    `${SUPABASE_URL}/rest/v1/store_colors?select=id&type=eq.${encodeURIComponent(type)}&name=eq.${encodeURIComponent(cleanName)}&limit=1`,
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

            const duplicateText =
                await duplicateResponse.text();

            let existingColors = [];

            try {
                existingColors =
                    duplicateText
                        ? JSON.parse(
                            duplicateText
                        )
                        : [];
            } catch {
                existingColors = [];
            }

            if (!duplicateResponse.ok) {
                throw new Error(
                    existingColors?.message ||
                    existingColors?.error ||
                    'فشل التحقق من اللون'
                );
            }

            if (
                Array.isArray(existingColors) &&
                existingColors.length > 0
            ) {
                return res.status(409).json({
                    success: false,
                    error: 'هذا اللون موجود بالفعل'
                });
            }

            // =========================
            // إضافة اللون
            // =========================

            const insertResponse =
                await fetch(
                    `${SUPABASE_URL}/rest/v1/store_colors`,
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
                            type: type,
                            name: cleanName,
                            hex: cleanHex,
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
                        ? JSON.parse(insertText)
                        : [];
            } catch {
                insertedData = [];
            }

            if (!insertResponse.ok) {
                throw new Error(
                    insertedData?.message ||
                    insertedData?.error ||
                    'فشل إضافة اللون إلى قاعدة البيانات'
                );
            }

            return res.status(201).json({
                success: true,
                color:
                    Array.isArray(insertedData)
                        ? insertedData[0] || null
                        : insertedData
            });
        }

        // =========================
        // DELETE - حذف لون
        // =========================

        if (req.method === 'DELETE') {

            const id =
                req.query?.id;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'رقم اللون غير موجود'
                });
            }

            const deleteResponse =
                await fetch(
                    `${SUPABASE_URL}/rest/v1/store_colors?id=eq.${encodeURIComponent(id)}`,
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
                    'فشل حذف اللون'
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
            'COLORS API ERROR:',
            error
        );

        return res.status(500).json({
            success: false,
            error:
                error?.message ||
                'حدث خطأ في خادم الألوان'
        });
    }
}
