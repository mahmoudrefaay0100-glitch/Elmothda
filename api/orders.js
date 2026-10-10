
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

        res.setHeader('Cache-Control', 'no-store, max-age=0');

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
            String(authHeader).replace(/^Bearer\s+/i, '').trim();

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

        function parseJson(text, fallback = null) {
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

            return {
                response,
                data: parseJson(text, null),
                text
            };
        }

        function getProductId(item) {
            return String(
                item?.productId ??
                item?.product_id ??
                ''
            ).trim();
        }

        function getItemQuantity(item) {
            const qty = Number(
                item?.qty ?? item?.quantity ?? 1
            );

            if (
                !Number.isFinite(qty) ||
                !Number.isInteger(qty) ||
                qty < 1
            ) {
                return null;
            }

            return qty;
        }

        function getUpholsteryName(item) {
            return String(item?.upholsteryName || '').trim();
        }

        function isJaguarItem(item) {
            return /جاكوار|jaguar/i.test(
                getUpholsteryName(item)
            );
        }

        function isSunBadgeItem(item) {
            if (isJaguarItem(item)) {
                return false;
            }

            const type = String(
                item?.upholsteryExtraType || ''
            ).toLowerCase().trim();

            const name = getUpholsteryName(item);

            return (
                type === 'sunbadge' ||
                /صن\s*بيدج|sun\s*badge|sunbedge/i.test(name)
            );
        }


        // =====================================================
        // PUBLIC ORDER TRACKING
        // GET /api/orders?track=ORDER_ID
        // البحث باستخدام id أو order_number
        // =====================================================

        if (
            req.method === 'GET' &&
            req.query?.track
        ) {
            const trackId = String(req.query.track).trim();

            if (!trackId) {
                return res.status(400).json({
                    success: false,
                    error: 'رقم الطلب مطلوب.'
                });
            }

            const encodedTrackId =
                encodeURIComponent(trackId);

            const url =
                `${SUPABASE_URL}/rest/v1/orders` +
                `?select=*` +
                `&or=(id.eq.${encodedTrackId},order_number.eq.${encodedTrackId})` +
                `&limit=1`;

            const {
                response,
                data: orders,
                text
            } = await getSupabaseJson(url);

            if (!response.ok) {
                console.error(
                    'ORDER TRACKING DATABASE ERROR:',
                    response.status,
                    orders || text
                );

                return res.status(500).json({
                    success: false,
                    error: 'حدث خطأ أثناء البحث عن الطلب.'
                });
            }

            if (
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
                    Number(order.sunbadge_fee || 0),

                sunbadge_fee:
                    Number(order.sunbadge_fee || 0),

                discount:
                    Number(order.discount || 0),

                total:
                    Number(order.total || 0),

                items: Array.isArray(order.items)
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
        // الأسعار والرسوم يؤخذان من قاعدة البيانات.
        // رسوم صن بيدج = رسوم القطعة الواحدة × كمية السطر.
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

            // ---------------------------------------------
            // جلب السعر ورسوم صن بيدج من قاعدة البيانات
            // ---------------------------------------------

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
                            'تعذر العثور على أحد المنتجات في قاعدة البيانات.'
                    });
                }

                const product = productData[0];
                const price = Number(product.price);

                if (!Number.isFinite(price) || price < 0) {
                    return res.status(400).json({
                        success: false,
                        error:
                            'سعر أحد المنتجات غير صالح في قاعدة البيانات.'
                    });
                }

                const fee = Number(product.sunbadge_fee ?? 0);

                if (!Number.isFinite(fee) || fee < 0) {
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

            // ---------------------------------------------
            // حساب أسعار المنتجات ورسوم صن بيدج
            // ---------------------------------------------

            let subtotal = 0;
            let totalSunBadgeFee = 0;

            const savedItems = [];

            for (const item of items) {
                const productId = getProductId(item);
                const product = productsById.get(productId);

                if (!product) {
                    return res.status(400).json({
                        success: false,
                        error: 'تعذر العثور على بيانات أحد المنتجات.'
                    });
                }

                const qty = getItemQuantity(item);

                if (qty === null) {
                    return res.status(400).json({
                        success: false,
                        error: 'كمية أحد المنتجات غير صحيحة.'
                    });
                }

                // السعر الأساسي للقطعة، من قاعدة البيانات.
                const unitPrice = product.price;

                // إجمالي أسعار المنتجات في هذا السطر.
                const itemSubtotal = unitPrice * qty;

                if (
                    !Number.isFinite(itemSubtotal) ||
                    !Number.isFinite(subtotal + itemSubtotal)
                ) {
                    return res.status(400).json({
                        success: false,
                        error: 'تعذر حساب قيمة أحد المنتجات.'
                    });
                }

                // رسوم صن بيدج لا تُطبق على جاكوار.
                const sunbadgeUnitFee =
                    isSunBadgeItem(item)
                        ? product.sunbadgeFee
                        : 0;

                // الرسوم لكل قطعة مضروبة في كمية هذا السطر.
                const sunbadgeLineFee =
                    sunbadgeUnitFee * qty;

                if (
                    !Number.isFinite(sunbadgeLineFee) ||
                    !Number.isFinite(
                        totalSunBadgeFee + sunbadgeLineFee
                    )
                ) {
                    return res.status(400).json({
                        success: false,
                        error: 'تعذر حساب رسوم صن بيدج.'
                    });
                }

                subtotal += itemSubtotal;
                totalSunBadgeFee += sunbadgeLineFee;

                savedItems.push({
                    ...item,

                    productId,
                    product_id: productId,

                    qty,
                    quantity: qty,

                    // السعر الأساسي دون رسوم صن بيدج.
                    unitPrice,
                    price: unitPrice,

                    // مجموع سعر المنتجات في السطر.
                    itemSubtotal,

                    // رسوم القطعة الواحدة.
                    sunbadgeUnitFee,
                    sunbadge_unit_fee: sunbadgeUnitFee,

                    // إجمالي رسوم هذا السطر حسب الكمية.
                    sunbadgeFee: sunbadgeLineFee,
                    sunbadge_fee: sunbadgeLineFee,
                    sunbadgeLineFee,
                    sunbadge_line_fee: sunbadgeLineFee,

                    // إجمالي السطر شامل الرسوم.
                    lineTotal: itemSubtotal + sunbadgeLineFee,

                    upholsteryExtraType:
                        isSunBadgeItem(item)
                            ? 'sunbadge'
                            : (
                                item.upholsteryExtraType ||
                                'none'
                            )
                });
            }

            // ---------------------------------------------
            // الشحن والخصم والإجمالي النهائي
            // ---------------------------------------------

            const shippingCost = toNonNegativeNumber(
                order.shippingCost ??
                order.shipping_cost,
                0
            );

            const requestedDiscount = toNonNegativeNumber(
                order.discount,
                0
            );

            const beforeDiscount =
                subtotal +
                totalSunBadgeFee +
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
                order.depositPercent ??
                order.deposit_percent ??
                30
            );

            if (
                !Number.isFinite(rawDepositPercent) ||
                rawDepositPercent < 0 ||
                rawDepositPercent > 100
            ) {
                return res.status(400).json({
                    success: false,
                    error: 'نسبة العربون غير صحيحة.'
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

            // ---------------------------------------------
            // بيانات العميل
            // ---------------------------------------------

            const customer = order.customer || {};

            const customerName = String(
                customer.name ??
                order.customer_name ??
                order.name ??
                ''
            ).trim();

            const customerPhone = String(
                customer.phone ??
                order.phone ??
                ''
            ).trim();

            const customerWhatsapp = String(
                customer.whatsapp ??
                order.whatsapp ??
                customerPhone
            ).trim();

            const customerGov = String(
                customer.gov ??
                customer.governorate ??
                order.governorate ??
                ''
            ).trim();

            const customerCity = String(
                customer.city ??
                order.city ??
                ''
            ).trim();

            const customerAddress = String(
                customer.address ??
                order.address ??
                ''
            ).trim();

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

            // ---------------------------------------------
            // تجهيز الطلب للحفظ
            // ---------------------------------------------

            const insertPayload = {
                id: String(order.id),
                order_number: String(
                    order.order_number || order.id
                ),

                customer_name: customerName,
                phone: customerPhone,
                whatsapp: customerWhatsapp,

                governorate: customerGov,
                city: customerCity,
                address: customerAddress,

                location: '',

                items: savedItems,

                // مجموع المنتجات دون رسوم صن بيدج.
                subtotal,

                // مجموع رسوم صن بيدج لكل القطع.
                sunbadge_fee: totalSunBadgeFee,

                shipping_cost: shippingCost,
                discount,

                // الإجمالي النهائي بعد الشحن والخصم.
                total,

                shipping_method:
                    order.shippingMethod ??
                    order.shipping_method ??
                    '',

                payment_method:
                    order.paymentMethod ??
                    order.payment_method ??
                    'Visa / Mastercard',

                deposit_percent: depositPercent,
                deposit_amount: depositAmount,
                remaining_amount: remainingAmount,

                payment_status:
                    order.paymentStatus ??
                    order.payment_status ??
                    'Pending',

                payment_proof_url:
                    order.paymentProofUrl ??
                    order.payment_proof_url ??
                    '',

                status: order.status || 'New'
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
                        'فشل حفظ الطلب.'
                });
            }

            const savedOrder = Array.isArray(insertedData)
                ? insertedData[0]
                : insertedData;

            if (!savedOrder?.id) {
                return res.status(500).json({
                    success: false,
                    error:
                        'لم تصل بيانات الطلب المحفوظ من قاعدة البيانات.'
                });
            }

            return res.status(201).json({
                success: true,
                order: savedOrder
            });
        }

        // =====================================================
        // ADMIN OPERATIONS
        // =====================================================

        // ملاحظة أمنية:
        // وجود token وحده لا يثبت صحته.
        // يجب التحقق من التوكن باستخدام آلية المصادقة الفعلية
        // قبل السماح بعمليات GET وPUT وDELETE الخاصة بالأدمن.
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
                        'فشل جلب الطلبات.'
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
                    error: 'رقم الطلب غير موجود.'
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
                        'فشل حذف الطلب من قاعدة البيانات.'
                });
            }

            if (!Array.isArray(data) || data.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'الطلب غير موجود في قاعدة البيانات.'
                });
            }

            return res.status(200).json({
                success: true,
                message: 'تم حذف الطلب بنجاح.',
                deletedOrderId: orderId
            });
        }

        // =====================================================
        // UPDATE ORDER STATUS / PAYMENT STATUS
        // =====================================================

        if (req.method === 'PUT') {
            const orderId = String(
                req.query?.id || ''
            ).trim();

            if (!orderId) {
                return res.status(400).json({
                    success: false,
                    error: 'رقم الطلب غير موجود.'
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
                        error: 'حالة الطلب غير صحيحة.'
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
                        error: 'حالة الدفع غير صحيحة.'
                    });
                }

                updateData.payment_status = body.paymentStatus;
            }

            if (Object.keys(updateData).length === 0) {
                return res.status(400).json({
                    success: false,
                    error:
                        'لم يتم إرسال حالة الطلب أو حالة الدفع.'
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
                        'فشل تحديث الطلب.'
                });
            }

            if (!Array.isArray(data) || data.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'الطلب غير موجود في قاعدة البيانات.'
                });
            }

            return res.status(200).json({
                success: true,
                order: data[0]
            });
        }

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
                'حدث خطأ في نظام الطلبات.'
        });
    }
}
