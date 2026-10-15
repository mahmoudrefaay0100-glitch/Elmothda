export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');

        return res.status(405).json({
            success: false,
            error: 'Method not allowed'
        });
    }

    try {
        const {
            WHATSAPP_ACCESS_TOKEN,
            WHATSAPP_PHONE_NUMBER_ID
        } = process.env;

        if (!WHATSAPP_ACCESS_TOKEN) {
            console.error(
                'WhatsApp configuration error: missing access token'
            );

            return res.status(500).json({
                success: false,
                error: 'إعدادات واتساب غير مكتملة: Access Token'
            });
        }

        if (!WHATSAPP_PHONE_NUMBER_ID) {
            console.error(
                'WhatsApp configuration error: missing phone number ID'
            );

            return res.status(500).json({
                success: false,
                error: 'إعدادات واتساب غير مكتملة: Phone Number ID'
            });
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
                    error: 'بيانات الطلب ليست بصيغة JSON صحيحة'
                });
            }
        }

        // دعم الطلب المباشر أو الطلب الموجود داخل order أو data.
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
                error: 'بيانات الطلب غير صالحة'
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

            // إزالة المحارف غير المناسبة في الرسالة
            return String(value)
                .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
                .trim();
        }

        // =====================================
        // تفاصيل المنتجات
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
                        firstAvailable(
                            item.qty,
                            item.quantity
                        ),
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

                // لا نضيف الرسوم مرة أخرى لو كانت داخلة بالفعل
                // في إجمالي السطر المحفوظ.
                const savedLineTotal = firstAvailable(
                    item.lineTotal,
                    item.line_total,
                    item.totalPrice,
                    item.total_price,
                    item.itemTotal
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
            : 'لا توجد منتجات مسجلة في بيانات الطلب';

        // =====================================
        // بيانات الطلب والإجماليات
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
                order.customerName
            )
        );

        const customerPhone = cleanText(
            firstAvailable(
                customer.phone,
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
            firstAvailable(
                customer.city,
                order.city
            )
        );

        const address = cleanText(
            firstAvailable(
                customer.address,
                order.address
            )
        );

        const subtotal = safeNumber(
            firstAvailable(
                order.subtotal,
                order.subTotal
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
                order.deposit_amount
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
            '🚚 تكلفة الشحن:',
            formatMoney(shippingCost),
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

        // حد احتياطي لطول الرسالة
        const finalMessage =
            message.length > 4000
                ? message.slice(0, 3950) +
                  '\n\nتم اختصار تفاصيل الرسالة لطولها.'
                : message;

        // =====================================
        // إرسال إشعار واتساب
        // =====================================

        const whatsappBusinessNumber = '201042056121';

        const response = await fetch(
            `https://graph.facebook.com/v23.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
            {
                method: 'POST',
                headers: {
                    Authorization:
                        `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: whatsappBusinessNumber,
                    type: 'text',
                    text: {
                        preview_url: false,
                        body: finalMessage
                    }
                })
            }
        );

        let data;

        try {
            data = await response.json();
        } catch {
            data = {};
        }

        if (!response.ok) {
            console.error(
                'WHATSAPP API ERROR:',
                JSON.stringify({
                    status: response.status,
                    error: data?.error || data
                })
            );

            return res.status(502).json({
                success: false,
                error:
                    data?.error?.message ||
                    'فشل إرسال إشعار واتساب. راجع سجل أخطاء Vercel.'
            });
        }

        const messageId =
            data?.messages?.[0]?.id || null;

        console.log(
            'WHATSAPP ORDER NOTIFICATION ACCEPTED:',
            JSON.stringify({
                orderNumber,
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
            error: 'حدث خطأ أثناء تجهيز إشعار واتساب.'
        });
    }
}
