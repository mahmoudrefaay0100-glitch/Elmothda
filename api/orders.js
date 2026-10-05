export default async function handler(req, res) {
    try {

        const SUPABASE_URL =
            'https://kxtiqtcxkcwdvljiadfn.supabase.co';

        const SUPABASE_SERVICE_ROLE_KEY =
            process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!SUPABASE_SERVICE_ROLE_KEY) {
            return res.status(500).json({
                success: false,
                error: 'SUPABASE_SERVICE_ROLE_KEY is missing'
            });
        }

        // =====================================================
        // التحقق من الأدمن
        // مطلوب لجلب الطلبات وتعديلها
        // =====================================================

        const authHeader =
            req.headers.authorization || '';

        const token =
            authHeader.startsWith('Bearer ')
                ? authHeader.substring(7)
                : '';


        // =====================================================
        // إنشاء طلب جديد
        // POST /api/orders
        // متاح للعميل بدون تسجيل دخول
        // =====================================================

        if (req.method === 'POST') {

            const order =
                req.body || {};

            if (!order.id) {
                return res.status(400).json({
                    success: false,
                    error: 'رقم الطلب غير موجود'
                });
            }

            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/orders`,
                {
                    method: 'POST',

                    headers: {
                        apikey:
                            SUPABASE_SERVICE_ROLE_KEY,

                        Authorization:
                            `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,

                        'Content-Type':
                            'application/json',

                        Prefer:
                            'return=representation'
                    },

                    body: JSON.stringify({

                        id:
                            order.id,

                        order_number:
                            order.id,

                        customer_name:
                            order.customer?.name || '',

                        phone:
                            order.customer?.phone || '',

                        whatsapp:
                            order.customer?.phone || '',

                        governorate:
                            order.customer?.gov || '',

                        city:
                            order.customer?.city || '',

                        address:
                            order.customer?.address || '',

                        location:
                            '',

                        items:
                            order.items || [],

                        subtotal:
                            Number(
                                order.subtotal ??
                                order.total ??
                                0
                            ),

                        shipping_cost:
                            Number(
                                order.shippingCost ??
                                0
                            ),

                        discount:
                            Number(
                                order.discount ??
                                0
                            ),

                        total:
                            Number(
                                order.total ??
                                0
                            ),

                        shipping_method:
                            order.shippingMethod ||
                            '',

                        payment_method:
                            order.paymentMethod ||
                            'Visa / Mastercard',

                        deposit_percent:
                            Number(
                                order.depositPercent ??
                                30
                            ),

                        deposit_amount:
                            Number(
                                order.depositAmount ??
                                0
                            ),

                        remaining_amount:
                            Number(
                                order.remainingAmount ??
                                0
                            ),

                        payment_status:
                            order.paymentStatus ||
                            'Pending',

                        payment_proof_url:
                            order.paymentProofUrl ||
                            '',

                        status:
                            order.status ||
                            'New'
                    })
                }
            );

            const text =
                await response.text();

            let data = [];

            try {
                data =
                    text
                        ? JSON.parse(text)
                        : [];
            } catch {
                data = [];
            }

            if (!response.ok) {

                console.error(
                    'SUPABASE CREATE ORDER ERROR:',
                    data
                );

                return res.status(
                    response.status
                ).json({
                    success: false,
                    error:
                        data?.message ||
                        data?.error ||
                        'فشل حفظ الطلب'
                });
            }

            return res.status(201).json({
                success: true,

                order:
                    Array.isArray(data)
                        ? data[0]
                        : data
            });
        }


        // =====================================================
        // التحقق من الأدمن
        // GET و PUT
        // =====================================================

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'غير مصرح'
            });
        }


        // =====================================================
        // جلب جميع الطلبات
        // GET /api/orders
        // =====================================================

        if (req.method === 'GET') {

            const response =
                await fetch(
                    `${SUPABASE_URL}/rest/v1/orders?select=*&order=created_at.desc`,
                    {
                        method: 'GET',

                        headers: {
                            apikey:
                                SUPABASE_SERVICE_ROLE_KEY,

                            Authorization:
                                `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,

                            'Content-Type':
                                'application/json'
                        }
                    }
                );

            const text =
                await response.text();

            let data = [];

            try {
                data =
                    text
                        ? JSON.parse(text)
                        : [];
            } catch {
                data = [];
            }

            if (!response.ok) {

                console.error(
                    'SUPABASE GET ORDERS ERROR:',
                    data
                );

                return res.status(
                    response.status
                ).json({
                    success: false,
                    error:
                        data?.message ||
                        data?.error ||
                        'فشل جلب الطلبات'
                });
            }

            return res.status(200).json({
                success: true,
                orders:
                    Array.isArray(data)
                        ? data
                        : []
            });
        }


        // =====================================================
        // تحديث حالة الطلب
        // PUT /api/orders?id=ORDER_ID
        // =====================================================

        if (req.method === 'PUT') {

            const orderId =
                req.query?.id;

            if (!orderId) {
                return res.status(400).json({
                    success: false,
                    error:
                        'رقم الطلب غير موجود'
                });
            }

            const {
                status
            } =
                req.body || {};

            const allowedStatuses = [
                'New',
                'Confirmed',
                'Shipped',
                'Delivered',
                'Cancelled'
            ];

            if (
                !allowedStatuses.includes(
                    status
                )
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        'حالة الطلب غير صحيحة'
                });
            }

            const response =
                await fetch(
                    `${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,
                    {
                        method: 'PATCH',

                        headers: {
                            apikey:
                                SUPABASE_SERVICE_ROLE_KEY,

                            Authorization:
                                `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,

                            'Content-Type':
                                'application/json',

                            Prefer:
                                'return=representation'
                        },

                        body: JSON.stringify({
                            status:
                                status
                        })
                    }
                );

            const text =
                await response.text();

            let data = [];

            try {
                data =
                    text
                        ? JSON.parse(text)
                        : [];
            } catch {
                data = [];
            }

            if (!response.ok) {

                return res.status(
                    response.status
                ).json({
                    success: false,
                    error:
                        data?.message ||
                        data?.error ||
                        'فشل تحديث حالة الطلب'
                });
            }

            if (
                !Array.isArray(data) ||
                data.length === 0
            ) {
                return res.status(404).json({
                    success: false,
                    error:
                        'الطلب غير موجود في قاعدة البيانات'
                });
            }

            return res.status(200).json({
                success: true,
                order:
                    data[0]
            });
        }


        // =====================================================
        // أي Method آخر
        // =====================================================

        return res.status(405).json({
            success: false,
            error:
                'Method not allowed'
        });

    } catch (error) {

        console.error(
            'ORDERS API ERROR:',
            error
        );

        return res.status(500).json({
            success: false,
            error:
                error?.message ||
                'حدث خطأ في نظام الطلبات'
        });
    }
}
