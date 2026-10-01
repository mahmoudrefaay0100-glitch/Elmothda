export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const {
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY
    } = process.env;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({
        error: "Supabase environment variables are missing"
      });
    }

    const headers = {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json"
    };

    async function getTable(table, options = "") {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/${table}?${options}`,
        {
          method: "GET",
          headers
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.message ||
          data?.error ||
          `Failed to load ${table}`
        );
      }

      return data;
    }

    const [
      products,
      categories,
      siteSettings,
      shippingOptions,
      upholsteryTypes,
      cushionColors,
      wickerColors,
      woodColors
    ] = await Promise.all([

      getTable(
        "products",
        "select=*&visible=eq.true&order=created_at.desc"
      ),

      getTable(
        "categories",
        "select=*&visible=eq.true&order=sort_order.asc"
      ),

      getTable(
        "site_settings",
        "select=*&id=eq.1&limit=1"
      ),

      getTable(
        "shipping_options",
        "select=*&enabled=eq.true"
      ),

      getTable(
        "upholstery_types",
        "select=*&enabled=eq.true"
      ),

      getTable(
        "cushion_colors",
        "select=*&enabled=eq.true"
      ),

      getTable(
        "wicker_colors",
        "select=*&enabled=eq.true"
      ),

      getTable(
        "wood_colors",
        "select=*&enabled=eq.true"
      )
    ]);

    return res.status(200).json({
      success: true,

      products: products || [],

      categories: categories || [],

      siteSettings:
        siteSettings?.[0] || {},

      shippingOptions:
        shippingOptions || [],

      upholsteryTypes:
        upholsteryTypes || [],

      cushionColors:
        cushionColors || [],

      wickerColors:
        wickerColors || [],

      woodColors:
        woodColors || []
    });

  } catch (error) {

    console.error("STORE API ERROR:", error);

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "Failed to load store data"
    });
  }
}
