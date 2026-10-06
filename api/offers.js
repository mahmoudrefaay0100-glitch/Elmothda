export default async function handler(req, res) {

    res.setHeader(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate'
    );

    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    try {

        const {
            SUPABASE_URL,
            SUPABASE_ANON_KEY,
            SUPABASE_SERVICE_ROLE_KEY
        } = process.env;


        // =========================
        // التحقق من إعدادات Supabase
        // =========================

        if (
            !SUPABASE_URL ||
            !SUPABASE_ANON_KEY ||
            !SUPABASE_SERVICE_ROLE_KEY
        ) {

            return res.status(500).json({
                success: false,
                error:
                    'Supabase environment variables are missing'
            });
        }


        // =========================
        // التحقق من المدير
        // =========================

        async function verifyAdmin() {

            const authHeader =
                req.headers.authorization || '';

            const token =
                authHeader
                    .replace(/^Bearer\s+/i, '')
                    .trim();

            if (!token) {
                return false;
            }

            try {

                const response =
                    await fetch(
                        `${SUPABASE_URL}/auth/v1/user`,
                        {
                            method: 'GET',

                            headers: {
                                apikey:
                                    SUPABASE_ANON_KEY,

                                Authorization:
                                    `Bearer ${token}`
                            }
                        }
                    );


                if (!response.ok) {
                    return false;
                }


                const user =
                    await response.json();


                return !!user?.id;

            } catch {

                return false;
            }
        }


        // =========================
        // Headers قاعدة البيانات
        // =========================

        const dbHeaders = {

            apikey:
                SUPABASE_SERVICE_ROLE_KEY,

            Authorization:
                `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,

            'Content-Type':
                'application/json',

            Prefer:
                'return=representation'
        };


        // =====================================================
        // GET
        // =====================================================

        if (req.method === 'GET') {

            const isAdmin =
                await verifyAdmin();


            // =========================
            // لو مدير
            // يرجع كل العروض
            // =========================

            if (isAdmin) {

                const response =
                    await fetch(
                        `${SUPABASE_URL}/rest/v1/offers?select=*&order=sort_order.asc,created_at.desc`,
                        {
                            method: 'GET',
                            headers: dbHeaders
                        }
                    );


                const data =
                    await response.json();


                if (!response.ok) {

                    return res.status(
                        response.status
                    ).json({
                        success: false,
                        error:
                            data?.message ||
                            data?.error ||
                            'فشل تحميل العروض'
                    });
                }


                return res.status(200).json({

                    success: true,

                    offers:
                        Array.isArray(data)
                            ? data
                            : []
                });
            }


            // =========================
            // الزائر
            // يرجع العروض الفعالة فقط
            // =========================

            const now =
                new Date().toISOString();


            const response =
                await fetch(
                    `${SUPABASE_URL}/rest/v1/offers?select=*&is_active=eq.true&order=sort_order.asc,created_at.desc`,
                    {
                        method: 'GET',
                        headers: dbHeaders
                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                return res.status(
                    response.status
                ).json({
                    success: false,
                    error:
                        data?.message ||
                        data?.error ||
                        'فشل تحميل العروض'
                });
            }


            const activeOffers =
                Array.isArray(data)
                    ? data.filter(offer => {

                        const starts =
                            !offer.start_date ||
                            new Date(
                                offer.start_date
                            ) <= new Date(now);

                        const ends =
                            !offer.end_date ||
                            new Date(
                                offer.end_date
                            ) >= new Date(now);

                        return starts && ends;
                    })
                    : [];


            return res.status(200).json({

                success: true,

                offers:
                    activeOffers
            });
        }


        // =====================================================
        // POST
        // إضافة عرض جديد
        // =====================================================

        if (req.method === 'POST') {

            const isAdmin =
                await verifyAdmin();


            if (!isAdmin) {

                return res.status(401).json({
                    success: false,
                    error:
                        'غير مسموح. يجب تسجيل الدخول كمدير.'
                });
            }


            const body =
                req.body || {};


            const title =
                String(
                    body.title || ''
                ).trim();


            if (!title) {

                return res.status(400).json({
                    success: false,
                    error:
                        'عنوان العرض مطلوب'
                });
            }


            const offerData = {

                title,

                description:
                    body.description || null,

                image_url:
                    body.image_url || null,

                old_price:
                    body.old_price !== undefined &&
                    body.old_price !== null &&
                    body.old_price !== ''
                        ? Number(body.old_price)
                        : null,

                offer_price:
                    body.offer_price !== undefined &&
                    body.offer_price !== null &&
                    body.offer_price !== ''
                        ? Number(body.offer_price)
                        : null,

                button_text:
                    body.button_text ||
                    'اطلب العرض',

                button_link:
                    body.button_link ||
                    null,

                start_date:
                    body.start_date ||
                    null,

                end_date:
                    body.end_date ||
                    null,

                is_active:
                    body.is_active !== false,

                show_popup:
                    body.show_popup !== false,

                show_homepage:
                    body.show_homepage !== false,

                sort_order:
                    Number(
                        body.sort_order
                    ) || 0
            };


            const response =
                await fetch(
                    `${SUPABASE_URL}/rest/v1/offers`,
                    {
                        method: 'POST',

                        headers: dbHeaders,

                        body:
                            JSON.stringify(
                                offerData
                            )
                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                return res.status(
                    response.status
                ).json({
                    success: false,
                    error:
                        data?.message ||
                        data?.error ||
                        'فشل إضافة العرض'
                });
            }


            return res.status(201).json({

                success: true,

                message:
                    'تمت إضافة العرض بنجاح',

                offer:
                    Array.isArray(data)
                        ? data[0]
                        : data
            });
        }


        // =====================================================
        // PUT
        // تعديل عرض
        // =====================================================

        if (req.method === 'PUT') {

            const isAdmin =
                await verifyAdmin();


            if (!isAdmin) {

                return res.status(401).json({
                    success: false,
                    error:
                        'غير مسموح. يجب تسجيل الدخول كمدير.'
                });
            }


            const body =
                req.body || {};


            const id =
                body.id;


            if (!id) {

                return res.status(400).json({
                    success: false,
                    error:
                        'رقم العرض مطلوب'
                });
            }


            const title =
                String(
                    body.title || ''
                ).trim();


            if (!title) {

                return res.status(400).json({
                    success: false,
                    error:
                        'عنوان العرض مطلوب'
                });
            }


            const offerData = {

                title,

                description:
                    body.description || null,

                image_url:
                    body.image_url || null,

                old_price:
                    body.old_price !== undefined &&
                    body.old_price !== null &&
                    body.old_price !== ''
                        ? Number(body.old_price)
                        : null,

                offer_price:
                    body.offer_price !== undefined &&
                    body.offer_price !== null &&
                    body.offer_price !== ''
                        ? Number(body.offer_price)
                        : null,

                button_text:
                    body.button_text ||
                    'اطلب العرض',

                button_link:
                    body.button_link ||
                    null,

                start_date:
                    body.start_date ||
                    null,

                end_date:
                    body.end_date ||
                    null,

                is_active:
                    body.is_active !== false,

                show_popup:
                    body.show_popup !== false,

                show_homepage:
                    body.show_homepage !== false,

                sort_order:
                    Number(
                        body.sort_order
                    ) || 0,

                updated_at:
                    new Date().toISOString()
            };


            const response =
                await fetch(
                    `${SUPABASE_URL}/rest/v1/offers?id=eq.${encodeURIComponent(id)}`,
                    {
                        method: 'PATCH',

                        headers: dbHeaders,

                        body:
                            JSON.stringify(
                                offerData
                            )
                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                return res.status(
                    response.status
                ).json({
                    success: false,
                    error:
                        data?.message ||
                        data?.error ||
                        'فشل تعديل العرض'
                });
            }


            return res.status(200).json({

                success: true,

                message:
                    'تم تعديل العرض بنجاح',

                offer:
                    Array.isArray(data)
                        ? data[0]
                        : data
            });
        }


        // =====================================================
        // DELETE
        // حذف عرض
        // =====================================================

        if (req.method === 'DELETE') {

            const isAdmin =
                await verifyAdmin();


            if (!isAdmin) {

                return res.status(401).json({
                    success: false,
                    error:
                        'غير مسموح. يجب تسجيل الدخول كمدير.'
                });
            }


            const id =
                req.query?.id;


            if (!id) {

                return res.status(400).json({
                    success: false,
                    error:
                        'رقم العرض مطلوب'
                });
            }


            const response =
                await fetch(
                    `${SUPABASE_URL}/rest/v1/offers?id=eq.${encodeURIComponent(id)}`,
                    {
                        method: 'DELETE',
                        headers: dbHeaders
                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                return res.status(
                    response.status
                ).json({
                    success: false,
                    error:
                        data?.message ||
                        data?.error ||
                        'فشل حذف العرض'
                });
            }


            return res.status(200).json({

                success: true,

                message:
                    'تم حذف العرض بنجاح',

                offer:
                    Array.isArray(data)
                        ? data[0]
                        : data
            });
        }


        // =====================================================
        // Method غير مدعوم
        // =====================================================

        return res.status(405).json({

            success: false,

            error:
                'Method not allowed'
        });

    } catch (error) {

        console.error(
            'OFFERS API ERROR:',
            error
        );

        return res.status(500).json({

            success: false,

            error:
                error?.message ||
                'حدث خطأ في API العروض'
        });
    }
}
