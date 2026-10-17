
export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    // =====================================
    // 1) تحقق Meta من عنوان Webhook
    // =====================================
    if (req.method === 'GET') {
        const mode = req.query?.['hub.mode'];
        const token = req.query?.['hub.verify_token'];
        const challenge = req.query?.['hub.challenge'];
        const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

        if (
            mode === 'subscribe' &&
            verifyToken &&
            token === verifyToken &&
            challenge !== undefined
        ) {
            console.log('WHATSAPP WEBHOOK VERIFIED');

            res.setHeader(
                'Content-Type',
                'text/plain; charset=utf-8'
            );

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

        return res.status(405).json({
            success: false,
            error: 'Method not allowed'
        });
    }

    // =====================================
    // 2) استقبال إشعارات Meta
    // =====================================
    let webhookBody = req.body || {};

    if (typeof webhookBody === 'string') {
        try {
            webhookBody = JSON.parse(webhookBody);
        } catch {
            return res.status(400).json({
                success: false,
                error: 'بيانات الطلب ليست بصيغة JSON صحيحة.'
            });
        }
    }

    // لو الطلب وارد من Meta، نعالج حالات الرسائل
    // وننهي التنفيذ قبل كود إرسال إشعار الطلب.
    if (webhookBody?.object === 'whatsapp_business_account') {
        try {
            const deliveryStatuses = [];

            const entries = Array.isArray(webhookBody.entry)
                ? webhookBody.entry
                : [];

            for (const entry of entries) {
                const changes = Array.isArray(entry?.changes)
                    ? entry.changes
                    : [];

                for (const change of changes) {
                    const value = change?.value || {};

                    const statuses = Array.isArray(value.statuses)
                        ? value.statuses
                        : [];

                    for (const item of statuses) {
                        const errors = Array.isArray(item.errors)
                            ? item.errors.map(error => ({
                                code: error.code ?? null,
                                title: error.title ?? null,
                                message: error.message ?? null,
                                details:
                                    error.error_data?.details ?? null
                            }))
                            : [];

                        const record = {
                            messageId: item.id ?? null,
                            status: item.status ?? 'unknown',
                            recipient: item.recipient_id ?? null,
                            timestamp: item.timestamp ?? null,
                            errors
                        };

                        deliveryStatuses.push(record);

                        console.log(
                            'WHATSAPP DELIVERY STATUS:',
                            JSON.stringify(record)
                        );
                    }

                    // تسجيل معلومات أساسية عن الرسائل الواردة
                    // دون تسجيل محتوى الرسالة.
                    const messages = Array.isArray(value.messages)
                        ? value.messages
                        : [];

                    for (const message of messages) {
                        console.log(
                            'WHATSAPP INCOMING MESSAGE:',
                            JSON.stringify({
                                messageId: message.id ?? null,
                                from: message.from ?? null,
                                type: message.type ?? null,
                                timestamp: message.timestamp ?? null
                            })
                        );
                    }
                }
            }

            return res.status(200).json({
                success: true,
                statusCount: deliveryStatuses.length
            });
        } catch (error) {
            console.error(
                'WHATSAPP WEBHOOK ERROR:',
                error?.message || 'Unknown error'
            );

            return res.status(200).json({
                success: true
            });
        }
    }

    // =====================================
    // 3) الوظيفة الأصلية: إرسال إشعار الطلب
    // =====================================
    try {
        const {
            WHATSAPP_ACCESS_TOKEN,
            WHATSAPP_PHONE_NUMBER_ID,
            WHATSAPP_CUSTOMER_SERVICE_PHONE
        } = process.env;

        if (
            !WHATSAPP_ACCESS_TOKEN ||
            !WHATSAPP_PHONE_NUMBER_ID
        ) {
            console.error(
                'WhatsApp configuration error:',
                JSON.stringify({
                    hasAccessToken: Boolean(
                        WHATSAPP_ACCESS_TOKEN
                    ),
                    hasPhoneNumberId: Boolean(
                        WHATSAPP_PHONE_NUMBER_ID
                    )
                })
            );

            return res.status(500).json({
                success: false,
                error: 'إعدادات واتساب غير مكتملة في Vercel.'
            });
        }

        // =====================================
        // أدوات مساعدة
        // =====================================

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

            return Number.isFinite(number)
                ? number
                : fallback;
        }

        function formatMoney(value) {
            return safeNumber(value, 0)
                .toLocaleString('ar-EG') + ' ج.م';
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

        // توحيد أرقام مصر إلى الصيغة الدولية.
        // مثال: 01042056131 -> 201042056131
        function normalizeEgyptianWhatsAppNumber(value) {
            let number = String(value || '')
                .trim()
                .replace(/[\s()+.-]/g, '');

            if (!/^\d+$/.test(number)) {
                throw new Error(
                    'رقم استقبال إشعارات واتساب يحتوي على أحرف غير صالحة.'
                );
            }

            if (number.startsWith('00')) {
                number = number.slice(2);
            }

            if (
                number.startsWith('01') &&
                number.length === 11
            ) {
                number = '20' + number.slice(1);
            } else if (
                number.startsWith('1') &&
                number.length === 10
            ) {
                number = '20' + number;
            }

            if (
                number.length < 8 ||
                number.length > 15 ||
                number.startsWith('0')
            ) {
                throw new Error(
                    'رقم استقبال إشعارات واتساب ليس بصيغة دولية صحيحة.'
                );
            }

            return number;
        }

        // =====================================
        // قراءة بيانات الطلب
        // =====================================

        let body = req.body || {};

        if (typeof body === 'string') {
            try {
                body = JSON.parse(body);
            } catch {
                return res.status(400).json({
                    success: false,
                    error: 'بيانات الطلب ليست بصيغة JSON صحيحة.'
                });
            }
        }

        const order =
            body?.order ||
            body?.data?.order ||
            body?.data ||
            body;

        if (
            !order ||
            typeof order !== 'object' ||
            Array.isArray(order)
        ) {
            return res.status(400).json({
                success: false,
                error: 'بيانات الطلب غير صالحة.'
            });
        }

        const customer =
            order.customer &&
            typeof order.customer === 'object'
                ? order.customer
                : {};

        const items = Array.isArray(order.items)
            ? order.items
            : [];

        // =====================================
        // تجهيز المنتجات
        // =====================================

        const itemsText = items.length
            ? items.map((item, index) => {
                item =
                    item && typeof item === 'object'
                        ? item
                        : {};

                const name = cleanText(
                    firstAvailable(
                        item.productTitle,
                        item.name,
                        item.title
                    ),
                    'منتج'
                );

                const qty = Math.max(
                    0,
                    safeNumber(
                        firstAvailable(item.qty, item.quantity),
                        1
                    )
                );

                const unitPrice = safeNumber(
                    firstAvailable(
                        item.unitPrice,
                        item.unit_price,
                        item.price
                    ),
                    0
                );

                const savedLineTotal = firstAvailable(
                    item.lineTotal,
                    item.line_total,
                    item.totalPrice,
                    item.total_price,
                    item.itemTotal,
                    item.itemSubtotal,
                    item.item_subtotal
                );

                const lineTotal =
                    savedLineTotal !== null
                        ? safeNumber(
                            savedLineTotal,
                            unitPrice * qty
                        )
                        : unitPrice * qty;

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

                const details = [
                    `${index + 1}- ${name}`,
                    `الكمية: ${qty}`,
                    `سعر الوحدة: ${formatMoney(unitPrice)}`,
                    `إجمالي المنتج: ${formatMoney(lineTotal)}`
                ];

                if (upholstery) {
                    details.push(
                        `التنجيد: ${cleanText(upholstery)}`
                    );
                }

                if (cushionColor) {
                    details.push(
                        `لون المخدة: ${cleanText(cushionColor)}`
                    );
                }

                if (wickerColor) {
                    details.push(
                        `لون الرتان: ${cleanText(wickerColor)}`
                    );
                }

                return details.join('\n');
            }).join('\n\n')
            : 'لا توجد منتجات مسجلة في بيانات الطلب.';

        // =====================================
        // بيانات الطلب
        // =====================================

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

        const customerPhone = cleanText(
            firstAvailable(
                customer.phone,
                order.customer_phone,
                order.customerPhone,
                order.phone
            )
        );

        const governorate = cleanText(
            firstAvailable(
                customer.gov,
                customer.governorate,
                order.governorate
            )
        );

        const city = cleanText(
            firstAvailable(customer.city, order.city)
        );

        const address = cleanText(
            firstAvailable(customer.address, order.address)
        );

        const subtotal = safeNumber(
            firstAvailable(
                order.subtotal,
                order.subTotal
            ),
            0
        );

        const sunbadgeFee = safeNumber(
            firstAvailable(
                order.sunbadge_fee,
                order.sunBadgeFee,
                order.sunbadgeFee
            ),
            0
        );

        const shippingCost = safeNumber(
            firstAvailable(
                order.shippingCost,
                order.shipping_cost
            ),
            0
        );

        const discount = safeNumber(order.discount, 0);

        const total = safeNumber(
            firstAvailable(
                order.total,
                order.grandTotal,
                order.grand_total
            ),
            0
        );

        const depositPercent = safeNumber(
            firstAvailable(
                order.depositPercent,
                order.deposit_percent
            ),
            0
        );

        const depositAmount = safeNumber(
            firstAvailable(
                order.depositAmount,
                order.deposit_amount,
                order.deposit
            ),
            0
        );

        const remainingAmount = safeNumber(
            firstAvailable(
                order.remainingAmount,
                order.remaining_amount
            ),
            0
        );

        // =====================================
        // إنشاء الرسالة
        // =====================================

        const message = [
            '🔔 طلب جديد - المتحدة للرتان والأثاث',
            '',
            '📦 رقم الطلب:',
            orderNumber,
            '',
            '👤 العميل:',
            customerName,
            '',
            '📞 الهاتف:',
            customerPhone,
            '',
            '📍 المحافظة:',
            governorate,
            '',
            '🏙️ المدينة:',
            city,
            '',
            '🏠 العنوان:',
            address,
            '',
            '🚚 طريقة الاستلام:',
            cleanText(
                firstAvailable(
                    order.shippingMethod,
                    order.shipping_method
                ),
                'غير محددة'
            ),
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
            cleanText(
                firstAvailable(
                    order.paymentMethod,
                    order.payment_method
                ),
                'غير محددة'
            ),
            '',
            '📌 حالة الدفع:',
            cleanText(
                firstAvailable(
                    order.paymentStatus,
                    order.payment_status
                ),
                'Pending'
            ),
            '',
            '📝 حالة الطلب:',
            cleanText(order.status, 'New')
        ].join('\n');

        const finalMessage =
            message.length > 4000
                ? message.slice(0, 3950) +
                  '\n\nتم اختصار تفاصيل الرسالة لطولها.'
                : message;

        // =====================================
        // تحديد رقم استقبال إشعارات الإدارة
        // =====================================

        // رقم خدمة العملاء الافتراضي: 01042056131
        // يمكن تغييره من إعدادات Vercel.
        const recipient = normalizeEgyptianWhatsAppNumber(
            WHATSAPP_CUSTOMER_SERVICE_PHONE || '01042056131'
        );

        // =====================================
        // إرسال الإشعار من رقم Meta المربوط
        // =====================================

        const response = await fetch(
            `https://graph.facebook.com/v23.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: recipient,
                    type: 'text',
                    text: {
                        preview_url: false,
                        body: finalMessage
                    }
                })
            }
        );

        let data = {};

        try {
            data = await response.json();
        } catch {
            data = {};
        }

        if (!response.ok) {
            const metaError = data?.error || {};

            // لا تسجل التوكن أو ترويسات المصادقة.
            console.error(
                'WHATSAPP API ERROR:',
                JSON.stringify({
                    status: response.status,
                    code: metaError.code ?? null,
                    errorSubcode: metaError.error_subcode ?? null,
                    type: metaError.type ?? null,
                    message: metaError.message ?? null,
                    details: metaError.error_data?.details ?? null,
                    fbtrace_id: metaError.fbtrace_id ?? null,
                    orderNumber
                })
            );

            return res.status(502).json({
                success: false,
                error:
                    metaError.error_data?.details ||
                    metaError.message ||
                    'فشل إرسال إشعار واتساب. راجع سجل أخطاء Vercel.',
                metaCode: metaError.code ?? null,
                orderNumber
            });
        }

        const messageId = data?.messages?.[0]?.id || null;

        console.log(
            'WHATSAPP ORDER NOTIFICATION ACCEPTED:',
            JSON.stringify({
                orderNumber,
                recipient,
                messageId
            })
        );

        return res.status(200).json({
            success: true,
            message: 'قبلت منصة واتساب طلب إرسال الإشعار.',
            orderNumber,
            messageId
        });

    } catch (error) {
        console.error(
            'SEND WHATSAPP ORDER ERROR:',
            error?.message || error
        );

        return res.status(500).json({
            success: false,
            error:
                error?.message ||
                'حدث خطأ أثناء تجهيز إشعار واتساب.'
        });
    }
}
