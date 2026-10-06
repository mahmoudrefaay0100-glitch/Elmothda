export default async function handler(req, res) {
    if (req.method !== 'POST') {
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
            return res.status(500).json({
                success: false,
                error: 'WHATSAPP_ACCESS_TOKEN is missing'
            });
        }

        if (!WHATSAPP_PHONE_NUMBER_ID) {
            return res.status(500).json({
                success: false,
                error: 'WHATSAPP_PHONE_NUMBER_ID is missing'
            });
        }

        const order = req.body || {};

        const customer =
            order.customer || {};

        const items =
            Array.isArray(order.items)
                ? order.items
                : [];

        const itemsText =
            items.length
                ? items.map((item, index) => {
                    const name =
                        item.name ||
                        item.title ||
                        'منتج';

                    const qty =
                        Number(item.qty || 1);

                    const price =
                        Number(
                            item.unitPrice ??
                            item.price ??
                            0
                        );

                    return (
                        `${index + 1}- ${name}\n` +
                        `الكمية: ${qty}\n` +
                        `السعر: ${price.toLocaleString('ar-EG')} ج.م`
                    );
                }).join('\n\n')
                : 'لا توجد منتجات';

        const message =
`🔔 طلب Deposit جديد

📦 رقم الطلب:
${order.id || 'غير محدد'}

👤 العميل:
${customer.name || 'غير محدد'}

📞 الهاتف:
${customer.phone || 'غير محدد'}

📍 المحافظة:
${customer.gov || 'غير محدد'}

🏙️ المدينة:
${customer.city || 'غير محدد'}

🏠 العنوان:
${customer.address || 'غير محدد'}

🚚 طريقة الاستلام:
${order.shippingMethod || 'غير محددة'}

🛒 المنتجات:
${itemsText}

💰 الإجمالي:
${Number(order.total || 0).toLocaleString('ar-EG')} ج.م

💵 نسبة الـ Deposit:
${Number(order.depositPercent || 0)}%

💳 قيمة الـ Deposit:
${Number(order.depositAmount || 0).toLocaleString('ar-EG')} ج.م

💰 المتبقي:
${Number(order.remainingAmount || 0).toLocaleString('ar-EG')} ج.م

💳 طريقة الدفع:
${order.paymentMethod || 'Deposit'}

📌 حالة الدفع:
${order.paymentStatus || 'Pending'}

📝 حالة الطلب:
${order.status || 'New'}`;

        const response =
            await fetch(
                `https://graph.facebook.com/v23.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
                {
                    method: 'POST',

                    headers: {
                        'Authorization':
                            `Bearer ${WHATSAPP_ACCESS_TOKEN}`,

                        'Content-Type':
                            'application/json'
                    },

                    body: JSON.stringify({
                        messaging_product: 'whatsapp',

                        to: '201042056121',

                        type: 'text',

                        text: {
                            preview_url: false,
                            body: message
                        }
                    })
                }
            );

        const data =
            await response.json();

        if (!response.ok) {

            console.error(
                'WHATSAPP API ERROR:',
                data
            );

            return res.status(
                response.status
            ).json({
                success: false,
                error:
                    data?.error?.message ||
                    'فشل إرسال رسالة WhatsApp'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'تم إرسال إشعار WhatsApp',
            whatsapp: data
        });

    } catch (error) {

        console.error(
            'SEND WHATSAPP ORDER ERROR:',
            error
        );

        return res.status(500).json({
            success: false,
            error:
                error?.message ||
                'حدث خطأ أثناء إرسال WhatsApp'
        });
    }
}
