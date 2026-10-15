module.exports = async function handler(req, res) {
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
            String(authHeader)
                .replace(/^Bearer\s+/i, '')
                .trim();

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

        // =====================================================
        // WHATSAPP SETTINGS
        // =====================================================

        async function getWhatsAppNotificationSettings() {
            const { response, data } = await getSupabaseJson(
                `${SUPABASE_URL}/rest/v1/site_settings` +
                '?select=whatsapp_notify_new_order,' +
                'whatsapp_notify_order_status,' +
                'whatsapp_notify_payment_status,' +
                'whatsapp_notify_customer&limit=1'
            );

            if (!response.ok) {
                console.error(
                    'WHATSAPP SETTINGS ERROR:',
                    response.status,
                    data
                );

                return null;
            }

            return Array.isArray(data) && data.length > 0
                ? data[0]
                : null;
        }

        // =====================================================
        // WHATSAPP NUMBER NORMALIZATION
        // =====================================================

        function normalizeWhatsAppNumber(value) {
            let number = String(value || '')
                .replace(/\D/g, '');

            if (!number) {
                return '';
            }

            if (number.startsWith('00')) {
                number = number.substring(2);
            }

            if (number.startsWith('0')) {
                number = '20' + number.substring(1);
            } else if (!number.startsWith('20')) {
                number = '20' + number;
            }

            return number;
        }

        // =====================================================
        // SEND WHATSAPP TEXT
        // إشعارات الإدارة الحالية
        // =====================================================

        async function sendWhatsAppText(
            message,
            recipient = '201042056121'
        ) {
            const accessToken =
                process.env.WHATSAPP_ACCESS_TOKEN;

            const phoneNumberId =
                process.env.WHATSAPP_PHONE_NUMBER_ID;

            if (
                !accessToken ||
                !phoneNumberId ||
                !recipient
            ) {
                console.error(
                    'WhatsApp credentials or recipient missing.'
                );

                return false;
            }

            const to = normalizeWhatsAppNumber(recipient);

            if (!to || to.length < 10) {
                console.error(
                    'Invalid WhatsApp recipient number.'
                );

                return false;
            }

            try {
                const response = await fetch(
                    `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
                    {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            messaging_product: 'whatsapp',
                            recipient_type: 'individual',
                            to,
                            type: 'text',
                            text: {
                                preview_url: false,
                                body: String(message || '')
                            }
                        })
                    }
                );

                const result = await response
                    .json()
                    .catch(() => ({}));

                if (!response.ok) {
                    console.error(
                        'WHATSAPP SEND ERROR:',
                        {
                            status: response.status,
                            error: result.error || result,
                            recipient: to,
                            phoneNumberIdLast4:
                                String(phoneNumberId).slice(-4)
                        }
                    );

                    return false;
                }

                console.log(
                    'WHATSAPP TEXT ACCEPTED:',
                    {
                        recipient: to,
                        messageId:
                            result?.messages?.[0]?.id || null
                    }
                );

                return true;
            } catch (error) {
                console.error(
                    'WHATSAPP TEXT REQUEST FAILED:',
                    error?.message || error
                );

                return false;
            }
        }

        // =====================================================
        // SEND APPROVED TEMPLATE TO CUSTOMER
        // إرسال تأكيد الطلب للعميل
        // =====================================================

        async function sendCustomerOrderConfirmation(order) {
            try {
                const settings =
                    await getWhatsAppNotificationSettings();

                if (!settings) {
                    console.error(
                        'Customer WhatsApp settings unavailable.'
                    );

                    return false;
                }

                if (
                    settings.whatsapp_notify_customer !== true
                ) {
                    console.log(
                        'Customer WhatsApp notifications are disabled.'
                    );

                    return false;
                }

                const accessToken =
                    process.env.WHATSAPP_ACCESS_TOKEN;

                const phoneNumberId =
                    process.env.WHATSAPP_PHONE_NUMBER_ID;

                const templateName =
                    process.env.WHATSAPP_ORDER_TEMPLATE_NAME;

                const templateLanguage =
                    process.env.WHATSAPP_ORDER_TEMPLATE_LANGUAGE ||
                    'ar';

                const servicePhone =
                    process.env.WHATSAPP_CUSTOMER_SERVICE_PHONE;

                if (
                    !accessToken ||
                    !phoneNumberId ||
                    !templateName ||
                    !servicePhone
                ) {
                    console.error(
                        'Customer WhatsApp template configuration is incomplete.'
                    );

                    return false;
                }

                const customerPhone = normalizeWhatsAppNumber(
                    order.whatsapp || order.phone
                );

                if (
                    !customerPhone ||
                    customerPhone.length < 10
                ) {
                    console.error(
                        'Invalid customer WhatsApp number.'
                    );

                    return false;
                }

                const orderNumber = String(
                    order.order_number || order.id || ''
                );

                const customerName = String(
                    order.customer_name ||
                    order.name ||
                    'عميلنا العزيز'
                );

                const items = Array.isArray(order.items)
                    ? order.items.map(item => {
                        const name =
                            item.title ||
                            item.name ||
                            item.productName ||
                            'منتج';

                        const quantity =
                            item.qty || item.quantity || 1;

                        return `${name} × ${quantity}`;
                    }).join('، ')
                    : 'تفاصيل الطلب متاحة لدى خدمة العملاء';

                const total = String(
                    Number(order.total || 0)
                );

                const deposit = String(
                    Number(order.deposit_amount || 0)
                );

                const remaining = String(
                    Number(order.remaining_amount || 0)
                );

                const customerServiceNumber =
                    String(servicePhone).trim();

                /*
                 * يجب أن يطابق القالب المعتمد في Meta:
                 *
                 * {{1}} اسم العميل
                 * {{2}} رقم الطلب
                 * {{3}} المنتجات
                 * {{4}} الإجمالي
                 * {{5}} العربون
                 * {{6}} المتبقي
                 * {{7}} رقم خدمة العملاء
                 */

                const response = await fetch(
                    `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
                    {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            messaging_product: 'whatsapp',
                            recipient_type: 'individual',
                            to: customerPhone,
                            type: 'template',
                            template: {
                                name: templateName,
                                language: {
                                    code: templateLanguage
                                },
                                components: [
                                    {
                                        type: 'body',
                                        parameters: [
                                            {
                                                type: 'text',
                                                text: customerName
                                            },
                                            {
                                                type: 'text',
                                                text: orderNumber
                                            },
                                            {
                                                type: 'text',
                                                text: items.substring(0, 900)
                                            },
                                            {
                                                type: 'text',
                                                text: total
                                            },
                                            {
                                                type: 'text',
                                                text: deposit
                                            },
                                            {
                                                type: 'text',
                                                text: remaining
                                            },
                                            {
                                                type: 'text',
                                                text: customerServiceNumber
                                            }
                                        ]
                                    }
                                ]
                            }
                        })
                    }
                );

                const result = await response
                    .json()
                    .catch(() => ({}));

                if (!response.ok) {
                    console.error(
                        'CUSTOMER WHATSAPP ERROR:',
                        response.status,
                        result
                    );

                    return false;
                }

                console.log(
                    'Customer WhatsApp confirmation accepted by Meta.',
                    {
                        orderNumber,
                        messageId:
                            result?.messages?.[0]?.id || null
                    }
                );

                return true;
            } catch (error) {
                console.error(
                    'CUSTOMER WHATSAPP FAILED:',
                    error?.message || error
                );

                return false;
            }
        }

        // =====================================================
        // ADMIN WHATSAPP NOTIFICATIONS
        // =====================================================

        async function notifyWhatsAppOrder(event, order) {
            try {
                const settings =
                    await getWhatsAppNotificationSettings();

                if (!settings) {
                    return false;
                }

                if (
                    event === 'new_order' &&
                    settings.whatsapp_notify_new_order !== true
                ) {
                    return false;
                }

                if (
                    event === 'order_status' &&
                    settings.whatsapp_notify_order_status !== true
                ) {
                    return false;
                }

                if (
                    event === 'payment_status' &&
                    settings.whatsapp_notify_payment_status !== true
                ) {
                    return false;
                }

                const orderNumber =
                    order.order_number ||
                    order.id ||
                    'غير متاح';

                const customerName =
                    order.customer_name ||
                    order.name ||
                    'غير متاح';

                const customerPhone =
                    order.phone ||
                    order.customer_phone ||
                    'غير متاح';

                const status = order.status || 'New';

                const paymentStatus =
                    order.payment_status ||
                    order.paymentStatus ||
                    'Pending';

                let message = '';

                if (event === 'new_order') {
                    const items = Array.isArray(order.items)
                        ? order.items.map(item => {
                            const name =
                                item.title ||
                                item.name ||
                                item.productName ||
                                'منتج';

                            const qty =
                                item.qty || item.quantity || 1;

                            return `• ${name} × ${qty}`;
                        }).join('\n')
                        : 'لا توجد تفاصيل منتجات';

                    message =
                        `🛒 طلب جديد - المتحدة للرتان والأثاث\n\n` +
                        `رقم الطلب: ${orderNumber}\n` +
                        `العميل: ${customerName}\n` +
                        `الهاتف: ${customerPhone}\n` +
                        `المحافظة: ${order.governorate || ''}\n` +
                        `المدينة: ${order.city || ''}\n` +
                        `العنوان: ${order.address || ''}\n\n` +
                        `المنتجات:\n${items}\n\n` +
                        `الإجمالي: ${Number(order.total || 0)} جنيه\n` +
                        `العربون: ${Number(order.deposit_amount || 0)} جنيه\n` +
                        `المتبقي: ${Number(order.remaining_amount || 0)} جنيه\n` +
                        `حالة الطلب: ${status}\n` +
                        `حالة الدفع: ${paymentStatus}`;
                } else if (event === 'order_status') {
                    message =
                        `📦 تحديث حالة طلب - المتحدة للرتان والأثاث\n\n` +
                        `رقم الطلب: ${orderNumber}\n` +
                        `العميل: ${customerName}\n` +
                        `الهاتف: ${customerPhone}\n` +
                        `الحالة الجديدة: ${status}`;
                } else if (event === 'payment_status') {
                    message =
                        `💳 تحديث حالة الدفع - المتحدة للرتان والأثاث\n\n` +
                        `رقم الطلب: ${orderNumber}\n` +
                        `العميل: ${customerName}\n` +
                        `الهاتف: ${customerPhone}\n` +
                        `حالة الدفع الجديدة: ${paymentStatus}\n` +
                        `الإجمالي: ${Number(order.total || 0)} جنيه\n` +
                        `العربون: ${Number(order.deposit_amount || 0)} جنيه\n` +
                        `المتبقي: ${Number(order.remaining_amount || 0)} جنيه`;
                } else {
                    return false;
                }

                return await sendWhatsAppText(message);
            } catch (error) {
                console.error(
                    'WHATSAPP NOTIFICATION FAILED:',
                    error?.message || error
                );

                return false;
            }
        }

        // =====================================================
        // PRODUCT HELPERS
        // =====================================================

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
            return String(
                item?.upholsteryName || ''
            ).trim();
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
        // GET /api/orders?track=ORDER_NUMBER
        // =====================================================

        if (req.method === 'GET' && req.query?.track) {
            const trackId = String(
                req.query.track
            ).trim();

            if (!trackId) {
                return res.status(400).json({
                    success: false,
                    error: 'رقم الطلب مطلوب.'
                });
            }

            const encodedTrackId =
                encodeURIComponent(trackId);

            let {
                response,
                data: orders,
                text
            } = await getSupabaseJson(
                `${SUPABASE_URL}/rest/v1/orders` +
                `?select=*` +
                `&order_number=eq.${encodedTrackId}` +
                `&limit=1`
            );

            // المحاولة الثانية: البحث باستخدام رقم المعرف.
            if (
                response.ok &&
                Array.isArray(orders) &&
                orders.length === 0
            ) {
                const fallback = await getSupabaseJson(
                    `${SUPABASE_URL}/rest/v1/orders` +
                    `?select=*` +
                    `&id=eq.${encodedTrackId}` +
                    `&limit=1`
                );

                response = fallback.response;
                orders = fallback.data;
                text = fallback.text;
            }

            // المحاولة الثالثة: بحث غير حساس لحالة الأحرف.
            if (
                response.ok &&
                Array.isArray(orders) &&
                orders.length === 0
            ) {
                const insensitive = await getSupabaseJson(
                    `${SUPABASE_URL}/rest/v1/orders` +
                    `?select=*` +
                    `&order_number=ilike.${encodedTrackId}` +
                    `&limit=1`
                );

                response = insensitive.response;
                orders = insensitive.data;
                text = insensitive.text;
            }

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

                shipping_cost: Number(
                    order.shipping_cost || 0
                ),

                payment_method:
                    order.payment_method || '',

                payment_status:
                    order.payment_status || 'Pending',

                deposit_percent: Number(
                    order.deposit_percent || 0
                ),

                deposit_amount: Number(
                    order.deposit_amount ??
                    order.deposit ??
                    0
                ),

                remaining_amount: Number(
                    order.remaining_amount || 0
                ),

                subtotal: Number(
                    order.subtotal || 0
                ),

                sunBadgeFee: Number(
                    order.sunbadge_fee || 0
                ),

                sunbadge_fee: Number(
                    order.sunbadge_fee || 0
                ),

                discount: Number(
                    order.discount || 0
                ),

                total: Number(
                    order.total || 0
                ),

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
        // =====================================================

        if (req.method === 'POST') {
            const order = req.body || {};

            if (!order.id && !order.order_number) {
                return res.status(400).json({
                    success: false,
                    error: 'رقم الطلب غير موجود'
                });
            }

            const requestedOrderNumber = String(
                order.order_number || order.id
            ).trim();

            if (!requestedOrderNumber) {
                return res.status(400).json({
                    success: false,
                    error: 'رقم الطلب غير صالح.'
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

                const fee = Number(
                    product.sunbadge_fee ?? 0
                );

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

            let subtotal = 0;
            let totalSunBadgeFee = 0;

            const savedItems = [];

            for (const item of items) {
                const productId = getProductId(item);
                const product = productsById.get(productId);

                if (!product) {
                    return res.status(400).json({
                        success: false,
                        error:
                            'تعذر العثور على بيانات أحد المنتجات.'
                    });
                }

                const qty = getItemQuantity(item);

                if (qty === null) {
                    return res.status(400).json({
                        success: false,
                        error:
                            'كمية أحد المنتجات غير صحيحة.'
                    });
                }

                const unitPrice = product.price;
                const itemSubtotal = unitPrice * qty;

                if (
                    !Number.isFinite(itemSubtotal) ||
                    !Number.isFinite(subtotal + itemSubtotal)
                ) {
                    return res.status(400).json({
                        success: false,
                        error:
                            'تعذر حساب قيمة أحد المنتجات.'
                    });
                }

                const sunbadgeUnitFee =
                    isSunBadgeItem(item)
                        ? product.sunbadgeFee
                        : 0;

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

                    unitPrice,
                    price: unitPrice,

                    itemSubtotal,

                    sunbadgeUnitFee,
                    sunbadge_unit_fee: sunbadgeUnitFee,

                    sunbadgeFee: sunbadgeLineFee,
                    sunbadge_fee: sunbadgeLineFee,

                    sunbadgeLineFee,
                    sunbadge_line_fee: sunbadgeLineFee,

                    lineTotal:
                        itemSubtotal + sunbadgeLineFee,

                    upholsteryExtraType:
                        isSunBadgeItem(item)
                            ? 'sunbadge'
                            : (
                                item.upholsteryExtraType ||
                                'none'
                            )
                });
            }

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

            const insertPayload = {
                // نحفظ رقم الطلب الذي أنشأه الموقع بدل null.
                order_number: requestedOrderNumber,

                customer_name: customerName,
                phone: customerPhone,
                whatsapp: customerWhatsapp,

                governorate: customerGov,
                city: customerCity,
                address: customerAddress,
                location: '',

                items: savedItems,

                subtotal,
                sunbadge_fee: totalSunBadgeFee,
                shipping_cost: shippingCost,
                discount,
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

            // لا نحذف ORD- من رقم الطلب الذي يرجع للواجهة.
            // يجب أن يطابق رقم الطلب المخزن في قاعدة البيانات.
            const finalOrder = {
                ...savedOrder,
                order_number: String(
                    savedOrder.order_number ||
                    requestedOrderNumber
                ).trim()
            };

            // إشعار الإدارة عند الطلب الجديد.
            await notifyWhatsAppOrder(
                'new_order',
                finalOrder
            );

            // إرسال تأكيد للعميل؛ فشل واتساب لا يلغي الطلب.
            await sendCustomerOrderConfirmation(
                finalOrder
            );

            return res.status(201).json({
                success: true,
                order: finalOrder
            });
        }

        // =====================================================
        // ADMIN OPERATIONS
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
                `${SUPABASE_URL}/rest/v1/orders` +
                '?select=*&order=created_at.desc'
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
                `${SUPABASE_URL}/rest/v1/orders` +
                `?id=eq.${encodeURIComponent(orderId)}`,
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
                    error:
                        'الطلب غير موجود في قاعدة البيانات.'
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

                if (
                    !allowedStatuses.includes(body.status)
                ) {
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

                updateData.payment_status =
                    body.paymentStatus;
            }

            if (Object.keys(updateData).length === 0) {
                return res.status(400).json({
                    success: false,
                    error:
                        'لم يتم إرسال حالة الطلب أو حالة الدفع.'
                });
            }

            // قراءة الطلب القديم لمعرفة هل تغيرت الحالة فعلًا.
            const oldOrderResult = await getSupabaseJson(
                `${SUPABASE_URL}/rest/v1/orders` +
                `?id=eq.${encodeURIComponent(orderId)}` +
                '&select=*&limit=1'
            );

            if (
                !oldOrderResult.response.ok ||
                !Array.isArray(oldOrderResult.data) ||
                oldOrderResult.data.length === 0
            ) {
                console.error(
                    'SUPABASE GET ORDER BEFORE UPDATE ERROR:',
                    oldOrderResult.data
                );

                return res.status(404).json({
                    success: false,
                    error:
                        'الطلب غير موجود في قاعدة البيانات.'
                });
            }

            const oldOrder = oldOrderResult.data[0];

            const {
                response,
                data
            } = await getSupabaseJson(
                `${SUPABASE_URL}/rest/v1/orders` +
                `?id=eq.${encodeURIComponent(orderId)}`,
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
                    error:
                        'الطلب غير موجود في قاعدة البيانات.'
                });
            }

            const updatedOrder = data[0];

            // إشعار الإدارة عند تغير حالة الطلب فقط.
            if (
                updateData.status !== undefined &&
                updateData.status !== oldOrder.status
            ) {
                await notifyWhatsAppOrder(
                    'order_status',
                    updatedOrder
                );
            }

            // إشعار الإدارة عند تغير حالة الدفع فقط.
            if (
                updateData.payment_status !== undefined &&
                updateData.payment_status !==
                    oldOrder.payment_status
            ) {
                await notifyWhatsAppOrder(
                    'payment_status',
                    updatedOrder
                );
            }

            return res.status(200).json({
                success: true,
                order: updatedOrder
            });
        }

        return res.status(405).json({
            success: false,
            error: 'Method not allowed'
        });

    } catch (error) {
        console.error(
            'ORDERS API ERROR:',
            error?.message || error
        );

        return res.status(500).json({
            success: false,
            error:
                error?.message ||
                'حدث خطأ في نظام الطلبات.'
        });
    }
};
