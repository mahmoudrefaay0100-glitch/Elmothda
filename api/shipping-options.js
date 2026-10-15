export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    try {
        const {
            SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY
        } = process.env;

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            return res.status(500).json({
                success: false,
                error: 'بيانات Supabase غير موجودة في Vercel'
            });
        }

        // =====================================
        // التحقق من تسجيل دخول الأدمن
        // =====================================

        const authHeader =
            req.headers.authorization || '';

        const token = authHeader.startsWith('Bearer ')
            ? authHeader.substring(7).trim()
            : null;

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'غير مصرح: يرجى تسجيل الدخول'
            });
        }

        const userResponse = await fetch(
            `${SUPABASE_URL}/auth/v1/user`,
            {
                method: 'GET',
                headers: {
                    apikey: SUPABASE_SERVICE_ROLE_KEY,
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const userText = await userResponse.text();

        let userData = {};

        try {
            userData = userText
                ? JSON.parse(userText)
                : {};
        } catch {
            userData = {};
        }

        if (!userResponse.ok || !userData?.id) {
            return res.status(401).json({
                success: false,
                error: 'جلسة الدخول غير صالحة، سجل الدخول مرة أخرى'
            });
        }

        // =====================================
        // أدوات مساعدة للتعامل مع Supabase
        // =====================================

        async function readResponse(response) {
            const text = await response.text();

            if (!text) {
                return null;
            }

            try {
                return JSON.parse(text);
            } catch {
                return text;
            }
        }

        function getErrorMessage(data, fallback) {
            if (typeof data === 'string' && data.trim()) {
                return data;
            }

            return (
                data?.message ||
                data?.error_description ||
                data?.details ||
                data?.hint ||
                data?.error ||
                fallback
            );
        }

        function supabaseHeaders(extra = {}) {
            return {
                apikey: SUPABASE_SERVICE_ROLE_KEY,
                Authorization:
                    `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
                ...extra
            };
        }

        // =====================================
        // GET - جلب خيارات الشحن
        // =====================================

        if (req.method === 'GET') {
            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/shipping_options?select=*&order=id.asc`,
                {
                    method: 'GET',
                    headers: supabaseHeaders()
                }
            );

            const data = await readResponse(response);

            if (!response.ok) {
                console.error(
                    'SHIPPING OPTIONS GET ERROR:',
                    data
                );

                return res.status(502).json({
                    success: false,
                    error: getErrorMessage(
                        data,
                        'فشل جلب بيانات الشحن من قاعدة البيانات'
                    )
                });
            }

            return res.status(200).json({
                success: true,
                shippingOptions: Array.isArray(data)
                    ? data
                    : []
            });
        }

        // =====================================
        // POST - إضافة خيار شحن
        // =====================================

        if (req.method === 'POST') {
            let body = req.body || {};

            if (typeof body === 'string') {
                try {
                    body = JSON.parse(body);
                } catch {
                    return res.status(400).json({
                        success: false,
                        error: 'بيانات الإضافة غير صالحة'
                    });
                }
            }

            const {
                id,
                name,
                price,
                delivery_days,
                description,
                enabled
            } = body;

            const cleanId =
                String(id || '').trim() ||
                (
                    'ship-' +
                    Date.now() +
                    '-' +
                    Math.random()
                        .toString(36)
                        .slice(2, 8)
                );

            const cleanName =
                typeof name === 'string'
                    ? name.trim()
                    : '';

            const cleanDescription =
                typeof description === 'string'
                    ? description.trim()
                    : '';

            const cleanDeliveryDays =
                String(delivery_days ?? '').trim();

            if (!cleanName) {
                return res.status(400).json({
                    success: false,
                    error: 'اسم الشحن مطلوب'
                });
            }

            if (
                price === '' ||
                price === null ||
                price === undefined
            ) {
                return res.status(400).json({
                    success: false,
                    error: 'سعر الشحن مطلوب'
                });
            }

            const cleanPrice = Number(price);

            if (
                !Number.isFinite(cleanPrice) ||
                cleanPrice < 0
            ) {
                return res.status(400).json({
                    success: false,
                    error: 'سعر الشحن غير صحيح'
                });
            }

            if (!cleanDeliveryDays) {
                return res.status(400).json({
                    success: false,
                    error: 'مدة التوصيل مطلوبة'
                });
            }

            const payload = {
                id: cleanId,
                name: cleanName,
                description: cleanDescription,
                price: cleanPrice,
                delivery_days: cleanDeliveryDays,
                enabled: enabled !== false
            };

            const insertResponse = await fetch(
                `${SUPABASE_URL}/rest/v1/shipping_options`,
                {
                    method: 'POST',
                    headers: supabaseHeaders({
                        Prefer: 'return=representation'
                    }),
                    body: JSON.stringify(payload)
                }
            );

            const insertedData =
                await readResponse(insertResponse);

            if (!insertResponse.ok) {
                console.error(
                    'SHIPPING OPTIONS INSERT ERROR:',
                    insertedData
                );

                return res.status(502).json({
                    success: false,
                    error: getErrorMessage(
                        insertedData,
                        'فشل حفظ بيانات الشحن'
                    )
                });
            }

            const savedOption = Array.isArray(insertedData)
                ? insertedData[0] || null
                : insertedData;

            return res.status(201).json({
                success: true,
                shippingOption: savedOption
            });
        }

        // =====================================
        // DELETE - حذف خيار شحن
        // =====================================

        if (req.method === 'DELETE') {
            const id =
                req.query?.id;

            if (
                id === undefined ||
                id === null ||
                String(id).trim() === ''
            ) {
                return res.status(400).json({
                    success: false,
                    error: 'رقم خيار الشحن غير موجود'
                });
            }

            const deleteUrl =
                `${SUPABASE_URL}/rest/v1/shipping_options` +
                `?id=eq.${encodeURIComponent(String(id))}` +
                '&select=id';

            const deleteResponse = await fetch(
                deleteUrl,
                {
                    method: 'DELETE',
                    headers: supabaseHeaders({
                        Prefer: 'return=representation'
                    })
                }
            );

            const deletedData =
                await readResponse(deleteResponse);

            if (!deleteResponse.ok) {
                console.error(
                    'SHIPPING OPTIONS DELETE ERROR:',
                    deletedData
                );

                return res.status(502).json({
                    success: false,
                    error: getErrorMessage(
                        deletedData,
                        'فشل حذف بيانات الشحن'
                    )
                });
            }

            if (
                Array.isArray(deletedData) &&
                deletedData.length === 0
            ) {
                return res.status(404).json({
                    success: false,
                    error: 'خيار الشحن غير موجود أو تم حذفه بالفعل'
                });
            }

            return res.status(200).json({
                success: true,
                message: 'تم حذف خيار الشحن بنجاح'
            });
        }

        // =====================================
        // الطرق غير المدعومة
        // =====================================

        res.setHeader('Allow', 'GET, POST, DELETE');

        return res.status(405).json({
            success: false,
            error: 'طريقة الطلب غير مدعومة'
        });

    } catch (error) {
        console.error(
            'SHIPPING OPTIONS API ERROR:',
            error?.message || error
        );

        return res.status(500).json({
            success: false,
            error: 'حدث خطأ داخلي أثناء معالجة بيانات الشحن'
        });
    }
}
