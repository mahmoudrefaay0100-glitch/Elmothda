module.exports = async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    // Meta تتحقق من صحة عنوان Webhook باستخدام GET
    if (req.method === 'GET') {
        const url = new URL(
            req.url,
            'https://www.elmothdafurniture.com'
        );

        const mode = url.searchParams.get('hub.mode');
        const token = url.searchParams.get('hub.verify_token');
        const challenge = url.searchParams.get('hub.challenge');

        const expectedToken =
            process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

        if (
            mode === 'subscribe' &&
            expectedToken &&
            token === expectedToken &&
            challenge
        ) {
            return res.status(200).send(challenge);
        }

        return res.status(403).send('Webhook verification failed');
    }

    // استقبال إشعارات واتساب من Meta باستخدام POST
    if (req.method === 'POST') {
        try {
            const body = req.body || {};

            const entries = Array.isArray(body.entry)
                ? body.entry
                : [];

            for (const entry of entries) {
                const changes = Array.isArray(entry.changes)
                    ? entry.changes
                    : [];

                for (const change of changes) {
                    if (change.field !== 'messages') {
                        continue;
                    }

                    const value = change.value || {};
                    const statuses = Array.isArray(value.statuses)
                        ? value.statuses
                        : [];

                    for (const item of statuses) {
                        console.log(
                            'WHATSAPP DELIVERY STATUS:',
                            JSON.stringify({
                                messageId: item.id || null,
                                status: item.status || 'unknown',
                                recipient: item.recipient_id || null,
                                timestamp: item.timestamp || null,
                                errors: item.errors || []
                            })
                        );
                    }

                    const messages = Array.isArray(value.messages)
                        ? value.messages
                        : [];

                    for (const message of messages) {
                        console.log(
                            'WHATSAPP INCOMING MESSAGE:',
                            JSON.stringify({
                                messageId: message.id || null,
                                from: message.from || null,
                                type: message.type || null,
                                timestamp: message.timestamp || null
                            })
                        );
                    }
                }
            }

            // نؤكد الاستلام بسرعة حتى لا تعيد Meta إرسال الحدث
            return res.status(200).send('EVENT_RECEIVED');
        } catch (error) {
            console.error(
                'WHATSAPP WEBHOOK ERROR:',
                error.message
            );

            return res.status(500).send('Webhook processing failed');
        }
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({
        success: false,
        error: 'Method not allowed'
    });
};
