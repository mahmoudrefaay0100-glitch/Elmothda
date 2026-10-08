export default async function handler(req, res) {

    // =====================================================
    // منع الكاش
    // =====================================================

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


        // =====================================================
        // التحقق من إعدادات Supabase
        // =====================================================

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


        // =====================================================
        // التحقق من المدير
        // =====================================================

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


        // =====================================================
        // Headers قاعدة البيانات
        // =====================================================

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


            // =================================================
            // المدير
            // =================================================

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
                            data?.details ||
                            data?.hint ||
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


            // =================================================
            // الزائر
            // =================================================

            const now =
                new Date();


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
                        data?.details ||
                        data?.hint ||
                        data?.error ||
                        'فشل تحميل العروض'
                });
            }


            const activeOffers =
                Array.isArray(data)
                    ? data.filter(offer => {

                        let starts = true;
                        let ends = true;


                        // -----------------------------
                        // بداية العرض
                        // -----------------------------

                        if (
                            offer.start_date
                        ) {

                            const start =
                                new Date(
                                    offer.start_date
                                );

                            starts =
                                !Number.isNaN(
                                    start.getTime()
                                ) &&
                                start <= now;
                        }


                        // -----------------------------
                        // نهاية العرض
                        // -----------------------------

                        if (
                            offer.end_date
                        ) {

                            const end =
                                new Date(
                                    offer.end_date
                                );

                            ends =
                                !Number.isNaN(
                                    end.getTime()
                                ) &&
                                end >= now;
                        }


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


            // =================================================
            // العنوان
            // =================================================

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


            // =================================================
            // تاريخ البداية
            // =================================================

            let startDate = null;


            if (
                body.start_date !== undefined &&
                body.start_date !== null &&
                String(body.start_date).trim() !== ''
            ) {

                const parsedStart =
                    new Date(
                        body.start_date
                    );


                if (
                    Number.isNaN(
                        parsedStart.getTime()
                    )
                ) {

                    return res.status(400).json({
                        success: false,
                        error:
                            'تاريخ بداية العرض غير صحيح'
                    });
                }


                startDate =
                    parsedStart.toISOString();
            }


            // =================================================
            // تاريخ النهاية
            // =================================================

            let endDate = null;


            if (
                body.end_date !== undefined &&
                body.end_date !== null &&
                String(body.end_date).trim() !== ''
            ) {

                const parsedEnd =
                    new Date(
                        body.end_date
                    );


                if (
                    Number.isNaN(
                        parsedEnd.getTime()
                    )
                ) {

                    return res.status(400).json({
                        success: false,
                        error:
                            'تاريخ نهاية العرض غير صحيح'
                    });
                }


                endDate =
                    parsedEnd.toISOString();
            }


            // =================================================
            // التأكد من ترتيب التواريخ
            // =================================================

            if (
                startDate &&
                endDate &&
                new Date(endDate) <
                new Date(startDate)
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        'تاريخ نهاية العرض يجب أن يكون بعد تاريخ البداية'
                });
            }


            // =================================================
            // السعر القديم
            // =================================================

            let oldPrice = null;


            if (
                body.old_price !== undefined &&
                body.old_price !== null &&
                String(body.old_price).trim() !== ''
            ) {

                oldPrice =
                    Number(
                        body.old_price
                    );


                if (
                    !Number.isFinite(oldPrice) ||
                    oldPrice < 0
                ) {

                    return res.status(400).json({
                        success: false,
                        error:
                            'السعر القديم غير صحيح'
                    });
                }
            }


            // =================================================
            // سعر العرض
            // =================================================

            let offerPrice = null;


            if (
                body.offer_price !== undefined &&
                body.offer_price !== null &&
                String(body.offer_price).trim() !== ''
            ) {

                offerPrice =
                    Number(
                        body.offer_price
                    );


                if (
                    !Number.isFinite(offerPrice) ||
                    offerPrice < 0
                ) {

                    return res.status(400).json({
                        success: false,
                        error:
                            'سعر العرض غير صحيح'
                    });
                }
            }


            // =================================================
            // الترتيب
            // =================================================

            let sortOrder = 0;


            if (
                body.sort_order !== undefined &&
                body.sort_order !== null &&
                String(body.sort_order).trim() !== ''
            ) {

                sortOrder =
                    Number(
                        body.sort_order
                    );


                if (
                    !Number.isFinite(sortOrder)
                ) {

                    return res.status(400).json({
                        success: false,
                        error:
                            'ترتيب العرض غير صحيح'
                    });
                }
            }


            // =================================================
            // بيانات العرض
            // =================================================

            const offerData = {

                title,

                description:
                    body.description || null,

                image_url:
                    body.image_url || null,

                old_price:
                    oldPrice,

                offer_price:
                    offerPrice,

                button_text:
                    body.button_text ||
                    'اطلب العرض',

                button_link:
                    body.button_link ||
                    null,

                start_date:
                    startDate,

                end_date:
                    endDate,

                is_active:
                    body.is_active !== false,

                show_popup:
                    body.show_popup !== false,

                show_homepage:
                    body.show_homepage !== false,

                sort_order:
                    sortOrder
            };


            // =================================================
            // إضافة العرض
            // =================================================

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

                console.error(
                    'SUPABASE CREATE OFFER ERROR:',
                    data
                );


                return res.status(
                    response.status
                ).json({

                    success: false,

                    error:
                        data?.message ||
                        data?.details ||
                        data?.hint ||
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


            // =================================================
            // الحصول على ID
            //
            // ندعم:
            // id
            // offer_id
            // idx
            // query id
            // =================================================

            let id = null;


            if (
                body.id !== undefined &&
                body.id !== null &&
                String(body.id).trim() !== ''
            ) {

                id =
                    String(
                        body.id
                    ).trim();

            } else if (
                body.offer_id !== undefined &&
                body.offer_id !== null &&
                String(body.offer_id).trim() !== ''
            ) {

                id =
                    String(
                        body.offer_id
                    ).trim();

            } else if (
                body.idx !== undefined &&
                body.idx !== null &&
                String(body.idx).trim() !== ''
            ) {

                id =
                    String(
                        body.idx
                    ).trim();

            } else if (
                req.query?.id !== undefined &&
                req.query?.id !== null &&
                String(req.query.id).trim() !== ''
            ) {

                id =
                    String(
                        req.query.id
                    ).trim();
            }


            if (!id) {

                return res.status(400).json({

                    success: false,

                    error:
                        'رقم العرض مطلوب'
                });
            }


            // =================================================
            // العنوان
            // =================================================

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


            // =================================================
            // تاريخ البداية
            // =================================================

            let startDate = null;


            if (
                body.start_date !== undefined &&
                body.start_date !== null &&
                String(body.start_date).trim() !== ''
            ) {

                const parsedStart =
                    new Date(
                        body.start_date
                    );


                if (
                    Number.isNaN(
                        parsedStart.getTime()
                    )
                ) {

                    return res.status(400).json({

                        success: false,

                        error:
                            'تاريخ بداية العرض غير صحيح'
                    });
                }


                startDate =
                    parsedStart.toISOString();
            }


            // =================================================
            // تاريخ النهاية
            // =================================================

            let endDate = null;


            if (
                body.end_date !== undefined &&
                body.end_date !== null &&
                String(body.end_date).trim() !== ''
            ) {

                const parsedEnd =
                    new Date(
                        body.end_date
                    );


                if (
                    Number.isNaN(
                        parsedEnd.getTime()
                    )
                ) {

                    return res.status(400).json({

                        success: false,

                        error:
                            'تاريخ نهاية العرض غير صحيح'
                    });
                }


                endDate =
                    parsedEnd.toISOString();
            }


            // =================================================
            // التأكد من التواريخ
            // =================================================

            if (
                startDate &&
                endDate &&
                new Date(endDate) <
                new Date(startDate)
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        'تاريخ نهاية العرض يجب أن يكون بعد تاريخ البداية'
                });
            }


            // =================================================
            // السعر القديم
            // =================================================

            let oldPrice = null;


            if (
                body.old_price !== undefined &&
                body.old_price !== null &&
                String(body.old_price).trim() !== ''
            ) {

                oldPrice =
                    Number(
                        body.old_price
                    );


                if (
                    !Number.isFinite(oldPrice) ||
                    oldPrice < 0
                ) {

                    return res.status(400).json({

                        success: false,

                        error:
                            'السعر القديم غير صحيح'
                    });
                }
            }


            // =================================================
            // سعر العرض
            // =================================================

            let offerPrice = null;


            if (
                body.offer_price !== undefined &&
                body.offer_price !== null &&
                String(body.offer_price).trim() !== ''
            ) {

                offerPrice =
                    Number(
                        body.offer_price
                    );


                if (
                    !Number.isFinite(offerPrice) ||
                    offerPrice < 0
                ) {

                    return res.status(400).json({

                        success: false,

                        error:
                            'سعر العرض غير صحيح'
                    });
                }
            }


            // =================================================
            // ترتيب العرض
            // =================================================

            let sortOrder = 0;


            if (
                body.sort_order !== undefined &&
                body.sort_order !== null &&
                String(body.sort_order).trim() !== ''
            ) {

                sortOrder =
                    Number(
                        body.sort_order
                    );


                if (
                    !Number.isFinite(sortOrder)
                ) {

                    return res.status(400).json({

                        success: false,

                        error:
                            'ترتيب العرض غير صحيح'
                    });
                }
            }


            // =================================================
            // تجهيز بيانات التحديث
            // =================================================

            const offerData = {

                title,

                description:
                    body.description !== undefined
                        ? (
                            body.description === ''
                                ? null
                                : body.description
                        )
                        : null,

                image_url:
                    body.image_url !== undefined
                        ? (
                            body.image_url === ''
                                ? null
                                : body.image_url
                        )
                        : null,

                old_price:
                    oldPrice,

                offer_price:
                    offerPrice,

                button_text:
                    String(
                        body.button_text ||
                        'اطلب العرض'
                    ).trim(),

                button_link:
                    body.button_link !== undefined
                        ? (
                            body.button_link === ''
                                ? null
                                : body.button_link
                        )
                        : null,

                start_date:
                    startDate,

                end_date:
                    endDate,

                is_active:
                    body.is_active !== false,

                show_popup:
                    body.show_popup !== false,

                show_homepage:
                    body.show_homepage !== false,

                sort_order:
                    sortOrder,

                updated_at:
                    new Date().toISOString()
            };


            // =================================================
            // البحث عن العرض أولًا
            // =================================================

            let existingOffer = null;
            let actualId = id;


            const findResponse =
                await fetch(
                    `${SUPABASE_URL}/rest/v1/offers?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
                    {
                        method: 'GET',
                        headers: dbHeaders
                    }
                );


            const findData =
                await findResponse.json();


            // =================================================
            // لو وجدنا العرض بالـ ID
            // =================================================

            if (
                findResponse.ok &&
                Array.isArray(findData) &&
                findData.length > 0
            ) {

                existingOffer =
                    findData[0];

                actualId =
                    existingOffer.id;
            }


            // =================================================
            // لو لم نجده
            // نجرب offer_id
            // =================================================

            if (!existingOffer) {

                const alternativeIds = [];


                if (
                    body.offer_id !== undefined &&
                    body.offer_id !== null
                ) {

                    alternativeIds.push(
                        String(
                            body.offer_id
                        ).trim()
                    );
                }


                if (
                    body.idx !== undefined &&
                    body.idx !== null
                ) {

                    alternativeIds.push(
                        String(
                            body.idx
                        ).trim()
                    );
                }


                for (
                    const alternativeId
                    of alternativeIds
                ) {

                    if (
                        !alternativeId ||
                        alternativeId === id
                    ) {
                        continue;
                    }


                    const alternativeResponse =
                        await fetch(
                            `${SUPABASE_URL}/rest/v1/offers?select=*&id=eq.${encodeURIComponent(alternativeId)}&limit=1`,
                            {
                                method: 'GET',
                                headers: dbHeaders
                            }
                        );


                    const alternativeData =
                        await alternativeResponse.json();


                    if (
                        alternativeResponse.ok &&
                        Array.isArray(alternativeData) &&
                        alternativeData.length > 0
                    ) {

                        existingOffer =
                            alternativeData[0];

                        actualId =
                            existingOffer.id;

                        break;
                    }
                }
            }


            // =================================================
            // لو ما زال غير موجود
            // =================================================

            if (!existingOffer) {

                console.error(
                    'OFFER NOT FOUND FOR UPDATE:',
                    {
                        received_id: id,
                        body_id: body.id,
                        body_offer_id: body.offer_id,
                        body_idx: body.idx
                    }
                );


                return res.status(404).json({

                    success: false,

                    error:
                        'لم يتم العثور على العرض المطلوب تعديله',

                    debug: {
                        received_id: id
                    }
                });
            }


            // =================================================
            // تنفيذ PATCH على الـID الحقيقي
            // =================================================

            const updateResponse =
                await fetch(
                    `${SUPABASE_URL}/rest/v1/offers?id=eq.${encodeURIComponent(actualId)}`,
                    {
                        method: 'PATCH',

                        headers: {
                            ...dbHeaders,

                            Prefer:
                                'return=representation'
                        },

                        body:
                            JSON.stringify(
                                offerData
                            )
                    }
                );


            const updateData =
                await updateResponse.json();


            // =================================================
            // خطأ Supabase
            // =================================================

            if (!updateResponse.ok) {

                console.error(
                    'SUPABASE UPDATE OFFER ERROR:',
                    updateData
                );


                return res.status(
                    updateResponse.status
                ).json({

                    success: false,

                    error:
                        updateData?.message ||
                        updateData?.details ||
                        updateData?.hint ||
                        updateData?.error ||
                        'فشل تعديل العرض'
                });
            }


            // =================================================
            // PATCH نجح ولكن لم يرجع صف
            // =================================================

            if (
                !Array.isArray(updateData) ||
                updateData.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    error:
                        'تعذر تأكيد تعديل العرض في قاعدة البيانات'
                });
            }


            // =================================================
            // العرض المعدل فعلًا
            // =================================================

            const updatedOffer =
                updateData[0];


            return res.status(200).json({

                success: true,

                message:
                    'تم تعديل العرض بنجاح',

                offer:
                    updatedOffer
            });
        }


        // =====================================================
        // DELETE
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
                String(
                    req.query?.id ||
                    req.body?.id ||
                    req.body?.offer_id ||
                    ''
                ).trim();


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

                        headers: {
                            ...dbHeaders,

                            Prefer:
                                'return=representation'
                        }
                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                console.error(
                    'SUPABASE DELETE OFFER ERROR:',
                    data
                );


                return res.status(
                    response.status
                ).json({

                    success: false,

                    error:
                        data?.message ||
                        data?.details ||
                        data?.hint ||
                        data?.error ||
                        'فشل حذف العرض'
                });
            }


            // =================================================
            // التأكد أن الحذف تم فعلًا
            // =================================================

            if (
                !Array.isArray(data) ||
                data.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    error:
                        'لم يتم العثور على العرض المطلوب حذفه'
                });
            }


            return res.status(200).json({

                success: true,

                message:
                    'تم حذف العرض بنجاح',

                offer:
                    data[0]
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
