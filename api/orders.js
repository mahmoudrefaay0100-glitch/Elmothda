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

        const supabaseHeaders = {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
        };

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
        // HELPERS
        // =====================================================

        function toNonNegativeNumber(value, fallback = 0) {
            if (
                value === null ||
                value === undefined ||
                value === ''
            ) {
                return fallback;
            }

            const number = Number(value);

            return Number.isFinite(number) && number >= 0
                ? number
                : fallback;
        }

        function parseJson(text, fallback = []) {
            try {
                return text ? JSON.parse(text) : fallback;
            } catch {
                return fallback;
            }
        }

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

            const orderResponse = await fetch(supabaseUrl, {
                method: 'GET',
                headers: supabaseHeaders,
                cache: 'no-store'
            });

            const orders = parseJson(
                await orderResponse.text()
            );

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

                sunBadgeFee:
                    Number(
                        order.sunbadge_fee ??
                        order.sunBadgeFee ??
                        0
                    ),

                sunbadge_fee:
                    Number(
                        order.sunbadge_fee ??
                        order.sunBadgeFee ??
                        0
                    ),

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
        //
        // رسوم صن بيدج:
        // - تُقرأ من قاعدة بيانات المنتجات.
        // - تُضاف مرة واحدة لكل منتج مختلف.
        // - لا تُضرب في كمية المنتج.
        // =====================================================

        if (req.method === 'POST') {
            const order = req.body || {};

            if (!order.id) {
                return res.status(400).json({
                    success: false,
                    error: 'رقم الطلب غير موجود'
                });
            }

            const items = Array.isArray(order.items)
                ? order.items
                : [];

            if (items.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'الطلب لا يحتوي على منتجات'
                });
            }

            // -------------------------------------------------
            // تحديد اختيار صن بيدج
            // -------------------------------------------------

            function isSunBadgeItem(item) {
                const upholsteryName =
                    String(item.upholsteryName || '');

                const upholsteryType =
                    String(item.upholsteryExtraType || '')
                        .toLowerCase();

                const isJaguar =
                    /جاكوار|jaguar/i.test(upholsteryName);

                const isSunBadge =
                    upholsteryType === 'sunbadge' ||
                    /صن\s*بيدج|sun\s*badge|sunbedge/i
                        .test(upholsteryName);

                return isSunBadge && !isJaguar;
            }

            // -------------------------------------------------
            // جمع معرفات المنتجات المختارة
            // -------------------------------------------------

            const sunBadgeItems =
                items.filter(isSunBadgeItem);

            const selectedProductIds = [
                ...new Set(
                    sunBadgeItems
                        .map(item =>
                            String(
                                item.productId ??
                                item.product_id ??
                                ''
                            ).trim()
                        )
                        .filter(Boolean)
                )
            ];

            if (
                sunBadgeItems.length > 0 &&
                selectedProductIds.length === 0
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        'تعذر تحديد المنتج لحساب رسوم صن بيدج. ' +
                        'يرجى تحديث بيانات المنتج في السلة.'
                });
            }

            // -------------------------------------------------
            // جلب الرسوم المحفوظة لكل منتج
            // -------------------------------------------------

            const productFees = new Map();

            for (const productId of selectedProductIds) {
                const productUrl =
                    `${SUPABASE_URL}/rest/v1/products` +
                    `?id=eq.${encodeURIComponent(productId)}` +
                    '&select=id,sunbadge_fee';

                const productResponse = await fetch(
                    productUrl,
                    {
                        method: 'GET',
                        headers: supabaseHeaders,
                        cache: 'no-store'
                    }
                );

                const productData = parseJson(
                    await productResponse.text()
                );

                if (
                    !productResponse.ok ||
                    !Array.isArray(productData) ||
                    productData.length === 0
                ) {
                    console.error(
                        'SUNBADGE PRODUCT LOOKUP ERROR:',
                        productData
                    );

                    return res.status(400).json({
                        success: false,
                        error:
                            'تعذر قراءة رسوم المنتج من قاعدة البيانات. ' +
                            'تحقق من معرف المنتج وعمود sunbadge_fee.'
                    });
                }

                const rawFee =
                    productData[0].sunbadge_fee ?? 0;

                const fee = Number(rawFee);

                if (
                    !Number.isFinite(fee) ||
                    fee < 0
                ) {
                    return res.status(400).json({
                        success: false,
                        error:
                            'رسوم أحد المنتجات غير صحيحة في قاعدة البيانات.'
                    });
                }

                productFees.set(productId, fee);
            }

            // -------------------------------------------------
            // تطبيق الرسوم مرة واحدة لكل منتج مختلف
            // -------------------------------------------------

            const chargedProductIds = new Set();

            let submittedSunBadgeFee = 0;

            const savedItems = items.map(item => {
                const productId = String(
                    item.productId ??
                    item.product_id ??
                    ''
                ).trim();

                let appliedFee = 0;

                if (
                    isSunBadgeItem(item) &&
                    productId &&
                    !chargedProductIds.has(productId)
                ) {
                    appliedFee =
                        productFees.get(productId) ?? 0;

                    chargedProductIds.add(productId);

                    submittedSunBadgeFee += appliedFee;
                }

                return {
                    ...item,
                    sunbadgeFee: appliedFee,
                    sunbadge_fee: appliedFee
                };
            });

            // -------------------------------------------------
            // حساب المبالغ
            // -------------------------------------------------

            const subtotal =
                toNonNegativeNumber(order.subtotal, 0);

            const shippingCost =
                toNonNegativeNumber(order.shippingCost, 0);

            const discount =
                toNonNegativeNumber(order.discount, 0);

            const total = Math.max(
                0,
                subtotal +
                submittedSunBadgeFee +
                shippingCost -
                discount
            );

            const rawDepositPercent = Number(
                order.depositPercent ?? 30
            );

            if (
                !Number.isFinite(rawDepositPercent) ||
                rawDepositPercent < 0 ||
                rawDepositPercent > 100
            ) {
                return res.status(400).json({
                    success: false,
                    error: 'نسبة العربون غير صحيحة'
                });
            }

            const depositPercent = rawDepositPercent;

            const depositAmount = Math.round(
                total * depositPercent / 100
            );

            const remainingAmount = Math.max(
                0,
                total - depositAmount
            );

            // -------------------------------------------------
            // حفظ الطلب
            // -------------------------------------------------

            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/orders`,
                {
                    method: 'POST',
                    headers: {
                        ...supabaseHeaders,
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

                        items: savedItems,

                        subtotal,

                        sunbadge_fee:
                            submittedSunBadgeFee,

                        shipping_cost:
                            shippingCost,

                        discount,

                        total,

                        shipping_method:
                            order.shippingMethod || '',

                        payment_method:
                            order.paymentMethod ||
                            'Visa / Mastercard',

                        deposit_percent:
                            depositPercent,

                        deposit_amount:
                            depositAmount,

                        remaining_amount:
                            remainingAmount,

                        payment_status:
                            order.paymentStatus || 'Pending',

                        payment_proof_url:
                            order.paymentProofUrl || '',

                        status:
                            order.status || 'New'
                    })
                }
            );

            const responseText = await response.text();

            const data = parseJson(responseText);

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
        // =====================================================

        if (req.method === 'GET') {
            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/orders?select=*&order=created_at.desc`,
                {
                    method: 'GET',
                    headers: supabaseHeaders,
                    cache: 'no-store'
                }
            );

            const data = parseJson(
                await response.text()
            );

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
                        ...supabaseHeaders,
                        Prefer: 'return=representation'
                    }
                }
            );

            const data = parseJson(
                await response.text()
            );

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
        // =====================================================

        if (req.method === 'PUT') {
            const orderId = String(
                req.query?.id || ''
            ).trim();

            if (!orderId) {
                return res.status(400).json({
                    success: false,
                    error: 'رقم الطلب غير موجود'
                });
            }

            const body = req.body || {};

            let updateData = {};

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

                updateData.status = body.status;
            }

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

                updateData.payment_status =
                    body.paymentStatus;
            }

            if (Object.keys(updateData).length === 0) {
                return res.status(400).json({
                    success: false,
                    error:
                        'لم يتم إرسال حالة الطلب أو حالة الدفع'
                });
            }

            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,
                {
                    method: 'PATCH',
                    headers: {
                        ...supabaseHeaders,
                        Prefer: 'return=representation'
                    },
                    body: JSON.stringify(updateData)
                }
            );

            const data = parseJson(
                await response.text()
            );

            if (!response.ok) {
                console.error(
                    'SUPABASE UPDATE ORDER ERROR:',
                    data
                );

                return res.status(response.status).json({
                    success: false,
                    error:
                        data?.message ||
                        data?.error ||
                        'فشل تحديث الطلب'
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
