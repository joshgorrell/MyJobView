import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      throw new Error("Only admins can update user emails");
    }

    const { userId, newEmail } = await req.json();

    if (!userId || !newEmail) {
      throw new Error("userId and newEmail are required");
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      throw new Error("Invalid email format");
    }

    // Check if email is already in use
    const { data: existingUsers } = await supabaseClient.auth.admin.listUsers();
    const emailExists = existingUsers?.users?.some(
      u => u.email?.toLowerCase() === newEmail.toLowerCase() && u.id !== userId
    );

    if (emailExists) {
      throw new Error("Email is already in use by another user");
    }

    // Get current user data to preserve other metadata
    const { data: currentUser } = await supabaseClient.auth.admin.getUserById(userId);
    
    // Update user email in auth.users and metadata
    const { error: updateError } = await supabaseClient.auth.admin.updateUserById(
      userId,
      { 
        email: newEmail,
        user_metadata: {
          ...currentUser?.user?.user_metadata,
          email: newEmail
        }
      }
    );

    if (updateError) {
      throw updateError;
    }

    // Update email in profiles table
    const { error: profileError } = await supabaseClient
      .from("profiles")
      .update({ email: newEmail })
      .eq("id", userId);

    if (profileError) {
      throw profileError;
    }

    return new Response(
      JSON.stringify({ success: true, message: "Email updated successfully" }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error updating email:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to update email" }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});