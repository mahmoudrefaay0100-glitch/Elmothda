module.exports = async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    // ==========================================
    // 1) التحقق من ربط Webhook مع Meta
    // ==========================================
    if (req.method === 'GET') {
        const mode = req.query?.['hub.mode'];
        const token = req.query?.['hub.verify_token'];
        const challenge = req.query?.['hub.challenge'];
        const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

        if (
            mode === 'subscribe' &&
            verifyToken &&
            token === verifyToken &&
            challenge
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

    // ==========================================
    // 2) استقبال إشعارات Meta
    // ==========================================
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'GET, POST');

        return res.status(405).json({
            success: false,
            error: 'Method not allowed'
        });
    }

    try {
        let body = req.body || {};

        // التعامل مع الحالة التي يصل فيها المحتوى كنص
        if (typeof body === 'string') {
            try {
                body = JSON.parse(body);
            } catch (parseError) {
                console.error(
                    'WHATSAPP WEBHOOK INVALID JSON:',
                    parseError.message
                );

                // نرجع 200 لتجنب تكرار إشعار غير قابل للمعالجة
                return res.status(200).json({
                    success: true,
                    ignored: true
                });
            }
        }

        // تجاهل أي إشعار ليس من نوع WhatsApp Business Account
        if (body.object !== 'whatsapp_business_account') {
            return res.status(200).json({
                success: true,
                ignored: true
            });
        }

        const deliveryStatuses = [];
        const incomingMessages = [];

        const entries = Array.isArray(body.entry)
            ? body.entry
            : [];

        for (const entry of entries) {
            const changes = Array.isArray(entry.changes)
                ? entry.changes
                : [];

            for (const change of changes) {
                const value = change?.value || {};

                // ==========================================
                // 3) حالات الرسائل: sent / delivered / read / failed
                // ==========================================
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

                    const statusRecord = {
                        messageId: item.id ?? null,
                        status: item.status ?? 'unknown',
                        recipient: item.recipient_id ?? null,
                        timestamp: item.timestamp ?? null,
                        errors
                    };

                    deliveryStatuses.push(statusRecord);

                    console.log(
                        'WHATSAPP DELIVERY STATUS:',
                        JSON.stringify(statusRecord)
                    );
                }

                // ==========================================
                // 4) تسجيل الرسائل الواردة إن وُجدت
                // لا نسجل محتوى الرسالة أو بيانات شخصية
                // ==========================================
                const messages = Array.isArray(value.messages)
                    ? value.messages
                    : [];

                for (const message of messages) {
                    const incomingRecord = {
                        messageId: message.id ?? null,
                        from: message.from ?? null,
                        type: message.type ?? null,
                        timestamp: message.timestamp ?? null
                    };

                    incomingMessages.push(incomingRecord);

                    console.log(
                        'WHATSAPP INCOMING MESSAGE:',
                        JSON.stringify(incomingRecord)
                    );
                }
            }
        }

        // يجب الرد سريعًا على Meta لتأكيد استلام الإشعار
        return res.status(200).json({
            success: true,
            statusCount: deliveryStatuses.length,
            incomingCount: incomingMessages.length
        });
    } catch (error) {
        console.error(
            'WHATSAPP WEBHOOK ERROR:',
            error?.message || 'Unknown error'
        );

        // تأكيد الاستلام لتقليل إعادة إرسال الحدث بسبب خطأ داخلي
        return res.status(200).json({
            success: true
        });
    }
};
