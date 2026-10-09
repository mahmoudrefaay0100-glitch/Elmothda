
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

        const authHeader =
            req.headers.authorization ||
            req.headers.Authorization ||
            '';

        const adminToken =
            req.headers['x-admin-token'] || '';

        const token =
            adminToken ||
            authHeader.replace(/^Bearer\s+/i, '').trim();

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

        async function getSupabaseJson(url, options = {}) {
            const response = await fetch(url, {
                ...options,
                headers: {
                    ...supabaseHeaders,
                    ...(options.headers || {})
                },
                cache: 'no-store'
            });

            const text = await response.text();
            const data = parseJson(text, null);

            return {
                response,
                data,
                text
            };
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

            const url =
                `${SUPABASE_URL}/rest/v1/orders` +
                `?id=eq.${encodeURIComponent(trackId)}` +
                '&select=*';

            const {
                response,
                data: orders
            } = await getSupabaseJson(url);

            if (
                !response.ok ||
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
                order_number: order.order_number || order.id,
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

                payment_method: order.payment_method || '',
                payment_status: order.payment_status || 'Pending',

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

                subtotal: Number(order.subtotal || 0),

                sunBadgeFee:
                    Number(order.sunbadge_fee ?? 0),

                sunbadge_fee:
                    Number(order.sunbadge_fee ?? 0),

                discount: Number(order.discount || 0),
                total: Number(order.total || 0),

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
        // أسعار المنتجات ورسوم صن بيدج من قاعدة البيانات.
        // رسوم صن بيدج مرة واحدة لكل منتج مختلف في الطلب.
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

            function getProductId(item) {
                return String(
                    item.productId ??
                    item.product_id ??
                    ''
                ).trim();
            }

            function isSunBadgeItem(item) {
                const upholsteryName =
                    String(item.upholsteryName || '');

                const upholsteryType =
                    String(item.upholsteryExtraType || '')
                        .toLowerCase()
                        .trim();

                const isJaguar =
                    /جاكوار|jaguar/i.test(upholsteryName);

                const isSunBadge =
                    upholsteryType === 'sunbadge' ||
                    /صن\s*بيدج|sun\s*badge|sunbedge/i
                        .test(upholsteryName);

                return isSunBadge && !isJaguar;
            }

            // -------------------------------------------------
            // تحقق من معرف كل منتج
            // -------------------------------------------------

            const productIds = [
                ...new Set(items.map(getProductId))
            ];

            if (productIds.some(id => !id)) {
                return res.status(400).json({
                    success: false,
                    error:
                        'يوجد منتج بدون معرف صالح. ' +
                        'حدّث السلة ثم حاول مرة أخرى.'
                });
            }

            // -------------------------------------------------
            // جلب السعر ورسوم صن بيدج من قاعدة البيانات
            // -------------------------------------------------

            const productsById = new Map();

            for (const productId of productIds) {
                const productUrl =
                    `${SUPABASE_URL}/rest/v1/products` +
                    `?id=eq.${encodeURIComponent(productId)}` +
                    '&select=id,price,sunbadge_fee';

                const {
                    response,
                    data: productData
                } = await getSupabaseJson(productUrl);

                if (
                    !response.ok ||
                    !Array.isArray(productData) ||
                    productData.length === 0
                ) {
                    console.error(
                        'ORDER PRODUCT LOOKUP ERROR:',
                        productData
                    );

                    return res.status(400).json({
                        success: false,
                        error:
                            'تعذر العثور على أحد المنتجات في قاعدة البيانات. ' +
                            'راجع المنتجات الموجودة في السلة.'
                    });
                }

                const product = productData[0];
                const price = Number(product.price);

                if (
                    !Number.isFinite(price) ||
                    price < 0
                ) {
                    return res.status(400).json({
                        success: false,
                        error:
                            'سعر أحد المنتجات غير صالح في قاعدة البيانات.'
                    });
                }

                const rawFee = product.sunbadge_fee ?? 0;
                const fee = Number(rawFee);

                if (
                    !Number.isFinite(fee) ||
                    fee < 0
                ) {
                    return res.status(400).json({
                        success: false,
                        error:
                            'رسوم صن بيدج غير صحيحة لأحد المنتجات.'
                    });
                }

                productsById.set(productId, {
                    id: product.id,
                    price,
                    sunbadgeFee: fee
                });
            }

            // -------------------------------------------------
            // إعادة حساب المنتجات والرسوم من بيانات موثوقة
            // -------------------------------------------------

            const chargedProductIds = new Set();

            let subtotal = 0;
            let submittedSunBadgeFee = 0;

            const savedItems = [];

            for (const item of items) {
                const productId = getProductId(item);
                const product = productsById.get(productId);

                const rawQty = Number(
                    item.qty ?? item.quantity ?? 1
                );

                if (
                    !Number.isFinite(rawQty) ||
                    rawQty < 1 ||
                    !Number.isInteger(rawQty)
                ) {
                    return res.status(400).json({
                        success: false,
                        error:
                            'كمية أحد المنتجات غير صحيحة.'
                    });
                }

                const unitPrice = product.price;
                const itemSubtotal = unitPrice * rawQty;

                if (!Number.isFinite(itemSubtotal)) {
                    return res.status(400).json({
                        success: false,
                        error: 'تعذر حساب قيمة أحد المنتجات.'
                    });
                }

                let appliedFee = 0;

                if (
                    isSunBadgeItem(item) &&
                    !chargedProductIds.has(productId)
                ) {
                    appliedFee = product.sunbadgeFee;
                    chargedProductIds.add(productId);
                    submittedSunBadgeFee += appliedFee;
                }

                subtotal += itemSubtotal;

                savedItems.push({
                    ...item,

                    productId,
                    product_id: productId,

                    qty: rawQty,
                    quantity: rawQty,

                    // السعر المعتمد من قاعدة البيانات
                    unitPrice,
                    price: unitPrice,

                    // إجمالي هذا السطر بعد إضافة الرسم المطبق عليه
                    itemSubtotal,
                    lineTotal: itemSubtotal + appliedFee,

                    // صفر في الأسطر التالية لنفس المنتج
                    sunbadgeFee: appliedFee,
                    sunbadge_fee: appliedFee,

                    // نحافظ على نوع التنجيد حتى لو الرسم صفر
                    upholsteryExtraType:
                        isSunBadgeItem(item)
                            ? 'sunbadge'
                            : (
                                item.upholsteryExtraType ||
                                'none'
                            )
                });
            }

            // -------------------------------------------------
            // حساب الشحن والخصم والإجمالي
            // -------------------------------------------------

            const shippingCost =
                toNonNegativeNumber(order.shippingCost, 0);

            const requestedDiscount =
                toNonNegativeNumber(order.discount, 0);

            const beforeDiscount =
                subtotal +
                submittedSunBadgeFee +
                shippingCost;

            const discount = Math.min(
                requestedDiscount,
                beforeDiscount
            );

            const total = Math.max(
                0,
                beforeDiscount - discount
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
            // بيانات العميل
            // -------------------------------------------------

            const customer = order.customer || {};

            const customerName =
                String(customer.name || '').trim();

            const customerPhone =
                String(customer.phone || '').trim();

            const customerGov =
                String(customer.gov || '').trim();

            const customerCity =
                String(customer.city || '').trim();

            const customerAddress =
                String(customer.address || '').trim();

            if (
                !customerName ||
                !customerPhone ||
                !customerGov ||
                !customerCity ||
                !customerAddress
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        'بيانات العميل غير مكتملة. ' +
                        'راجع الاسم والهاتف والمحافظة والمدينة والعنوان.'
                });
            }

            // -------------------------------------------------
            // حفظ الطلب في Supabase
            // -------------------------------------------------

            const insertPayload = {
                id: String(order.id),
                order_number: String(order.id),

                customer_name: customerName,
                phone: customerPhone,
                whatsapp: customerPhone,

                governorate: customerGov,
                city: customerCity,
                address: customerAddress,

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
            };

            const {
                response: insertResponse,
                data: insertedData
            } = await getSupabaseJson(
                `${SUPABASE_URL}/rest/v1/orders`,
                {
                    method: 'POST',
                    headers: {
                        Prefer: 'return=representation'
                    },
                    body: JSON.stringify(insertPayload)
                }
            );

            if (!insertResponse.ok) {
                console.error(
                    'SUPABASE CREATE ORDER ERROR:',
                    insertedData
                );

                return res.status(insertResponse.status).json({
                    success: false,
                    error:
                        insertedData?.message ||
                        insertedData?.error ||
                        'فشل حفظ الطلب'
                });
            }

            const savedOrder = Array.isArray(insertedData)
                ? insertedData[0]
                : insertedData;

            if (!savedOrder || !savedOrder.id) {
                return res.status(500).json({
                    success: false,
                    error:
                        'تم إرسال الطلب لكن لم تصل بيانات الطلب المحفوظ.'
                });
            }

            return res.status(201).json({
                success: true,
                order: savedOrder
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
            const {
                response,
                data
            } = await getSupabaseJson(
                `${SUPABASE_URL}/rest/v1/orders?select=*&order=created_at.desc`
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

            const {
                response,
                data
            } = await getSupabaseJson(
                `${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,
                {
                    method: 'DELETE',
                    headers: {
                        Prefer: 'return=representation'
                    }
                }
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
            const updateData = {};

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

            const {
                response,
                data
            } = await getSupabaseJson(
                `${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,
                {
                    method: 'PATCH',
                    headers: {
                        Prefer: 'return=representation'
                    },
                    body: JSON.stringify(updateData)
                }
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
