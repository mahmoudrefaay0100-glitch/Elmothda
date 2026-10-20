
export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const {
        WHATSAPP_ACCESS_TOKEN,
        WHATSAPP_PHONE_NUMBER_ID,
        WHATSAPP_CUSTOMER_SERVICE_PHONE,
        WHATSAPP_VERIFY_TOKEN,
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY
    } = process.env;

    const DB_URL = (
        SUPABASE_URL ||
        'https://kxtiqtcxkcwdvljiadfn.supabase.co'
    ).replace(/\/+$/, '');

    const GRAPH_URL =
        `https://graph.facebook.com/v23.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

    const REQUEST_TIMEOUT_MS = 6500;

    // =====================================================
    // HELPERS
    // =====================================================

    function sendError(status, error, details) {
        const payload = { success: false, error };

        if (details !== undefined) {
            payload.details = details;
        }

        return res.status(status).json(payload);
    }

    function cleanText(value, fallback = 'غير محدد') {
        if (
            value === undefined ||
            value === null ||
            String(value).trim() === ''
        ) {
            return fallback;
        }

        return String(value)
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
            .trim();
    }

    function firstAvailable(...values) {
        for (const value of values) {
            if (
                value !== undefined &&
                value !== null &&
                value !== ''
            ) {
                return value;
            }
        }

        return null;
    }

    function safeNumber(value, fallback = 0) {
        if (
            value === undefined ||
            value === null ||
            value === ''
        ) {
            return fallback;
        }

        const number = Number(value);

        return Number.isFinite(number) ? number : fallback;
    }

    function formatMoney(value) {
        return safeNumber(value).toLocaleString('ar-EG') + ' ج.م';
    }

    function parseBody(value) {
        if (typeof value === 'string') {
            try {
                return JSON.parse(value);
            } catch {
                return null;
            }
        }

        return value && typeof value === 'object'
            ? value
            : null;
    }

    function normalizeEgyptianWhatsAppNumber(value) {
        let number = String(value || '')
            .trim()
            .replace(/[\s()+.-]/g, '');

        if (!/^\d+$/.test(number)) {
            throw new Error('رقم واتساب يحتوي على أحرف غير صالحة.');
        }

        if (number.startsWith('00')) {
            number = number.slice(2);
        }

        if (number.startsWith('01') && number.length === 11) {
            number = '20' + number.slice(1);
        } else if (number.startsWith('1') && number.length === 10) {
            number = '20' + number;
        }

        if (
            number.length < 8 ||
            number.length > 15 ||
            number.startsWith('0')
        ) {
            throw new Error('رقم واتساب ليس بصيغة دولية صحيحة.');
        }

        return number;
    }

    function isEnabled(value, fallback = false) {
        if (typeof value === 'boolean') {
            return value;
        }

        if (value === 1 || value === '1' || value === 'true') {
            return true;
        }

        if (value === 0 || value === '0' || value === 'false') {
            return false;
        }

        return fallback;
    }

    function getEventType(body) {
        const raw = String(
            firstAvailable(
                body.notificationType,
                body.notification_type,
                body.eventType,
                body.event_type,
                body.event,
                body.type,
                'new_order'
            )
        ).toLowerCase().trim();

        if (
            [
                'payment_status',
                'payment-status',
                'payment_updated',
                'payment_updated_status',
                'payment'
            ].includes(raw)
        ) {
            return 'payment_status';
        }

        if (
            [
                'order_status',
                'order-status',
                'status_updated',
                'order_updated',
                'status'
            ].includes(raw)
        ) {
            return 'order_status';
        }

        return 'new_order';
    }

    // =====================================================
    // GET: META WEBHOOK VERIFICATION
    // =====================================================

    if (req.method === 'GET') {
        const mode = req.query?.['hub.mode'];
        const token = req.query?.['hub.verify_token'];
        const challenge = req.query?.['hub.challenge'];

        if (
            mode === 'subscribe' &&
            WHATSAPP_VERIFY_TOKEN &&
            token === WHATSAPP_VERIFY_TOKEN &&
            challenge !== undefined
        ) {
            console.log('WHATSAPP WEBHOOK VERIFIED');

            res.setHeader('Content-Type', 'text/plain; charset=utf-8');

            return res.status(200).send(String(challenge));
        }

        console.warn('WHATSAPP WEBHOOK VERIFICATION FAILED');

        return res.status(403).json({
            success: false,
            error: 'Webhook verification failed'
        });
    }

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'GET, POST');

        return sendError(405, 'Method not allowed');
    }

    const parsedBody = parseBody(req.body);

    if (!parsedBody) {
        return sendError(400, 'بيانات الطلب ليست بصيغة JSON صحيحة.');
    }

    // =====================================================
    // POST: META WEBHOOK
    // =====================================================

    if (parsedBody.object === 'whatsapp_business_account') {
        try {
            let statusCount = 0;

            for (const entry of (
                Array.isArray(parsedBody.entry) ? parsedBody.entry : []
            )) {
                for (const change of (
                    Array.isArray(entry?.changes) ? entry.changes : []
                )) {
                    const value = change?.value || {};

                    for (const item of (
                        Array.isArray(value.statuses) ? value.statuses : []
                    )) {
                        statusCount++;

                        const errors = Array.isArray(item.errors)
                            ? item.errors.map(error => ({
                                code: error.code ?? null,
                                title: error.title ?? null,
                                message: error.message ?? null,
                                details:
                                    error.error_data?.details ?? null
                            }))
                            : [];

                        console.log('WHATSAPP DELIVERY STATUS:', JSON.stringify({
                            messageId: item.id ?? null,
                            status: item.status ?? 'unknown',
                            recipient: item.recipient_id ?? null,
                            timestamp: item.timestamp ?? null,
                            errors
                        }));
                    }

                    for (const message of (
                        Array.isArray(value.messages) ? value.messages : []
                    )) {
                        console.log('WHATSAPP INCOMING MESSAGE:', JSON.stringify({
                            messageId: message.id ?? null,
                            from: message.from ?? null,
                            type: message.type ?? null,
                            timestamp: message.timestamp ?? null
                        }));
                    }
                }
            }

            // Meta تحتاج استجابة سريعة لاستلام Webhook.
            return res.status(200).json({
                success: true,
                statusCount
            });
        } catch (error) {
            console.error(
                'WHATSAPP WEBHOOK ERROR:',
                error?.message || 'Unknown error'
            );

            // لا نكشف بيانات الرسائل أو أسرار الربط.
            return res.status(200).json({ success: true });
        }
    }

    // =====================================================
    // ORDER NOTIFICATIONS
    // =====================================================

    try {
        if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
            console.error('WHATSAPP CONFIGURATION MISSING:', {
                hasAccessToken: Boolean(WHATSAPP_ACCESS_TOKEN),
                hasPhoneNumberId: Boolean(WHATSAPP_PHONE_NUMBER_ID)
            });

            return sendError(
                500,
                'إعدادات واتساب غير مكتملة في Vercel.'
            );
        }

        if (!SUPABASE_SERVICE_ROLE_KEY) {
            console.error('SUPABASE SERVICE ROLE KEY IS MISSING');

            return sendError(
                500,
                'إعدادات قراءة مفاتيح إشعارات واتساب غير مكتملة.'
            );
        }

        const body = parsedBody;
        const order =
            body.order ||
            body.data?.order ||
            body.data ||
            body;

        if (
            !order ||
            typeof order !== 'object' ||
            Array.isArray(order)
        ) {
            return sendError(400, 'بيانات الطلب غير صالحة.');
        }

        const eventType = getEventType(body);

        // =================================================
        // READ LIVE NOTIFICATION SWITCHES FROM SUPABASE
        // =================================================

        let settingsResponse;

        try {
            settingsResponse = await fetch(
                `${DB_URL}/rest/v1/site_settings` +
                '?select=whatsapp_notify_new_order' +
                ',whatsapp_notify_order_status' +
                ',whatsapp_notify_payment_status' +
                ',whatsapp_notify_customer&limit=1',
                {
                    method: 'GET',
                    headers: {
                        apikey: SUPABASE_SERVICE_ROLE_KEY,
                        Authorization:
                            `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                        Accept: 'application/json'
                    },
                    cache: 'no-store',
                    signal: AbortSignal.timeout(3000)
                }
            );
        } catch (error) {
            console.error('WHATSAPP SETTINGS READ FAILED:', {
                message: error?.message || 'Unknown error'
            });

            return sendError(
                503,
                'تعذر قراءة إعدادات إشعارات واتساب. لم يتم إرسال الرسالة.'
            );
        }

        if (!settingsResponse.ok) {
            const errorText = await settingsResponse.text().catch(() => '');

            console.error('WHATSAPP SETTINGS HTTP ERROR:', {
                status: settingsResponse.status,
                response: errorText.slice(0, 500)
            });

            return sendError(
                502,
                'فشل تحميل مفاتيح إشعارات واتساب من قاعدة البيانات.'
            );
        }

        let settingsRows;

        try {
            settingsRows = await settingsResponse.json();
        } catch {
            return sendError(
                502,
                'تعذر قراءة إعدادات إشعارات واتساب.'
            );
        }

        if (!Array.isArray(settingsRows) || settingsRows.length === 0) {
            return sendError(
                503,
                'لا توجد إعدادات متجر محفوظة لتحديد إشعارات واتساب.'
            );
        }

        const settings = settingsRows[0];

        const switches = {
            newOrder: isEnabled(
                settings.whatsapp_notify_new_order,
                true
            ),
            orderStatus: isEnabled(
                settings.whatsapp_notify_order_status,
                true
            ),
            paymentStatus: isEnabled(
                settings.whatsapp_notify_payment_status,
                true
            ),
            customer: isEnabled(
                settings.whatsapp_notify_customer,
                false
            )
        };

        const adminNotificationEnabled =
            eventType === 'new_order'
                ? switches.newOrder
                : eventType === 'order_status'
                    ? switches.orderStatus
                    : switches.paymentStatus;

        if (!adminNotificationEnabled && !switches.customer) {
            console.log('WHATSAPP NOTIFICATION SKIPPED:', {
                eventType,
                reason: 'Disabled in site_settings'
            });

            return res.status(200).json({
                success: true,
                skipped: true,
                reason: 'notification_disabled',
                eventType
            });
        }

        // =================================================
        // ORDER DATA
        // =================================================

        const customer =
            order.customer && typeof order.customer === 'object'
                ? order.customer
                : {};

        const orderNumber = cleanText(
            firstAvailable(
                order.order_number,
                order.orderNumber,
                order.id
            )
        );

        const customerName = cleanText(
            firstAvailable(
                customer.name,
                order.customer_name,
                order.customerName,
                order.name
            )
        );

        const customerPhone = firstAvailable(
            customer.phone,
            order.customer_phone,
            order.customerPhone,
            order.phone
        );

        const items = Array.isArray(order.items) ? order.items : [];

        const itemsText = items.length
            ? items.map((item, index) => {
                item = item && typeof item === 'object' ? item : {};

                const name = cleanText(
                    firstAvailable(item.productTitle, item.name, item.title),
                    'منتج'
                );

                const qty = Math.max(
                    0,
                    safeNumber(firstAvailable(item.qty, item.quantity), 1)
                );

                const unitPrice = safeNumber(
                    firstAvailable(
                        item.unitPrice,
                        item.unit_price,
                        item.price
                    )
                );

                const savedTotal = firstAvailable(
                    item.lineTotal,
                    item.line_total,
                    item.totalPrice,
                    item.total_price,
                    item.itemTotal,
                    item.itemSubtotal,
                    item.item_subtotal
                );

                const lineTotal = savedTotal !== null
                    ? safeNumber(savedTotal, unitPrice * qty)
                    : unitPrice * qty;

                const details = [
                    `${index + 1}- ${name}`,
                    `الكمية: ${qty}`,
                    `سعر الوحدة: ${formatMoney(unitPrice)}`,
                    `إجمالي المنتج: ${formatMoney(lineTotal)}`
                ];

                const upholstery = firstAvailable(
                    item.upholsteryName,
                    item.upholstery_name,
                    item.upholstery
                );

                const cushionColor = firstAvailable(
                    item.cushionColor,
                    item.cushion_color
                );

                const wickerColor = firstAvailable(
                    item.wickerColor,
                    item.wicker_color
                );

                if (upholstery) {
                    details.push(`التنجيد: ${cleanText(upholstery)}`);
                }

                if (cushionColor) {
                    details.push(`لون المخدة: ${cleanText(cushionColor)}`);
                }

                if (wickerColor) {
                    details.push(`لون الرتان: ${cleanText(wickerColor)}`);
                }

                return details.join('\n');
            }).join('\n\n')
            : 'لا توجد منتجات مسجلة في بيانات الطلب.';

        const subtotal = safeNumber(
            firstAvailable(order.subtotal, order.subTotal)
        );

        const sunbadgeFee = safeNumber(
            firstAvailable(
                order.sunbadge_fee,
                order.sunBadgeFee,
                order.sunbadgeFee
            )
        );

        const shippingCost = safeNumber(
            firstAvailable(order.shippingCost, order.shipping_cost)
        );

        const discount = safeNumber(order.discount);

        const total = safeNumber(
            firstAvailable(order.total, order.grandTotal, order.grand_total)
        );

        const depositPercent = safeNumber(
            firstAvailable(order.depositPercent, order.deposit_percent)
        );

        const depositAmount = safeNumber(
            firstAvailable(
                order.depositAmount,
                order.deposit_amount,
                order.deposit
            )
        );

        const remainingAmount = safeNumber(
            firstAvailable(order.remainingAmount, order.remaining_amount)
        );

        const paymentStatus = cleanText(
            firstAvailable(order.paymentStatus, order.payment_status),
            'Pending'
        );

        const orderStatus = cleanText(order.status, 'New');

        const eventTitle = {
            new_order: '🔔 طلب جديد',
            order_status: '📌 تحديث حالة الطلب',
            payment_status: '💳 تحديث حالة الدفع'
        }[eventType];

        const adminMessage = [
            `${eventTitle} - المتحدة للرتان والأثاث`,
            '',
            '📦 رقم الطلب:',
            orderNumber,
            '',
            '👤 العميل:',
            customerName,
            '',
            '📞 الهاتف:',
            cleanText(customerPhone),
            '',
            '📍 المحافظة:',
            cleanText(firstAvailable(
                customer.gov,
                customer.governorate,
                order.governorate
            )),
            '',
            '🏙️ المدينة:',
            cleanText(firstAvailable(customer.city, order.city)),
            '',
            '🏠 العنوان:',
            cleanText(firstAvailable(customer.address, order.address)),
            '',
            '🚚 طريقة الاستلام:',
            cleanText(firstAvailable(
                order.shippingMethod,
                order.shipping_method
            )),
            '',
            '🛒 المنتجات:',
            itemsText,
            '',
            '💰 إجمالي المنتجات:',
            formatMoney(subtotal),
            '',
            '🧵 رسوم صن بيدج:',
            formatMoney(sunbadgeFee),
            '',
            '🚚 تكلفة الشحن:',
            formatMoney(shippingCost),
            '',
            '🏷️ الخصم:',
            formatMoney(discount),
            '',
            '💰 إجمالي الطلب:',
            formatMoney(total),
            '',
            '💵 نسبة العربون:',
            `${depositPercent}%`,
            '',
            '💳 قيمة العربون:',
            formatMoney(depositAmount),
            '',
            '💰 المبلغ المتبقي:',
            formatMoney(remainingAmount),
            '',
            '💳 طريقة الدفع:',
            cleanText(firstAvailable(
                order.paymentMethod,
                order.payment_method
            )),
            '',
            '📌 حالة الدفع:',
            paymentStatus,
            '',
            '📝 حالة الطلب:',
            orderStatus
        ].join('\n');

        // =================================================
        // META SEND HELPER
        // =================================================

        async function sendWhatsAppMessage(to, message) {
            const response = await fetch(GRAPH_URL, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to,
                    type: 'text',
                    text: {
                        preview_url: false,
                        body: message.length > 4000
                            ? message.slice(0, 3950) +
                              '\n\nتم اختصار تفاصيل الرسالة لطولها.'
                            : message
                    }
                }),
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
            });

            let data = {};

            try {
                data = await response.json();
            } catch {
                data = {};
            }

            if (!response.ok) {
                const metaError = data?.error || {};

                console.error('WHATSAPP API ERROR:', JSON.stringify({
                    status: response.status,
                    code: metaError.code ?? null,
                    errorSubcode: metaError.error_subcode ?? null,
                    type: metaError.type ?? null,
                    message: metaError.message ?? null,
                    details: metaError.error_data?.details ?? null,
                    fbtrace_id: metaError.fbtrace_id ?? null
                }));

                return {
                    success: false,
                    status: response.status,
                    error:
                        metaError.error_data?.details ||
                        metaError.message ||
                        'فشل إرسال الرسالة إلى Meta.',
                    metaCode: metaError.code ?? null
                };
            }

            return {
                success: true,
                messageId: data?.messages?.[0]?.id || null
            };
        }

        // =================================================
        // SEND ADMIN NOTIFICATION
        // =================================================

        const tasks = [];

        if (adminNotificationEnabled) {
            const adminPhone = normalizeEgyptianWhatsAppNumber(
                WHATSAPP_CUSTOMER_SERVICE_PHONE || '01042056131'
            );

            tasks.push({
                target: 'admin',
                promise: sendWhatsAppMessage(adminPhone, adminMessage)
            });
        }

        // =================================================
        // SEND CUSTOMER NOTIFICATION
        // =================================================

        if (switches.customer && customerPhone) {
            try {
                const customerNumber =
                    normalizeEgyptianWhatsAppNumber(customerPhone);

                const customerMessage = [
                    `أهلًا ${customerName} 👋`,
                    '',
                    'شكرًا لطلبك من المتحدة للرتان والأثاث.',
                    '',
                    `رقم الطلب: ${orderNumber}`,
                    `حالة الطلب: ${orderStatus}`,
                    `حالة الدفع: ${paymentStatus}`,
                    `إجمالي الطلب: ${formatMoney(total)}`,
                    `المبلغ المتبقي: ${formatMoney(remainingAmount)}`,
                    '',
                    'للاستفسار عن طلبك، تواصل مع خدمة العملاء.'
                ].join('\n');

                tasks.push({
                    target: 'customer',
                    promise: sendWhatsAppMessage(
                        customerNumber,
                        customerMessage
                    )
                });
            } catch (error) {
                console.error('WHATSAPP CUSTOMER NUMBER ERROR:', {
                    message: error?.message || 'Invalid customer number'
                });

                tasks.push({
                    target: 'customer',
                    promise: Promise.resolve({
                        success: false,
                        error: 'رقم واتساب العميل غير صالح.'
                    })
                });
            }
        }

        if (tasks.length === 0) {
            return res.status(200).json({
                success: true,
                skipped: true,
                reason: 'no_enabled_recipients'
            });
        }

        const results = await Promise.all(
            tasks.map(async task => ({
                target: task.target,
                result: await task.promise.catch(error => {
                    console.error('WHATSAPP SEND CONNECTION ERROR:', {
                        target: task.target,
                        message: error?.message || 'Connection failed'
                    });

                    return {
                        success: false,
                        error:
                            error?.name === 'TimeoutError' ||
                            error?.name === 'AbortError'
                                ? 'انتهت مهلة الاتصال بمنصة واتساب.'
                                : 'تعذر الاتصال بمنصة واتساب.'
                    };
                })
            }))
        );

        const failures = results.filter(
            item => !item.result.success
        );

        const successes = results.filter(
            item => item.result.success
        );

        console.log('WHATSAPP NOTIFICATION SUMMARY:', JSON.stringify({
            orderNumber,
            eventType,
            attempted: results.length,
            succeeded: successes.length,
            failed: failures.length,
            targets: results.map(item => ({
                target: item.target,
                success: item.result.success,
                messageId: item.result.messageId || null,
                metaCode: item.result.metaCode || null
            }))
        }));

        if (failures.length > 0) {
            return res.status(successes.length > 0 ? 207 : 502).json({
                success: successes.length > 0,
                partial: successes.length > 0,
                orderNumber,
                eventType,
                results: results.map(item => ({
                    target: item.target,
                    success: item.result.success,
                    messageId: item.result.messageId || null,
                    error: item.result.success
                        ? undefined
                        : item.result.error,
                    metaCode: item.result.metaCode || null
                }))
            });
        }

        return res.status(200).json({
            success: true,
            message: 'قبلت منصة واتساب طلب إرسال الرسائل.',
            orderNumber,
            eventType,
            results: results.map(item => ({
                target: item.target,
                success: true,
                messageId: item.result.messageId
            }))
        });

    } catch (error) {
        console.error('SEND WHATSAPP ORDER ERROR:', {
            message: error?.message || 'Unknown error',
            name: error?.name || null
        });

        return res.status(500).json({
            success: false,
            error: error?.message ||
                'حدث خطأ أثناء تجهيز إشعار واتساب.'
        });
    }
}
