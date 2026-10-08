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
            // لا نحذف العروض المنتهية
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


            // ---------------------------------------------
            // تجهيز بيانات العرض الجديد
            // ---------------------------------------------

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


            console.log(
                '🔥 CREATE OFFER DATA:',
                insertData
            );


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

            } catch (error) {

                data = {
                    error:
                        responseText
                };

            }


            if (!response.ok) {

                console.error(
                    'CREATE OFFER SUPABASE ERROR:',
                    data
                );

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


            const createdOffer =
                Array.isArray(data)
                    ? data[0]
                    : data;


            return res.status(200).json({

                success: true,

                offer:
                    createdOffer

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


            const realId =
                Number(id);


            if (
                !Number.isFinite(realId) ||
                realId <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        'رقم العرض غير صحيح'

                });

            }


            // =================================================
            // تجهيز بيانات التعديل
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


            // =================================================
            // تسجيل البيانات قبل الإرسال
            // =================================================

            console.log(
                '🔥🔥 UPDATE OFFER ID:',
                realId
            );

            console.log(
                '🔥🔥 UPDATE OFFER DATA:',
                updateData
            );

            console.log(
                '🔥🔥 UPDATE END DATE:',
                updateData.end_date
            );


            // =================================================
            // تنفيذ PATCH في Supabase
            // =================================================

            const updateResponse =
                await fetch(
                    SUPABASE_URL +
                    '/rest/v1/offers?id=eq.' +
                    encodeURIComponent(
                        String(realId)
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


            const updateText =
                await updateResponse.text();


            let updateResult = [];


            try {

                updateResult =
                    updateText
                        ? JSON.parse(
                            updateText
                        )
                        : [];

            } catch (error) {

                updateResult = {

                    error:
                        updateText

                };

            }


            // =================================================
            // فشل PATCH
            // =================================================

            if (!updateResponse.ok) {

                console.error(
                    '🔥 PATCH OFFER ERROR:',
                    updateResponse.status,
                    updateResult
                );

                return res.status(
                    updateResponse.status
                ).json({

                    success: false,

                    error:
                        updateResult &&
                        updateResult.message
                            ? updateResult.message
                            : updateResult &&
                              updateResult.error
                                ? updateResult.error
                                : 'فشل تعديل العرض'

                });

            }


            console.log(
                '🔥 PATCH RESULT:',
                updateResult
            );


            // =================================================
            // التأكد أن Supabase رجع صفًا
            // =================================================

            if (
                !Array.isArray(updateResult) ||
                updateResult.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    error:
                        'لم يتم العثور على العرض داخل قاعدة البيانات'

                });

            }


            // =================================================
            // قراءة العرض مرة أخرى من Supabase
            // =================================================

            const verifyResponse =
                await fetch(
                    SUPABASE_URL +
                    '/rest/v1/offers?id=eq.' +
                    encodeURIComponent(
                        String(realId)
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

                        },

                        cache:
                            'no-store'

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

            } catch (error) {

                console.error(
                    'VERIFY OFFER JSON ERROR:',
                    verifyText
                );

                return res.status(500).json({

                    success: false,

                    error:
                        'تم تعديل العرض ولكن تعذر التحقق من البيانات المحفوظة'

                });

            }


            if (!verifyResponse.ok) {

                console.error(
                    'VERIFY OFFER ERROR:',
                    verifyData
                );

                return res.status(500).json({

                    success: false,

                    error:
                        'تم تعديل العرض ولكن تعذر قراءة البيانات بعد الحفظ'

                });

            }


            if (
                !Array.isArray(verifyData) ||
                verifyData.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    error:
                        'لم يتم العثور على العرض بعد الحفظ'

                });

            }


            const savedOffer =
                verifyData[0];


            // =================================================
            // التأكد من end_date تحديدًا
            // =================================================

            if (
                updateData.end_date !== null &&
                String(
                    savedOffer.end_date || ''
                ) !==
                String(
                    updateData.end_date
                )
            ) {

                console.error(
                    '🔥🔥 END DATE WAS NOT SAVED',
                    {
                        sent:
                            updateData.end_date,

                        saved:
                            savedOffer.end_date
                    }
                );

                return res.status(500).json({

                    success: false,

                    error:
                        'تم إرسال تاريخ الانتهاء ولكن قاعدة البيانات لم تحفظ التاريخ الجديد',

                    sent_end_date:
                        updateData.end_date,

                    saved_end_date:
                        savedOffer.end_date

                });

            }


            // =================================================
            // نجاح التعديل الحقيقي
            // =================================================

            console.log(
                '🔥🔥 OFFER SAVED SUCCESSFULLY:',
                savedOffer
            );


            console.log(
                '🔥🔥 SAVED END DATE:',
                savedOffer.end_date
            );


            return res.status(200).json({

                success: true,

                message:
                    'تم تعديل العرض وحفظه في قاعدة البيانات بنجاح',

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

