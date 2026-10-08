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
        // قراءة بيانات المصادقة الخاصة بالأدمن
        // =====================================================

        const authHeader =
            req.headers.authorization ||
            req.headers.Authorization ||
            '';

        const adminToken =
            req.headers['x-admin-token'] || '';

        const token =
            adminToken ||
            authHeader
                .replace(/^Bearer\s+/i, '')
                .trim();


        // =====================================================
        // ⭐ تتبع الطلب للعميل
        //
        // GET /api/orders?track=ORDER_ID
        //
        // هذا الجزء موجود قبل فحص Admin Token
        // حتى يستطيع العميل تتبع طلبه بدون تسجيل دخول.
        // =====================================================

      // =====================================================
// PUBLIC ORDER TRACKING - FULL DETAILS
// =====================================================
if (
    req.method === 'GET' &&
    req.query &&
    req.query.track
) {
    const trackId = String(req.query.track).trim();

    if (!trackId) {
        return res.status(400).json({
            success: false,
            error: 'رقم الطلب مطلوب.'
        });
    }

    try {
        const supabaseUrl =
            `${SUPABASE_URL}/rest/v1/orders` +
            `?id=eq.${encodeURIComponent(trackId)}` +
            `&select=*`;

        const orderResponse = await fetch(
            supabaseUrl,
            {
                method: 'GET',
                headers: {
                    'apikey': SUPABASE_SERVICE_ROLE_KEY,
                    'Authorization':
                        `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    'Content-Type':
                        'application/json'
                },
                cache: 'no-store'
            }
        );

        const orders = await orderResponse.json();

        if (
            !orderResponse.ok ||
            !Array.isArray(orders) ||
            orders.length === 0
        ) {
            return res.status(404).json({
                success: false,
                error: 'لم يتم العثور على طلب بهذا الرقم.'
            });
        }

        const order = orders[0];

        // لا نرسل أي بيانات إدارية أو حساسة غير لازمة
        const publicOrder = {
            id: order.id,
            order_number:
                order.order_number || order.id,

            status:
                order.status || 'New',

            created_at:
                order.created_at || null,

            updated_at:
                order.updated_at || null,

            // بيانات العميل
            customer_name:
                order.customer_name ||
                order.name ||
                '',

            phone:
                order.phone ||
                order.customer_phone ||
                '',

            whatsapp:
                order.whatsapp ||
                order.whatsapp_number ||
                '',

            // العنوان
            governorate:
                order.governorate ||
                '',

            city:
                order.city ||
                '',

            address:
                order.address ||
                '',

            // الشحن
            shipping_method:
                order.shipping_method ||
                order.delivery_method ||
                '',

            shipping_cost:
                Number(
                    order.shipping_cost || 0
                ),

            // الدفع
            payment_method:
                order.payment_method ||
                '',

            payment_status:
                order.payment_status ||
                'Pending',

            deposit_percent:
                Number(
                    order.deposit_percent || 0
                ),

            deposit_amount:
                Number(
                    order.deposit_amount ||
                    order.deposit ||
                    0
                ),

            remaining_amount:
                Number(
                    order.remaining_amount ||
                    0
                ),

            // المبالغ
            subtotal:
                Number(
                    order.subtotal || 0
                ),

            total:
                Number(
                    order.total || 0
                ),

            // المنتجات
            items:
                Array.isArray(order.items)
                    ? order.items
                    : (
                        Array.isArray(order.products)
                            ? order.products
                            : []
                    ),

            // ملاحظات
            notes:
                order.notes ||
                order.customer_notes ||
                ''
        };

        return res.status(200).json({
            success: true,
            order: publicOrder
        });

    } catch (error) {

        console.error(
            'PUBLIC TRACK ORDER ERROR:',
            error
        );

        return res.status(500).json({
            success: false,
            error: 'حدث خطأ أثناء البحث عن الطلب.'
        });
    }
}

        // =====================================================
        // إنشاء طلب جديد
        //
        // POST /api/orders
        // =====================================================

        if (req.method === 'POST') {

            const order =
                req.body || {};


            if (!order.id) {

                return res.status(400).json({
                    success: false,
                    error:
                        'رقم الطلب غير موجود'
                });
            }


            const response =
                await fetch(
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

                        body:
                            JSON.stringify({

                                id:
                                    order.id,

                                order_number:
                                    order.id,

                                customer_name:
                                    order.customer?.name ||
                                    '',

                                phone:
                                    order.customer?.phone ||
                                    '',

                                whatsapp:
                                    order.customer?.phone ||
                                    '',

                                governorate:
                                    order.customer?.gov ||
                                    '',

                                city:
                                    order.customer?.city ||
                                    '',

                                address:
                                    order.customer?.address ||
                                    '',

                                location:
                                    '',

                                items:
                                    order.items ||
                                    [],

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
        // 🔐 من هنا العمليات التالية للأدمن فقط
        // =====================================================

        if (!token) {

            console.error(
                'ADMIN AUTH ERROR: No admin token received'
            );


            return res.status(401).json({
                success: false,
                error:
                    'غير مصرح'
            });
        }


        // =====================================================
        // جلب جميع الطلبات للأدمن
        //
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
// تحديث حالة الطلب أو حالة الدفع
//
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


    const body =
        req.body || {};


    // =====================================================
    // تحديث حالة الطلب
    // =====================================================

    if (body.status !== undefined) {

        const status =
            body.status;


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

                    body:
                        JSON.stringify({
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

            console.error(
                'SUPABASE UPDATE ORDER STATUS ERROR:',
                data
            );


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
    // تحديث حالة الدفع
    // =====================================================

    if (body.paymentStatus !== undefined) {

        const paymentStatus =
            body.paymentStatus;


        const allowedPaymentStatuses = [
            'Pending',
            'Partial',
            'Paid',
            'Failed',
            'Refunded'
        ];


        if (
            !allowedPaymentStatuses.includes(
                paymentStatus
            )
        ) {

            return res.status(400).json({
                success: false,
                error:
                    'حالة الدفع غير صحيحة'
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

                    body:
                        JSON.stringify({

                            payment_status:
                                paymentStatus

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
                'SUPABASE UPDATE PAYMENT STATUS ERROR:',
                data
            );


            return res.status(
                response.status
            ).json({

                success: false,

                error:
                    data?.message ||
                    data?.error ||
                    'فشل تحديث حالة الدفع'
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
    // لا يوجد حقل للتحديث
    // =====================================================

    return res.status(400).json({

        success: false,

        error:
            'لم يتم إرسال حالة الطلب أو حالة الدفع'
    });
}


        // =====================================================
        // Method غير مسموح
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
