export default async function handler(req, res) {
    try {
        const SUPABASE_URL =
            process.env.SUPABASE_URL ||
            'https://kxtiqtcxkcwdvljiadfn.supabase.co';

        const SUPABASE_SERVICE_ROLE_KEY =
            process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!SUPABASE_SERVICE_ROLE_KEY) {
            return res.status(500).json({
                success: false,
                error: 'SUPABASE_SERVICE_ROLE_KEY is missing'
            });
        }

        const now = Date.now();

        // مدة اعتبار الزائر نشطًا: 2 دقيقة
        const activeWindow = 2 * 60 * 1000;

        // ------------------------------------------------
        // POST = تسجيل/تحديث زائر
        // ------------------------------------------------
        if (req.method === 'POST') {

            const visitorId =
                req.body?.visitorId;

            if (!visitorId) {
                return res.status(400).json({
                    success: false,
                    error: 'visitorId is required'
                });
            }

            const response =
                await fetch(
                    `${SUPABASE_URL}/rest/v1/active_visitors`,
                    {
                        method: 'POST',

                        headers: {
                            apikey:
                                SUPABASE_SERVICE_ROLE_KEY,

                            Authorization:
                                `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,

                            'Content-Type':
                                'application/json',

                            Prefer:
                                'resolution=merge-duplicates,return=minimal'
                        },

                        body: JSON.stringify({
                            visitor_id:
                                visitorId,

                            last_seen:
                                new Date(now).toISOString()
                        })
                    }
                );

            if (!response.ok) {
                const errorText =
                    await response.text();

                return res.status(
                    response.status
                ).json({
                    success: false,
                    error:
                        errorText ||
                        'Failed to update visitor'
                });
            }

            // حذف الزوار الذين لم يظهروا خلال آخر دقيقتين
            await fetch(
                `${SUPABASE_URL}/rest/v1/active_visitors?last_seen=lt.${encodeURIComponent(
                    new Date(
                        now - activeWindow
                    ).toISOString()
                )}`,
                {
                    method: 'DELETE',

                    headers: {
                        apikey:
                            SUPABASE_SERVICE_ROLE_KEY,

                        Authorization:
                            `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
                    }
                }
            );

            // حساب عدد الزوار النشطين
            const countResponse =
                await fetch(
                    `${SUPABASE_URL}/rest/v1/active_visitors?select=visitor_id`,
                    {
                        method: 'GET',

                        headers: {
                            apikey:
                                SUPABASE_SERVICE_ROLE_KEY,

                            Authorization:
                                `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
                        }
                    }
                );

            const visitors =
                await countResponse.json();

            return res.status(200).json({
                success: true,
                count:
                    Array.isArray(visitors)
                        ? visitors.length
                        : 0
            });
        }

        // ------------------------------------------------
        // GET = معرفة عدد الموجودين الآن
        // ------------------------------------------------
        if (req.method === 'GET') {

            const cutoff =
                new Date(
                    now - activeWindow
                ).toISOString();

            const response =
                await fetch(
                    `${SUPABASE_URL}/rest/v1/active_visitors?select=visitor_id&last_seen=gte.${encodeURIComponent(cutoff)}`,
                    {
                        method: 'GET',

                        headers: {
                            apikey:
                                SUPABASE_SERVICE_ROLE_KEY,

                            Authorization:
                                `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
                        }
                    }
                );

            const visitors =
                await response.json();

            return res.status(200).json({
                success: true,
                count:
                    Array.isArray(visitors)
                        ? visitors.length
                        : 0
            });
        }

        return res.status(405).json({
            success: false,
            error: 'Method not allowed'
        });

    } catch (error) {

        console.error(
            'VISITORS API ERROR:',
            error
        );

        return res.status(500).json({
            success: false,
            error:
                error?.message ||
                'حدث خطأ في عداد الزوار'
        });
    }
}
