
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

        const token =
            req.headers['x-admin-token'] ||
            String(authHeader).replace(/^Bearer\s+/i, '').trim();

        function parseJson(text, fallback = null) {
            try {
                return text ? JSON.parse(text) : fallback;
            } catch {
                return fallback;
            }
        }

        function toNonNegativeNumber(value, fallback = 0) {
            if (value === null || value === undefined || value === '') {
                return fallback;
            }

            const number = Number(value);

            return Number.isFinite(number) && number >= 0
                ? number
                : fallback;
        }

        function firstNonEmpty(...values) {
            for (const value of values) {
                if (
                    value !== undefined &&
                    value !== null &&
                    String(value).trim() !== ''
                ) {
                    return value;
                }
            }

            return '';
        }

        function getCustomerObjects(order = {}) {
            const objects = [
                order.customer,
                order.customerInfo,
                order.customer_info,
                order.customerData,
                order.customer_data,
                order.customerDetails,
                order.customer_details,
                order.customerDetailsData
            ];

            return objects.filter(
                value =>
                    value &&
                    typeof value === 'object' &&
                    !Array.isArray(value)
            );
        }

        function getCustomerField(order, ...keys) {
            const objects = getCustomerObjects(order);

            const values = [];

            for (const key of keys) {
                values.push(order?.[key]);
            }

            for (const customer of objects) {
                for (const key of keys) {
                    values.push(customer?.[key]);
                }
            }

            return firstNonEmpty(...values);
        }

        function normalizeWhatsAppNumber(value) {
            let number = String(value || '').replace(/\D/g, '');

            if (!number) return '';

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

        // توحيد بيانات العميل مهما اختلفت أسماء الحقول.
        function normalizeOrder(order = {}) {
            const customers = getCustomerObjects(order);

            const customer = customers.length
                ? customers.reduce(
                    (combined, item) => ({ ...combined, ...item }),
                    {}
                )
                : {};

            const customerName = String(firstNonEmpty(
                order.customer_name,
                order.customerName,
                order.customer_full_name,
                order.customerFullName,
                order.full_name,
                order.fullName,
                order.name,
                customer.name,
                customer.customer_name,
                customer.customerName,
                customer.full_name,
                customer.fullName
            )).trim();

            const phone = String(firstNonEmpty(
                order.phone,
                order.customer_phone,
                order.customerPhone,
                order.phone_number,
                order.phoneNumber,
                order.customer_phone_number,
                order.customerPhoneNumber,
                order.mobile,
                order.mobile_number,
                order.mobileNumber,
                order.customer_mobile,
                order.customerMobile,
                order.telephone,
                order.tel,
                customer.phone,
                customer.customer_phone,
                customer.customerPhone,
                customer.phone_number,
                customer.phoneNumber,
                customer.mobile,
                customer.mobile_number,
                customer.mobileNumber,
                customer.telephone,
                customer.tel
            )).trim();

            const whatsapp = String(firstNonEmpty(
                order.whatsapp,
                order.whats_app,
                order.whatsapp_number,
                order.whatsappNumber,
                order.whatsapp_phone,
                order.whatsappPhone,
                order.customer_whatsapp,
                order.customerWhatsapp,
                order.customer_whatsapp_number,
                order.customerWhatsappNumber,
                customer.whatsapp,
                customer.whats_app,
                customer.whatsapp_number,
                customer.whatsappNumber,
                customer.whatsapp_phone,
                customer.whatsappPhone,
                customer.customer_whatsapp,
                phone
            )).trim();

            const governorate = String(firstNonEmpty(
                order.governorate,
                order.customer_governorate,
                order.customerGovernorate,
                order.gov,
                customer.governorate,
                customer.customer_governorate,
                customer.customerGovernorate,
                customer.gov
            )).trim();

            const city = String(firstNonEmpty(
                order.city,
                order.customer_city,
                order.customerCity,
                customer.city,
                customer.customer_city,
                customer.customerCity
            )).trim();

            const address = String(firstNonEmpty(
                order.address,
                order.customer_address,
                order.customerAddress,
                customer.address,
                customer.customer_address,
                customer.customerAddress
            )).trim();

            return {
                ...order,

                customer_name: customerName,
                customerName,
                name: customerName,

                phone,
                customer_phone: phone,
                customerPhone: phone,
                phone_number: phone,
                phoneNumber: phone,
                customer_phone_number: phone,
                customerPhoneNumber: phone,

                whatsapp,
                whatsapp_number: whatsapp,
                whatsappNumber: whatsapp,
                customer_whatsapp: whatsapp,
                customerWhatsapp: whatsapp,

                customer: {
                    ...customer,
                    name: customerName,
                    customer_name: customerName,
                    phone,
                    customer_phone: phone,
                    phone_number: phone,
                    phoneNumber: phone,
                    whatsapp,
                    whatsapp_number: whatsapp,
                    whatsappNumber: whatsapp,
                    governorate,
                    city,
                    address
                },

                governorate,
                city,
                address
            };
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

            return Array.isArray(data) && data.length
                ? data[0]
                : null;
        }

        // =====================================================
        // SEND WHATSAPP TEXT TO ADMIN
        // =====================================================

        async function sendWhatsAppText(
            message,
            recipient = '201042056121'
        ) {
            const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
            const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

            if (!accessToken || !phoneNumberId || !recipient) {
                console.error(
                    'WhatsApp credentials or recipient missing.'
                );
                return false;
            }

            const to = normalizeWhatsAppNumber(recipient);

            if (!to || to.length < 10) {
                console.error('Invalid WhatsApp recipient number.');
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

                const result = await response.json().catch(() => ({}));

                if (!response.ok) {
                    console.error('WHATSAPP SEND ERROR:', {
                        status: response.status,
                        error: result.error || result
                    });
                    return false;
                }

                console.log('WHATSAPP TEXT ACCEPTED:', {
                    messageId: result?.messages?.[0]?.id || null
                });

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
        // SEND APPROVED ORDER TEMPLATE TO CUSTOMER
        // =====================================================

        async function sendCustomerOrderConfirmation(rawOrder) {
            try {
                const settings =
                    await getWhatsAppNotificationSettings();

                if (!settings) return false;

                if (settings.whatsapp_notify_customer !== true) {
                    console.log(
                        'Customer WhatsApp notifications are disabled.'
                    );
                    return false;
                }

                const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
                const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
                const templateName =
                    process.env.WHATSAPP_ORDER_TEMPLATE_NAME;
                const templateLanguage =
                    process.env.WHATSAPP_ORDER_TEMPLATE_LANGUAGE || 'ar';
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

                const order = normalizeOrder(rawOrder);

                const customerPhone = normalizeWhatsAppNumber(
                    order.whatsapp || order.phone
                );

                if (!customerPhone || customerPhone.length < 10) {
                    console.error(
                        'Invalid customer WhatsApp number.',
                        {
                            orderNumber: order.order_number || order.id,
                            hasPhone: Boolean(order.phone),
                            hasWhatsApp: Boolean(order.whatsapp)
                        }
                    );
                    return false;
                }

                const orderNumber = String(
                    order.order_number || order.id || ''
                );

                const customerName = String(
                    order.customer_name || 'عميلنا العزيز'
                );

                const items = Array.isArray(order.items)
                    ? order.items.map(item => {
                        const name =
                            item.title ||
                            item.name ||
                            item.productName ||
                            'منتج';

                        const quantity = item.qty || item.quantity || 1;

                        return `${name} × ${quantity}`;
                    }).join('، ')
                    : 'تفاصيل الطلب متاحة لدى خدمة العملاء';

                const parameters = [
                    customerName,
                    orderNumber,
                    items.substring(0, 900),
                    String(Number(order.total || 0)),
                    String(Number(order.deposit_amount || 0)),
                    String(Number(order.remaining_amount || 0)),
                    String(servicePhone).trim()
                ];

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
                                components: [{
                                    type: 'body',
                                    parameters: parameters.map(value => ({
                                        type: 'text',
                                        text: String(value)
                                    }))
                                }]
                            }
                        })
                    }
                );

                const result = await response.json().catch(() => ({}));

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
                        messageId: result?.messages?.[0]?.id || null
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

        async function notifyWhatsAppOrder(event, rawOrder) {
            try {
                const settings =
                    await getWhatsAppNotificationSettings();

                if (!settings) return false;

                if (
                    event === 'new_order' &&
                    settings.whatsapp_notify_new_order !== true
                ) return false;

                if (
                    event === 'order_status' &&
                    settings.whatsapp_notify_order_status !== true
                ) return false;

                if (
                    event === 'payment_status' &&
                    settings.whatsapp_notify_payment_status !== true
                ) return false;

                const order = normalizeOrder(rawOrder);

                const orderNumber =
                    order.order_number || order.id || 'غير متاح';

                const customerName = order.customer_name || 'غير متاح';
                const customerPhone = order.phone || 'غير متاح';
                const customerWhatsapp = order.whatsapp || customerPhone;
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

                            return `• ${name} × ${item.qty || item.quantity || 1}`;
                        }).join('\n')
                        : 'لا توجد تفاصيل منتجات';

                    message =
                        `🛒 طلب جديد - المتحدة للرتان والأثاث\n\n` +
                        `رقم الطلب: ${orderNumber}\n` +
                        `العميل: ${customerName}\n` +
                        `الهاتف: ${customerPhone}\n` +
                        `واتساب العميل: ${customerWhatsapp}\n` +
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
                item?.productId ?? item?.product_id ?? ''
            ).trim();
        }

        function getItemQuantity(item) {
            const qty = Number(item?.qty ?? item?.quantity ?? 1);

            if (
                !Number.isFinite(qty) ||
                !Number.isInteger(qty) ||
                qty < 1
            ) return null;

            return qty;
        }

        function getUpholsteryName(item) {
            return String(item?.upholsteryName || '').trim();
        }

        function isJaguarItem(item) {
            return /جاكوار|jaguar/i.test(getUpholsteryName(item));
        }

        function isSunBadgeItem(item) {
            if (isJaguarItem(item)) return false;

            const type = String(
                item?.upholsteryExtraType || ''
            ).toLowerCase().trim();

            return (
                type === 'sunbadge' ||
                /صن\s*بيدج|sun\s*badge|sunbedge/i.test(
                    getUpholsteryName(item)
                )
            );
        }

        // =====================================================
        // PUBLIC ORDER TRACKING
        // GET /api/orders?track=ORDER_NUMBER
        // =====================================================

        if (req.method === 'GET' && req.query?.track) {
            const trackId = String(req.query.track).trim();

            if (!trackId) {
                return res.status(400).json({
                    success: false,
                    error: 'رقم الطلب مطلوب.'
                });
            }

            const encodedTrackId = encodeURIComponent(trackId);

            let result = await getSupabaseJson(
                `${SUPABASE_URL}/rest/v1/orders` +
                `?select=*&order_number=eq.${encodedTrackId}&limit=1`
            );

            if (
                result.response.ok &&
                Array.isArray(result.data) &&
                result.data.length === 0
            ) {
                result = await getSupabaseJson(
                    `${SUPABASE_URL}/rest/v1/orders` +
                    `?select=*&id=eq.${encodedTrackId}&limit=1`
                );
            }

            if (
                result.response.ok &&
                Array.isArray(result.data) &&
                result.data.length === 0
            ) {
                result = await getSupabaseJson(
                    `${SUPABASE_URL}/rest/v1/orders` +
                    `?select=*&order_number=ilike.${encodedTrackId}&limit=1`
                );
            }

            if (!result.response.ok) {
                console.error(
                    'ORDER TRACKING DATABASE ERROR:',
                    result.response.status,
                    result.data || result.text
                );

                return res.status(500).json({
                    success: false,
                    error: 'حدث خطأ أثناء البحث عن الطلب.'
                });
            }

            if (!Array.isArray(result.data) || result.data.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'لم يتم العثور على طلب بهذا الرقم.'
                });
            }

            const order = normalizeOrder(result.data[0]);

            const publicOrder = {
                id: order.id,
                order_number: order.order_number || order.id,
                status: order.status || 'New',
                created_at: order.created_at || null,
                updated_at: order.updated_at || null,

                customer_name: order.customer_name,
                phone: order.phone,
                customer_phone: order.customer_phone,
                customerPhone: order.customerPhone,
                whatsapp: order.whatsapp,
                whatsapp_number: order.whatsapp_number,
                whatsappNumber: order.whatsappNumber,

                customer: order.customer,

                governorate: order.governorate,
                city: order.city,
                address: order.address,

                shipping_method:
                    order.shipping_method || order.delivery_method || '',

                shipping_cost: Number(order.shipping_cost || 0),
                payment_method: order.payment_method || '',
                payment_status: order.payment_status || 'Pending',
                deposit_percent: Number(order.deposit_percent || 0),

                deposit_amount: Number(
                    order.deposit_amount ?? order.deposit ?? 0
                ),

                remaining_amount: Number(order.remaining_amount || 0),
                subtotal: Number(order.subtotal || 0),
                sunBadgeFee: Number(order.sunbadge_fee || 0),
                sunbadge_fee: Number(order.sunbadge_fee || 0),
                discount: Number(order.discount || 0),
                total: Number(order.total || 0),

                items: Array.isArray(order.items)
                    ? order.items
                    : Array.isArray(order.products)
                        ? order.products
                        : [],

                notes: order.notes || order.customer_notes || ''
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

            const items = Array.isArray(order.items) ? order.items : [];

            if (items.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'الطلب لا يحتوي على منتجات'
                });
            }

            const productIds = [...new Set(items.map(getProductId))];

            if (productIds.some(id => !id)) {
                return res.status(400).json({
                    success: false,
                    error:
                        'يوجد منتج بدون معرف صالح. حدّث السلة ثم حاول مرة أخرى.'
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
                const fee = Number(product.sunbadge_fee ?? 0);

                if (!Number.isFinite(price) || price < 0) {
                    return res.status(400).json({
                        success: false,
                        error:
                            'سعر أحد المنتجات غير صالح في قاعدة البيانات.'
                    });
                }

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

                const unitPrice = product.price;
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

                const sunbadgeUnitFee = isSunBadgeItem(item)
                    ? product.sunbadgeFee
                    : 0;

                const sunbadgeLineFee = sunbadgeUnitFee * qty;

                if (
                    !Number.isFinite(sunbadgeLineFee) ||
                    !Number.isFinite(totalSunBadgeFee + sunbadgeLineFee)
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
                    lineTotal: itemSubtotal + sunbadgeLineFee,
                    upholsteryExtraType: isSunBadgeItem(item)
                        ? 'sunbadge'
                        : (item.upholsteryExtraType || 'none')
                });
            }

            const shippingCost = toNonNegativeNumber(
                order.shippingCost ?? order.shipping_cost,
                0
            );

            const requestedDiscount = toNonNegativeNumber(
                order.discount,
                0
            );

            const beforeDiscount =
                subtotal + totalSunBadgeFee + shippingCost;

            const discount = Math.min(requestedDiscount, beforeDiscount);
            const total = Math.max(0, beforeDiscount - discount);

            const rawDepositPercent = Number(
                order.depositPercent ?? order.deposit_percent ?? 30
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
            const remainingAmount = Math.max(0, total - depositAmount);

            const customerName = String(getCustomerField(
                order,
                'name',
                'customer_name',
                'customerName',
                'customer_full_name',
                'customerFullName',
                'full_name',
                'fullName'
            )).trim();

            const customerPhone = String(getCustomerField(
                order,
                'phone',
                'customer_phone',
                'customerPhone',
                'phone_number',
                'phoneNumber',
                'customer_phone_number',
                'customerPhoneNumber',
                'mobile',
                'mobile_number',
                'mobileNumber',
                'telephone',
                'tel'
            )).trim();

            const customerWhatsapp = String(firstNonEmpty(
                getCustomerField(
                    order,
                    'whatsapp',
                    'whats_app',
                    'whatsapp_number',
                    'whatsappNumber',
                    'whatsapp_phone',
                    'whatsappPhone',
                    'customer_whatsapp',
                    'customerWhatsapp',
                    'customer_whatsapp_number',
                    'customerWhatsappNumber'
                ),
                customerPhone
            )).trim();

            const customerGov = String(getCustomerField(
                order,
                'gov',
                'governorate',
                'customer_governorate',
                'customerGovernorate'
            )).trim();

            const customerCity = String(getCustomerField(
                order,
                'city',
                'customer_city',
                'customerCity'
            )).trim();

            const customerAddress = String(getCustomerField(
                order,
                'address',
                'customer_address',
                'customerAddress'
            )).trim();

            if (
                !customerName ||
                !customerPhone ||
                !customerGov ||
                !customerCity ||
                !customerAddress
            ) {
                console.error('INCOMPLETE CUSTOMER DATA:', {
                    orderNumber: requestedOrderNumber,
                    hasName: Boolean(customerName),
                    hasPhone: Boolean(customerPhone),
                    hasWhatsApp: Boolean(customerWhatsapp),
                    hasGovernorate: Boolean(customerGov),
                    hasCity: Boolean(customerCity),
                    hasAddress: Boolean(customerAddress),
                    receivedKeys: Object.keys(order),
                    customerKeys: getCustomerObjects(order).map(
                        item => Object.keys(item)
                    )
                });

                return res.status(400).json({
                    success: false,
                    error:
                        'بيانات العميل غير مكتملة. راجع الاسم والهاتف والمحافظة والمدينة والعنوان.'
                });
            }

            const insertPayload = {
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
                    order.delivery_method ??
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

            const finalOrder = normalizeOrder({
                ...savedOrder,
                order_number: String(
                    savedOrder.order_number || requestedOrderNumber
                ).trim()
            });

            // فشل واتساب لا يلغي نجاح حفظ الطلب.
            await notifyWhatsAppOrder('new_order', finalOrder);
            await sendCustomerOrderConfirmation(finalOrder);

            return res.status(201).json({
                success: true,
                order: finalOrder
            });
        }

        // =====================================================
        // ADMIN OPERATIONS REQUIRE TOKEN
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
            const { response, data } = await getSupabaseJson(
                `${SUPABASE_URL}/rest/v1/orders` +
                '?select=*&order=created_at.desc'
            );

            if (!response.ok) {
                console.error('SUPABASE GET ORDERS ERROR:', data);

                return res.status(response.status).json({
                    success: false,
                    error:
                        data?.message ||
                        data?.error ||
                        'فشل جلب الطلبات.'
                });
            }

            const orders = Array.isArray(data)
                ? data.map(normalizeOrder)
                : [];

            return res.status(200).json({
                success: true,
                orders
            });
        }

        // =====================================================
        // DELETE ORDER
        // =====================================================

        if (req.method === 'DELETE') {
            const orderId = String(req.query?.id || '').trim();

            if (!orderId) {
                return res.status(400).json({
                    success: false,
                    error: 'رقم الطلب غير موجود.'
                });
            }

            const { response, data } = await getSupabaseJson(
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
                console.error('SUPABASE DELETE ORDER ERROR:', data);

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
            const orderId = String(req.query?.id || '').trim();

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

                if (!allowedPaymentStatuses.includes(body.paymentStatus)) {
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
                    error: 'لم يتم إرسال حالة الطلب أو حالة الدفع.'
                });
            }

            const oldOrderResult = await getSupabaseJson(
                `${SUPABASE_URL}/rest/v1/orders` +
                `?id=eq.${encodeURIComponent(orderId)}&select=*&limit=1`
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
                    error: 'الطلب غير موجود في قاعدة البيانات.'
                });
            }

            const oldOrder = normalizeOrder(oldOrderResult.data[0]);

            const { response, data } = await getSupabaseJson(
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
                console.error('SUPABASE UPDATE ORDER ERROR:', data);

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

            const updatedOrder = normalizeOrder(data[0]);

            if (
                updateData.status !== undefined &&
                updateData.status !== oldOrder.status
            ) {
                await notifyWhatsAppOrder(
                    'order_status',
                    updatedOrder
                );
            }

            if (
                updateData.payment_status !== undefined &&
                updateData.payment_status !== oldOrder.payment_status
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
