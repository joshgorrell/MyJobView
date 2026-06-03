import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ExtractedProduct {
  manufacturer_model_number?: string;
  manufacturer_name?: string;
  category?: string;
  subcategory?: string;
  sales_description?: string;
  purchase_description?: string;
  cost?: number;
  our_price?: number;
  list_price?: number;
  product_link?: string;
  image_url?: string;
  additional_images?: string[];
  specifications?: string;
  upc_code?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      throw new Error("Unauthorized");
    }

    const { data: settings, error: settingsError } = await supabaseClient
      .from("company_settings")
      .select("openai_api_key")
      .single();

    if (settingsError || !settings?.openai_api_key) {
      throw new Error(
        "OpenAI API key not configured. Please add your OpenAI API key in Admin > Settings > Integrations."
      );
    }

    const apiKey = settings.openai_api_key;

    // Rate limiting
    const { data: recentRequests } = await supabaseClient
      .from('activity_log')
      .select('id')
      .eq('user_id', user.id)
      .eq('action', 'ai_product_extraction')
      .gte('created_at', new Date(Date.now() - 10000).toISOString())
      .limit(1);

    if (recentRequests && recentRequests.length > 0) {
      throw new Error(
        "Please wait 10 seconds between AI extraction requests to avoid rate limits."
      );
    }

    await supabaseClient
      .from('activity_log')
      .insert({
        user_id: user.id,
        action: 'ai_product_extraction',
        entity_type: 'product',
        details: { timestamp: new Date().toISOString() }
      });

    const { url }: { url: string } = await req.json();

    if (!url) {
      throw new Error("URL is required");
    }

    // Validate URL format
    let validUrl: URL;
    try {
      validUrl = new URL(url);
    } catch {
      throw new Error("Invalid URL format");
    }

    // Fetch the webpage content
    console.log(`Fetching content from: ${url}`);
    const webpageResponse = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!webpageResponse.ok) {
      throw new Error(`Failed to fetch webpage: ${webpageResponse.status} ${webpageResponse.statusText}`);
    }

    const html = await webpageResponse.text();

    // Truncate HTML if too long (to avoid token limits)
    const maxHtmlLength = 50000;
    const truncatedHtml = html.length > maxHtmlLength
      ? html.substring(0, maxHtmlLength) + "... [truncated]"
      : html;

    const prompt = `Extract product information from the following webpage HTML. Return a JSON object with the following fields (use null for any field you cannot find):

{
  "manufacturer_model_number": "The product model number or SKU",
  "manufacturer_name": "The brand or manufacturer name",
  "category": "General product category (e.g., 'Cameras', 'Access Control', 'Lighting')",
  "subcategory": "More specific subcategory (e.g., 'IP Cameras', 'Door Locks', 'LED Strips')",
  "sales_description": "A compelling customer-facing description (1-2 sentences)",
  "purchase_description": "Technical specifications and details",
  "cost": "The wholesale or cost price as a number (no currency symbols)",
  "our_price": "The retail/selling price as a number. Look for fields labeled: 'Price', 'Our Price', 'Retail', 'Retail Price', 'MSRP', 'Suggested Retail', 'Suggested Retail Price', 'List Price', or 'Sale Price'",
  "list_price": "The manufacturer's MSRP or list price as a number (no currency symbols)",
  "product_link": "${url}",
  "image_url": "The main product image URL (absolute URL)",
  "additional_images": ["array of additional image URLs"],
  "specifications": "Key technical specifications formatted as bullet points",
  "upc_code": "UPC or barcode if available"
}

IMPORTANT RULES:
- Return ONLY the JSON object, no markdown, no explanation
- Use null for any field that cannot be determined
- For prices, extract only numbers (remove $, commas, etc.)
- For image URLs, ensure they are absolute URLs (not relative paths)
- If multiple images exist, put the best/largest one in image_url
- Keep sales_description concise and benefit-focused
- Include manufacturer name even if it seems obvious from the domain

HTML CONTENT:
${truncatedHtml}`;

    let response;
    let data;
    let extractedData: ExtractedProduct;
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(2000 * Math.pow(2, attempt - 1), 8000);
        console.log(`Retrying after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: [
              {
                role: "system",
                content: "You are an expert at extracting structured product information from webpages. You analyze HTML content and return clean, structured JSON data. Always return valid JSON only, no markdown formatting."
              },
              {
                role: "user",
                content: prompt
              }
            ],
            temperature: 0.3,
            max_tokens: 2000,
            response_format: { type: "json_object" }
          }),
        }
      );

      if (response.ok) {
        data = await response.json();
        if (data?.choices?.[0]?.message?.content) {
          const content = data.choices[0].message.content;
          extractedData = JSON.parse(content);
          break;
        }
      }

      const errorData = await response.text();
      console.error(`OpenAI API error (attempt ${attempt + 1}/${maxRetries + 1}):`, errorData);

      if (response.status === 429) {
        if (attempt < maxRetries) {
          continue;
        }
        throw new Error(
          "OpenAI API rate limit exceeded. Please wait a moment and try again."
        );
      }

      let errorMessage = "Failed to extract product information";
      try {
        const errorJson = JSON.parse(errorData);
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message;
        }
      } catch {
        errorMessage = errorData.substring(0, 200);
      }

      throw new Error(`OpenAI API error (${response.status}): ${errorMessage}`);
    }

    if (!extractedData!) {
      throw new Error("Invalid response from OpenAI API");
    }

    // Download and upload the main image if available
    if (extractedData.image_url) {
      try {
        console.log(`Downloading image from: ${extractedData.image_url}`);

        // Handle relative URLs
        let imageUrl = extractedData.image_url;
        if (!imageUrl.startsWith('http')) {
          imageUrl = new URL(imageUrl, validUrl.origin).href;
        }

        const imageResponse = await fetch(imageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        if (imageResponse.ok) {
          const imageBlob = await imageResponse.blob();
          const imageBuffer = await imageBlob.arrayBuffer();

          // Get file extension from content type or URL
          const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
          const extension = contentType.split('/')[1]?.split(';')[0] || 'jpg';
          const fileName = `product-${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`;

          // Upload to Supabase Storage
          const { data: uploadData, error: uploadError } = await supabaseClient
            .storage
            .from('product-images')
            .upload(fileName, imageBuffer, {
              contentType: contentType,
              upsert: false
            });

          if (uploadError) {
            console.error('Error uploading image:', uploadError);
          } else {
            // Get public URL
            const { data: { publicUrl } } = supabaseClient
              .storage
              .from('product-images')
              .getPublicUrl(fileName);

            extractedData.image_url = publicUrl;
            console.log(`Image uploaded successfully: ${publicUrl}`);
          }
        }
      } catch (imageError) {
        console.error('Error processing image:', imageError);
        // Keep the original URL if download/upload fails
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: extractedData
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error extracting product:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to extract product information",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});