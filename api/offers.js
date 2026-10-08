```javascript
export default async function handler(req, res) {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY =
        process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ADMIN_EMAIL =
        process.env.ADMIN_EMAIL || 'admin@elmothda.com';

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(500).json({
            success: false,
            error: 'إعدادات Supabase غير موجودة في Vercel'
        });
    }

    // =====================================================
    // التحقق من الأدمن
    // =====================================================

    let isAdmin = false;

    const authHeader =
        req.headers.authorization || '';

    const token =
        authHeader.replace('Bearer ', '').trim();

    if (token) {
        try {
            const authResponse = await fetch(
                SUPABASE_URL + '/auth/v1/user',
                {
                    method: 'GET',
                    headers: {
                        apikey:
                            SUPABASE_SERVICE_ROLE_KEY,
                        Authorization:
                            'Bearer ' + token
                    }
                }
            );

            if (authResponse.ok) {
                const user =
                    await authResponse.json();

                if (
                    user &&
                    user.email &&
                    String(user.email).toLowerCase() ===
                    String(ADMIN_EMAIL).toLowerCase()
                ) {
                    isAdmin = true;
                }
            }
        } catch (error) {
            console.error(
                'ADMIN AUTH ERROR:',
                error
            );
        }
    }

    // =====================================================
    // GET
    // =====================================================

    if (req.method === 'GET') {
        try {
            const response = await fetch(
                SUPABASE_URL +
                '/rest/v1/offers?select=*&is_active=eq.true&order=sort_order.asc,created_at.desc',
                {
                    method: 'GET',
                    headers: {
                        apikey:
                            SUPABASE_SERVICE_ROLE_KEY,
                        Authorization:
                            'Bearer ' +
                            SUPABASE_SERVICE_ROLE_KEY
                    },
                    cache: 'no-store'
                }
            );

            const responseText =
                await response.text();

            let offers = [];

            try {
                offers =
                    responseText
                        ? JSON.parse(responseText)
                        : [];
            } catch (error) {
                console.error(
                    'OFFERS JSON PARSE ERROR:',
                    responseText
                );

                return res.status(500).json({
                    success: false,
                    error:
                        'تعذر قراءة بيانات العروض'
                });
            }

            if (!response.ok) {
                console.error(
                    'SUPABASE OFFERS ERROR:',
                    response.status,
                    offers
                );

                return res.status(
                    response.status
                ).json({
                    success: false,
                    error:
                        offers &&
                        offers.message
                            ? offers.message
                            : 'فشل تحميل العروض'
                });
            }

            // =================================================
            // العروض:
            // - نستبعد غير النشط
            // - نستبعد العرض الذي لم يبدأ بعد
            // - لا نستبعد العرض المنتهي
            //   حتى يظهر على الموقع كـ "منتهي"
            // =================================================

            const now =
                new Date();

            offers =
                Array.isArray(offers)
                    ? offers.filter(
                        function (offer) {
                            if (!offer) {
                                return false;
                            }

                            if (
                                offer.is_active ===
                                false
                            ) {
                                return false;
                            }

                            if (
                                offer.start_date
                            ) {
                                const startDate =
                                    new Date(
                                        offer.start_date
                                    );

                                if (
                                    !Number.isNaN(
                                        startDate.getTime()
                                    ) &&
                                    startDate > now
                                ) {
                                    return false;
                                }
                            }

                            return true;
                        }
                    )
                    : [];

            return res.status(200).json({
                success: true,
                offers: offers
            });

        } catch (error) {
            console.error(
                'GET OFFERS ERROR:',
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error &&
                    error.message
                        ? error.message
                        : 'حدث خطأ أثناء تحميل العروض'
            });
        }
    }

    // =====================================================
    // POST
    // =====================================================

    if (req.method === 'POST') {
        if (!isAdmin) {
            return res.status(401).json({
                success: false,
                error:
                    'غير مصرح لك بتنفيذ هذا الإجراء'
            });
        }

        try {
            const body =
                req.body || {};

            const response = await fetch(
                SUPABASE_URL +
                '/rest/v1/offers',
                {
                    method: 'POST',
                    headers: {
                        apikey:
                            SUPABASE_SERVICE_ROLE_KEY,
                        Authorization:
                            'Bearer ' +
                            SUPABASE_SERVICE_ROLE_KEY,
                        'Content-Type':
                            'application/json',
                        Prefer:
                            'return=representation'
                    },
                    body:
                        JSON.stringify(body)
                }
            );

            const responseText =
                await response.text();

            let data = {};

            try {
                data =
                    responseText
                        ? JSON.parse(
                            responseText
                        )
                        : {};
            } catch (error) {
                data = {
                    error:
                        responseText
                };
            }

            if (!response.ok) {
                return res.status(
                    response.status
                ).json({
                    success: false,
                    error:
                        data &&
                        data.message
                            ? data.message
                            : data &&
                              data.error
                                ? data.error
                                : 'فشل إنشاء العرض'
                });
            }

            return res.status(200).json({
                success: true,
                offer:
                    Array.isArray(data)
                        ? data[0]
                        : data
            });

        } catch (error) {
            console.error(
                'POST OFFERS ERROR:',
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error &&
                    error.message
                        ? error.message
                        : 'حدث خطأ أثناء إنشاء العرض'
            });
        }
    }

    // =====================================================
    // PUT
    // =====================================================

    if (req.method === 'PUT') {
        if (!isAdmin) {
            return res.status(401).json({
                success: false,
                error:
                    'غير مصرح لك بتنفيذ هذا الإجراء'
            });
        }

        try {
            const body =
                req.body || {};

            const id =
                body.id;

            if (
                id === undefined ||
                id === null ||
                String(id).trim() === ''
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        'رقم العرض مطلوب'
                });
            }

            const updateData =
                Object.assign(
                    {},
                    body
                );

            delete updateData.id;

            const response = await fetch(
                SUPABASE_URL +
                '/rest/v1/offers?id=eq.' +
                encodeURIComponent(
                    String(id)
                ),
                {
                    method: 'PATCH',
                    headers: {
                        apikey:
                            SUPABASE_SERVICE_ROLE_KEY,
                        Authorization:
                            'Bearer ' +
                            SUPABASE_SERVICE_ROLE_KEY,
                        'Content-Type':
                            'application/json',
                        Prefer:
                            'return=representation'
                    },
                    body:
                        JSON.stringify(
                            updateData
                        )
                }
            );

            const responseText =
                await response.text();

            let data = {};

            try {
                data =
                    responseText
                        ? JSON.parse(
                            responseText
                        )
                        : {};
            } catch (error) {
                data = {
                    error:
                        responseText
                };
            }

            if (!response.ok) {
                return res.status(
                    response.status
                ).json({
                    success: false,
                    error:
                        data &&
                        data.message
                            ? data.message
                            : data &&
                              data.error
                                ? data.error
                                : 'فشل تعديل العرض'
                });
            }

            return res.status(200).json({
                success: true,
                offer:
                    Array.isArray(data)
                        ? data[0]
                        : data
            });

        } catch (error) {
            console.error(
                'PUT OFFERS ERROR:',
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error &&
                    error.message
                        ? error.message
                        : 'حدث خطأ أثناء تعديل العرض'
            });
        }
    }

    // =====================================================
    // DELETE
    // =====================================================

    if (req.method === 'DELETE') {
        if (!isAdmin) {
            return res.status(401).json({
                success: false,
                error:
                    'غير مصرح لك بتنفيذ هذا الإجراء'
            });
        }

        try {
            const body =
                req.body || {};

            const id =
                body.id ||
                req.query.id;

            if (
                id === undefined ||
                id === null ||
                String(id).trim() === ''
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        'رقم العرض مطلوب للحذف'
                });
            }

            const response = await fetch(
                SUPABASE_URL +
                '/rest/v1/offers?id=eq.' +
                encodeURIComponent(
                    String(id)
                ),
                {
                    method: 'DELETE',
                    headers: {
                        apikey:
                            SUPABASE_SERVICE_ROLE_KEY,
                        Authorization:
                            'Bearer ' +
                            SUPABASE_SERVICE_ROLE_KEY,
                        Prefer:
                            'return=representation'
                    }
                }
            );

            const responseText =
                await response.text();

            let data = {};

            try {
                data =
                    responseText
                        ? JSON.parse(
                            responseText
                        )
                        : {};
            } catch (error) {
                data = {
                    raw:
                        responseText
                };
            }

            if (!response.ok) {
                return res.status(
                    response.status
                ).json({
                    success: false,
                    error:
                        data &&
                        data.message
                            ? data.message
                            : data &&
                              data.error
                                ? data.error
                                : 'فشل حذف العرض'
                });
            }

            return res.status(200).json({
                success: true,
                deleted:
                    Array.isArray(data)
                        ? data
                        : []
            });

        } catch (error) {
            console.error(
                'DELETE OFFERS ERROR:',
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error &&
                    error.message
                        ? error.message
                        : 'حدث خطأ أثناء حذف العرض'
            });
        }
    }

    res.setHeader(
        'Allow',
        'GET, POST, PUT, DELETE'
    );

    return res.status(405).json({
        success: false,
        error:
            'Method Not Allowed'
    });
}
```
