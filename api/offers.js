export default async function handler(req, res) {
    try {
        const {
            SUPABASE_URL,
            SUPABASE_ANON_KEY,
            SUPABASE_SERVICE_ROLE_KEY
        } = process.env;

        // =========================
        // التأكد من إعدادات Supabase
        // =========================

        if (
            !SUPABASE_URL ||
            !SUPABASE_ANON_KEY ||
            !SUPABASE_SERVICE_ROLE_KEY
        ) {
            return res.status(500).json({
                success: false,
                error: "Supabase environment variables are missing"
            });
        }

        // =========================
        // التحقق من الأدمن
        // =========================

        async function verifyAdmin() {
            const authHeader =
                req.headers.authorization || "";

            const token =
                authHeader
                    .replace(/^Bearer\s+/i, "")
                    .trim();

            if (!token) {
                console.error(
                    "OFFER ADMIN VERIFY: No token received"
                );

                return false;
            }

            try {
                const response = await fetch(
                    `${SUPABASE_URL}/auth/v1/user`,
                    {
                        method: "GET",
                        headers: {
                            apikey: SUPABASE_ANON_KEY,
                            Authorization: `Bearer ${token}`
                        }
                    }
                );

                if (!response.ok) {
                    const errorText =
                        await response.text();

                    console.error(
                        "OFFER ADMIN VERIFY ERROR:",
                        response.status,
                        errorText
                    );

                    return false;
                }

                const user =
                    await response.json();

                if (!user?.id) {
                    return false;
                }

                console.log(
                    "OFFER ADMIN VERIFIED:",
                    user.email
                );

                return true;

            } catch (error) {
                console.error(
                    "OFFER ADMIN VERIFY EXCEPTION:",
                    error
                );

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

            "Content-Type":
                "application/json",

            Prefer:
                "return=representation"
        };

        // =========================
        // GET - جلب العروض
        // =========================

        if (req.method === "GET") {

            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/offers?select=*&order=sort_order.asc,created_at.desc`,
                {
                    method: "GET",
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
                        data?.hint ||
                        "Failed to load offers"
                });
            }

            return res.status(200).json({
                success: true,
                offers: data || []
            });
        }

        // =========================
        // POST - إضافة عرض
        // =========================

        if (req.method === "POST") {

            const isAdmin =
                await verifyAdmin();

            if (!isAdmin) {
                return res.status(401).json({
                    success: false,
                    error:
                        "غير مصرح. يجب تسجيل الدخول كأدمن."
                });
            }

            const offer =
                req.body || {};

            const payload = {

                title:
                    offer.title ||
                    "عرض جديد",

                description:
                    offer.description ||
                    "",

                image_url:
                    offer.image_url ||
                    "",

                old_price:
                    offer.old_price === null ||
                    offer.old_price === undefined ||
                    offer.old_price === ""
                        ? null
                        : Number(offer.old_price),

                offer_price:
                    offer.offer_price === null ||
                    offer.offer_price === undefined ||
                    offer.offer_price === ""
                        ? null
                        : Number(offer.offer_price),

                button_text:
                    offer.button_text ||
                    "اطلب العرض",

                button_link:
                    offer.button_link ||
                    "",

                start_date:
                    offer.start_date ||
                    null,

                end_date:
                    offer.end_date ||
                    null,

                is_active:
                    offer.is_active !== false,

                show_popup:
                    offer.show_popup !== false,

                show_homepage:
                    offer.show_homepage !== false,

                sort_order:
                    Number(
                        offer.sort_order || 0
                    ),

                updated_at:
                    new Date().toISOString()
            };

            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/offers`,
                {
                    method: "POST",
                    headers: dbHeaders,
                    body:
                        JSON.stringify(payload)
                }
            );

            const data =
                await response.json();

            if (!response.ok) {

                console.error(
                    "SAVE OFFER ERROR:",
                    data
                );

                return res.status(
                    response.status
                ).json({
                    success: false,
                    error:
                        data?.message ||
                        data?.hint ||
                        data?.details ||
                        "Failed to save offer"
                });
            }

            return res.status(200).json({
                success: true,
                offer:
                    data?.[0] ||
                    payload
            });
        }

        // =========================
        // PUT - تعديل عرض
        // =========================

        if (req.method === "PUT") {

            const isAdmin =
                await verifyAdmin();

            if (!isAdmin) {
                return res.status(401).json({
                    success: false,
                    error:
                        "غير مصرح. يجب تسجيل الدخول كأدمن."
                });
            }

            const offer =
                req.body || {};

            const offerId =
                offer.id;

            if (!offerId) {
                return res.status(400).json({
                    success: false,
                    error:
                        "Offer ID is required"
                });
            }

            const payload = {

                title:
                    offer.title ||
                    "عرض",

                description:
                    offer.description ||
                    "",

                image_url:
                    offer.image_url ||
                    "",

                old_price:
                    offer.old_price === null ||
                    offer.old_price === undefined ||
                    offer.old_price === ""
                        ? null
                        : Number(offer.old_price),

                offer_price:
                    offer.offer_price === null ||
                    offer.offer_price === undefined ||
                    offer.offer_price === ""
                        ? null
                        : Number(offer.offer_price),

                button_text:
                    offer.button_text ||
                    "اطلب العرض",

                button_link:
                    offer.button_link ||
                    "",

                start_date:
                    offer.start_date ||
                    null,

                end_date:
                    offer.end_date ||
                    null,

                is_active:
                    offer.is_active !== false,

                show_popup:
                    offer.show_popup !== false,

                show_homepage:
                    offer.show_homepage !== false,

                sort_order:
                    Number(
                        offer.sort_order || 0
                    ),

                updated_at:
                    new Date().toISOString()
            };

            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/offers?id=eq.${encodeURIComponent(offerId)}`,
                {
                    method: "PATCH",
                    headers: dbHeaders,
                    body:
                        JSON.stringify(payload)
                }
            );

            const data =
                await response.json();

            if (!response.ok) {

                console.error(
                    "UPDATE OFFER ERROR:",
                    data
                );

                return res.status(
                    response.status
                ).json({
                    success: false,
                    error:
                        data?.message ||
                        data?.hint ||
                        data?.details ||
                        "Failed to update offer"
                });
            }

            return res.status(200).json({
                success: true,
                offer:
                    data?.[0] || {
                        id: offerId,
                        ...payload
                    }
            });
        }

        // =========================
        // DELETE - حذف عرض
        // =========================

        if (req.method === "DELETE") {

            const isAdmin =
                await verifyAdmin();

            if (!isAdmin) {
                return res.status(401).json({
                    success: false,
                    error:
                        "غير مصرح. يجب تسجيل الدخول كأدمن."
                });
            }

            const id =
                req.query?.id ||
                req.body?.id;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error:
                        "Offer ID is required"
                });
            }

            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/offers?id=eq.${encodeURIComponent(id)}`,
                {
                    method: "DELETE",
                    headers: dbHeaders
                }
            );

            if (!response.ok) {

                const data =
                    await response.json();

                console.error(
                    "DELETE OFFER ERROR:",
                    data
                );

                return res.status(
                    response.status
                ).json({
                    success: false,
                    error:
                        data?.message ||
                        data?.hint ||
                        "Failed to delete offer"
                });
            }

            return res.status(200).json({
                success: true,
                deleted: id
            });
        }

        // =========================
        // Method غير مسموح
        // =========================

        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });

    } catch (error) {

        console.error(
            "OFFERS API ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                error?.message ||
                "Server error"
        });
    }
}
