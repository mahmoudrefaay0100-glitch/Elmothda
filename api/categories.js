export default async function handler(req, res) {
    try {
        const {
            SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY
        } = process.env;

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            return res.status(500).json({
                success: false,
                error: "Supabase environment variables are missing"
            });
        }

        const headers = {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json"
        };

        if (req.method === "PUT") {
            const { id } = req.query;
            const { image_url } = req.body || {};

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: "Category ID is required"
                });
            }

            if (!image_url) {
                return res.status(400).json({
                    success: false,
                    error: "Image URL is required"
                });
            }

            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/categories?id=eq.${encodeURIComponent(id)}`,
                {
                    method: "PATCH",
                    headers: {
                        ...headers,
                        Prefer: "return=representation"
                    },
                    body: JSON.stringify({
                        image_url,
                        updated_at: new Date().toISOString()
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data?.message ||
                    data?.error ||
                    "Failed to update category"
                );
            }

            return res.status(200).json({
                success: true,
                category: data?.[0] || null
            });
        }

        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });

    } catch (error) {
        console.error("CATEGORY API ERROR:", error);

        return res.status(500).json({
            success: false,
            error: error?.message || "Server error"
        });
    }
}
