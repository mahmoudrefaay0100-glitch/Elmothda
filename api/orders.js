
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
        // ADMIN AUTH TOKEN
        // =====================================================

        const authHeader =
            req.headers.authorization ||
            req.headers.Authorization ||
            '';

        const adminToken =
            req.headers['x-admin-token'] || '';

        const token =
            adminToken ||
            authHeader.replace(/^Bearer\s+/i, '').trim();

        // =====================================================
        // PUBLIC ORDER TRACKING
        // GET /api/orders?track=ORDER_ID
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

            const supabaseUrl =
                `${SUPABASE_URL}/rest/v1/orders` +
                `?id=eq.${encodeURIComponent(trackId)}` +
                '&select=*';

            const orderResponse = await fetch(
                supabaseUrl,
                {
                    method: 'GET',
                    headers: {
                        apikey: SUPABASE_SERVICE_ROLE_KEY,
                        Authorization:
                            `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                        'Content-Type': 'application/json'
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

            const publicOrder = {
                id: order.id,
                order_number:
                    order.order_number || order.id,

                status: order.status || 'New',
                created_at: order.created_at || null,
                updated_at: order.updated_at || null,

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

                governorate: order.governorate || '',
                city: order.city || '',
                address: order.address || '',

                shipping_method:
                    order.shipping_method ||
                    order.delivery_method ||
                    '',

                shipping_cost:
                    Number(order.shipping_cost || 0),

                payment_method:
                    order.payment_method || '',

                payment_status:
                    order.payment_status || 'Pending',

                deposit_percent:
                    Number(order.deposit_percent || 0),

                deposit_amount:
                    Number(
                        order.deposit_amount ??
                        order.deposit ??
                        0
                    ),

                remaining_amount:
                    Number(order.remaining_amount || 0),

                subtotal:
                    Number(order.subtotal || 0),

                // رسوم صن بيدج مرة واحدة للطلب
                sunBadgeFee:
                    Number(order.sunbadge_fee ?? 0),

                total:
                    Number(order.total || 0),

                items:
                    Array.isArray(order.items)
                        ? order.items
                        : (
                            Array.isArray(order.products)
                                ? order.products
                                : []
                        ),

                notes:
                    order.notes ||
                    order.customer_notes ||
                    ''
            };

            return res.status(200).json({
                success: true,
                order: publicOrder
            });
        }

        // =====================================================
        // CREATE NEW ORDER
        // POST /api/orders
        // =====================================================

        if (req.method === 'POST') {
            const order = req.body || {};

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
                        apikey: SUPABASE_SERVICE_ROLE_KEY,
                        Authorization:
                            `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                        'Content-Type': 'application/json',
                        Prefer: 'return=representation'
                    },
                    body: JSON.stringify({
                        id: order.id,
                        order_number: order.id,

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

                        location: '',

                        items:
                            Array.isArray(order.items)
                                ? order.items
                                : [],

                        subtotal:
                            Number(order.subtotal ?? 0),

                        // حفظ رسوم صن بيدج في عمود مستقل
                        sunbadge_fee:
                            Number(order.sunBadgeFee ?? 0),

                        shipping_cost:
                            Number(order.shippingCost ?? 0),

                        discount:
                            Number(order.discount ?? 0),

                        total:
                            Number(order.total ?? 0),

                        shipping_method:
                            order.shippingMethod || '',

                        payment_method:
                            order.paymentMethod ||
                            'Visa / Mastercard',

                        deposit_percent:
                            Number(order.depositPercent ?? 30),

                        deposit_amount:
                            Number(order.depositAmount ?? 0),

                        remaining_amount:
                            Number(order.remainingAmount ?? 0),

                        payment_status:
                            order.paymentStatus || 'Pending',

                        payment_proof_url:
                            order.paymentProofUrl || '',

                        status:
                            order.status || 'New'
                    })
                }
            );

            const text = await response.text();

            let data = [];

            try {
                data = text ? JSON.parse(text) : [];
            } catch {
                data = [];
            }

            if (!response.ok) {
                console.error(
                    'SUPABASE CREATE ORDER ERROR:',
                    data
                );

                return res.status(response.status).json({
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
        // ADMIN-ONLY OPERATIONS
        // =====================================================

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'غير مصرح'
            });
        }

        // =====================================================
        // GET ALL ORDERS
        // GET /api/orders
        // =====================================================

        if (req.method === 'GET') {
            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/orders?select=*&order=created_at.desc`,
                {
                    method: 'GET',
                    headers: {
                        apikey: SUPABASE_SERVICE_ROLE_KEY,
                        Authorization:
                            `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const text = await response.text();

            let data = [];

            try {
                data = text ? JSON.parse(text) : [];
            } catch {
                data = [];
            }

            if (!response.ok) {
                console.error(
                    'SUPABASE GET ORDERS ERROR:',
                    data
                );

                return res.status(response.status).json({
                    success: false,
                    error:
                        data?.message ||
                        data?.error ||
                        'فشل جلب الطلبات'
                });
            }

            return res.status(200).json({
                success: true,
                orders: Array.isArray(data) ? data : []
            });
        }

        // =====================================================
        // DELETE ORDER
        // DELETE /api/orders?id=ORDER_ID
        // =====================================================

        if (req.method === 'DELETE') {
            const orderId = String(
                req.query?.id || ''
            ).trim();

            if (!orderId) {
                return res.status(400).json({
                    success: false,
                    error: 'رقم الطلب غير موجود'
                });
            }

            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,
                {
                    method: 'DELETE',
                    headers: {
                        apikey: SUPABASE_SERVICE_ROLE_KEY,
                        Authorization:
                            `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                        'Content-Type': 'application/json',
                        Prefer: 'return=representation'
                    }
                }
            );

            const text = await response.text();

            let data = [];

            try {
                data = text ? JSON.parse(text) : [];
            } catch {
                data = [];
            }

            if (!response.ok) {
                console.error(
                    'SUPABASE DELETE ORDER ERROR:',
                    data
                );

                return res.status(response.status).json({
                    success: false,
                    error:
                        data?.message ||
                        data?.error ||
                        'فشل حذف الطلب من قاعدة البيانات'
                });
            }

            if (!Array.isArray(data) || data.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'الطلب غير موجود في قاعدة البيانات'
                });
            }

            return res.status(200).json({
                success: true,
                message: 'تم حذف الطلب بنجاح',
                deletedOrderId: orderId
            });
        }

        // =====================================================
        // UPDATE ORDER STATUS OR PAYMENT STATUS
        // PUT /api/orders?id=ORDER_ID
        // =====================================================

        if (req.method === 'PUT') {
            const orderId = req.query?.id;

            if (!orderId) {
                return res.status(400).json({
                    success: false,
                    error: 'رقم الطلب غير موجود'
                });
            }

            const body = req.body || {};

            // Update order status
            if (body.status !== undefined) {
                const allowedStatuses = [
                    'New',
                    'Confirmed',
                    'Shipped',
                    'Delivered',
                    'Cancelled'
                ];

                if (!allowedStatuses.includes(body.status)) {
                    return res.status(400).json({
                        success: false,
                        error: 'حالة الطلب غير صحيحة'
                    });
                }

                const response = await fetch(
                    `${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,
                    {
                        method: 'PATCH',
                        headers: {
                            apikey: SUPABASE_SERVICE_ROLE_KEY,
                            Authorization:
                                `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                            'Content-Type': 'application/json',
                            Prefer: 'return=representation'
                        },
                        body: JSON.stringify({
                            status: body.status
                        })
                    }
                );

                const text = await response.text();

                let data = [];

                try {
                    data = text ? JSON.parse(text) : [];
                } catch {
                    data = [];
                }

                if (!response.ok) {
                    console.error(
                        'SUPABASE UPDATE ORDER STATUS ERROR:',
                        data
                    );

                    return res.status(response.status).json({
                        success: false,
                        error:
                            data?.message ||
                            data?.error ||
                            'فشل تحديث حالة الطلب'
                    });
                }

                if (!Array.isArray(data) || data.length === 0) {
                    return res.status(404).json({
                        success: false,
                        error: 'الطلب غير موجود في قاعدة البيانات'
                    });
                }

                return res.status(200).json({
                    success: true,
                    order: data[0]
                });
            }

            // Update payment status
            if (body.paymentStatus !== undefined) {
                const allowedPaymentStatuses = [
                    'Pending',
                    'Partial',
                    'Paid',
                    'Failed',
                    'Refunded'
                ];

                if (
                    !allowedPaymentStatuses.includes(
                        body.paymentStatus
                    )
                ) {
                    return res.status(400).json({
                        success: false,
                        error: 'حالة الدفع غير صحيحة'
                    });
                }

                const response = await fetch(
                    `${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,
                    {
                        method: 'PATCH',
                        headers: {
                            apikey: SUPABASE_SERVICE_ROLE_KEY,
                            Authorization:
                                `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                            'Content-Type': 'application/json',
                            Prefer: 'return=representation'
                        },
                        body: JSON.stringify({
                            payment_status: body.paymentStatus
                        })
                    }
                );

                const text = await response.text();

                let data = [];

                try {
                    data = text ? JSON.parse(text) : [];
                } catch {
                    data = [];
                }

                if (!response.ok) {
                    console.error(
                        'SUPABASE UPDATE PAYMENT STATUS ERROR:',
                        data
                    );

                    return res.status(response.status).json({
                        success: false,
                        error:
                            data?.message ||
                            data?.error ||
                            'فشل تحديث حالة الدفع'
                    });
                }

                if (!Array.isArray(data) || data.length === 0) {
                    return res.status(404).json({
                        success: false,
                        error: 'الطلب غير موجود في قاعدة البيانات'
                    });
                }

                return res.status(200).json({
                    success: true,
                    order: data[0]
                });
            }

            return res.status(400).json({
                success: false,
                error: 'لم يتم إرسال حالة الطلب أو حالة الدفع'
            });
        }

        // =====================================================
        // METHOD NOT ALLOWED
        // =====================================================

        return res.status(405).json({
            success: false,
            error: 'Method not allowed'
        });

    } catch (error) {
        console.error('ORDERS API ERROR:', error);

        return res.status(500).json({
            success: false,
            error:
                error?.message ||
                'حدث خطأ في نظام الطلبات'
        });
    }
}
