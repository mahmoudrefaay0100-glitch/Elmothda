module.exports = async function handler(req, res) {

    const SUPABASE_URL =
        process.env.SUPABASE_URL;

    const SUPABASE_SERVICE_ROLE_KEY =
        process.env.SUPABASE_SERVICE_ROLE_KEY;

    const ADMIN_EMAIL =
        process.env.ADMIN_EMAIL ||
        'admin@elmothda.com';


    // =====================================================
    // التحقق من إعدادات Supabase
    // =====================================================

    if (
        !SUPABASE_URL ||
        !SUPABASE_SERVICE_ROLE_KEY
    ) {

        return res.status(500).json({
            success: false,
            error:
                'إعدادات Supabase غير موجودة في Vercel'
        });

    }


    // =====================================================
    // التحقق من الأدمن
    // =====================================================

    let isAdmin = false;

    const authHeader =
        req.headers.authorization || '';

    const token =
        authHeader
            .replace('Bearer ', '')
            .trim();


    if (token) {

        try {

            const authResponse =
                await fetch(
                    SUPABASE_URL +
                    '/auth/v1/user',
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
                    String(user.email)
                        .toLowerCase() ===
                    String(ADMIN_EMAIL)
                        .toLowerCase()
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

            const response =
                await fetch(
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
                        }
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

                return res.status(500).json({
                    success: false,
                    error:
                        'تعذر قراءة بيانات العروض'
                });

            }


            if (!response.ok) {

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
            // الاحتفاظ بالعروض المنتهية
            // =================================================

            const now =
                new Date();


            if (Array.isArray(offers)) {

                offers =
                    offers.filter(
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
                    );

            } else {

                offers = [];

            }


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
                    error?.message ||
                    'حدث خطأ أثناء تحميل العروض'

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


            const insertData = {

                title:
                    body.title ?? '',

                description:
                    body.description ?? '',

                image_url:
                    body.image_url ?? '',

                old_price:
                    body.old_price === '' ||
                    body.old_price === undefined
                        ? null
                        : body.old_price,

                offer_price:
                    body.offer_price === '' ||
                    body.offer_price === undefined
                        ? null
                        : body.offer_price,

                button_text:
                    body.button_text ||
                    'اطلب العرض',

                button_link:
                    body.button_link ?? '',

                start_date:
                    body.start_date || null,

                end_date:
                    body.end_date || null,

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
                            JSON.stringify(
                                insertData
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

            } catch {

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
                        data?.message ||
                        data?.error ||
                        'فشل إنشاء العرض'

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
                    error?.message ||
                    'حدث خطأ أثناء إنشاء العرض'

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


            // ---------------------------------------------
            // التحقق من ID
            // ---------------------------------------------

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


            // =================================================
            // مهم:
            // لا نحول الـ ID إلى رقم هنا.
            // نخليه كما وصل من الواجهة.
            // =================================================

            const updateData = {

                title:
                    body.title ?? '',

                description:
                    body.description ?? '',

                image_url:
                    body.image_url ?? '',

                old_price:
                    body.old_price === '' ||
                    body.old_price === undefined
                        ? null
                        : body.old_price,

                offer_price:
                    body.offer_price === '' ||
                    body.offer_price === undefined
                        ? null
                        : body.offer_price,

                button_text:
                    body.button_text ||
                    'اطلب العرض',

                button_link:
                    body.button_link ?? '',

                start_date:
                    body.start_date || null,

                end_date:
                    body.end_date || null,

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


            console.log(
                '🔥 PUT OFFER ID:',
                id
            );

            console.log(
                '🔥 PUT OFFER DATA:',
                updateData
            );


            // =================================================
            // PATCH
            // =================================================

            const response =
                await fetch(
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


            let data = [];


            try {

                data =
                    responseText
                        ? JSON.parse(
                            responseText
                        )
                        : [];

            } catch {

                data = {
                    error:
                        responseText
                };

            }


            console.log(
                '🔥 PUT SUPABASE RESPONSE:',
                data
            );


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


            // =================================================
            // لو Supabase رجع صف
            // =================================================

            if (
                Array.isArray(data) &&
                data.length > 0
            ) {

                const savedOffer =
                    data[0];


                console.log(
                    '🔥🔥 OFFER UPDATED:',
                    savedOffer
                );

                console.log(
                    '🔥🔥 SAVED END DATE:',
                    savedOffer.end_date
                );


                return res.status(200).json({

                    success: true,

                    message:
                        'تم تعديل العرض بنجاح',

                    offer:
                        savedOffer

                });

            }


            // =================================================
            // لو PATCH نجح لكن لم يرجع representation
            // نقرأ العرض مباشرة
            // =================================================

            const verifyResponse =
                await fetch(
                    SUPABASE_URL +
                    '/rest/v1/offers?id=eq.' +
                    encodeURIComponent(
                        String(id)
                    ) +
                    '&select=*',
                    {

                        method: 'GET',

                        headers: {

                            apikey:
                                SUPABASE_SERVICE_ROLE_KEY,

                            Authorization:
                                'Bearer ' +
                                SUPABASE_SERVICE_ROLE_KEY

                        }

                    }
                );


            const verifyText =
                await verifyResponse.text();


            let verifyData = [];


            try {

                verifyData =
                    verifyText
                        ? JSON.parse(
                            verifyText
                        )
                        : [];

            } catch {

                verifyData = [];

            }


            if (
                !verifyResponse.ok ||
                !Array.isArray(verifyData) ||
                verifyData.length === 0
            ) {

                return res.status(500).json({

                    success: false,

                    error:
                        'تم إرسال التعديل ولكن تعذر قراءة العرض بعد الحفظ'

                });

            }


            const savedOffer =
                verifyData[0];


            console.log(
                '🔥🔥 VERIFIED OFFER:',
                savedOffer
            );


            return res.status(200).json({

                success: true,

                message:
                    'تم تعديل العرض بنجاح',

                offer:
                    savedOffer

            });


        } catch (error) {

            console.error(
                'PUT OFFERS ERROR:',
                error
            );

            return res.status(500).json({

                success: false,

                error:
                    error?.message ||
                    'حدث خطأ أثناء تعديل العرض'

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


            const response =
                await fetch(
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

            } catch {

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
                        data?.message ||
                        data?.error ||
                        'فشل حذف العرض'

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
                    error?.message ||
                    'حدث خطأ أثناء حذف العرض'

            });

        }

    }


    // =====================================================
    // METHOD NOT ALLOWED
    // =====================================================

    res.setHeader(
        'Allow',
        'GET, POST, PUT, DELETE'
    );


    return res.status(405).json({

        success: false,

        error:
            'Method Not Allowed'

    });

};

