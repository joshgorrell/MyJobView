import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const authHeader = req.headers.get('Authorization')!;

    const {
      email,
      password,
      full_name,
      first_name,
      last_name,
      username,
      role,
      role_id,
      email_leads,
      can_view_prospects,
      can_create_purchase_orders,
      can_view_all_tasks,
      can_view_all_pipeline,
      can_edit_contact_assignments,
      can_edit_products,
      can_see_all_review_requests,
      can_edit_contacts,
      has_calendar_access,
      proposal_visibility_scope,
      discussion_visibility_scope,
      employment_type,
      standard_start_time,
      standard_end_time,
      travel_bonus_enabled,
      travel_bonus_rate,
      travel_bonus_method,
      office_ids
    } = await req.json();

    if (!email || !password || !full_name) {
      throw new Error("Email, password, and full name are required");
    }

    console.log("Creating user with email:", email);

    const { data: newUser, error: createError } = await supabaseClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        email,
      },
    });

    if (createError) {
      console.error("Auth user creation error:", createError);
      throw new Error(`Failed to create auth user: ${createError.message}`);
    }

    if (!newUser.user) {
      throw new Error("User creation failed - no user returned");
    }

    console.log("Auth user created with ID:", newUser.user.id);

    await new Promise(resolve => setTimeout(resolve, 1000));

    const { data: existingProfile, error: checkError } = await supabaseClient
      .from("profiles")
      .select("id, username")
      .eq("id", newUser.user.id)
      .maybeSingle();

    console.log("Profile check result:", existingProfile);

    if (checkError) {
      console.error("Profile check error:", checkError);
      await supabaseClient.auth.admin.deleteUser(newUser.user.id);
      throw new Error(`Profile check failed: ${checkError.message}`);
    }

    if (!existingProfile) {
      console.error("Profile not created by trigger for user:", newUser.user.id);
      await supabaseClient.auth.admin.deleteUser(newUser.user.id);
      throw new Error("Profile was not created by database trigger - check trigger configuration");
    }

    console.log("Profile exists, proceeding with update");

    const finalEmploymentType = employment_type || 'hourly';
    const requiresClock = finalEmploymentType === 'hourly' || finalEmploymentType === 'job_time' || finalEmploymentType === 'salary';
    const finalUsername = username || existingProfile.username;

    const updateData = {
      full_name,
      first_name: first_name || null,
      last_name: last_name || null,
      username: finalUsername,
      role: role || 'sales',
      role_id: role_id || null,
      is_active: true,
      email_leads: email_leads || false,
      can_view_prospects: can_view_prospects ?? false,
      can_create_purchase_orders: can_create_purchase_orders ?? ['admin', 'manager', 'finance'].includes(role || 'sales'),
      can_view_all_tasks: can_view_all_tasks ?? true,
      can_view_all_pipeline: can_view_all_pipeline ?? true,
      can_edit_contact_assignments: can_edit_contact_assignments ?? false,
      can_edit_products: can_edit_products ?? true,
      can_see_all_review_requests: can_see_all_review_requests ?? false,
      can_edit_contacts: can_edit_contacts ?? true,
      has_calendar_access: has_calendar_access ?? true,
      proposal_visibility_scope: proposal_visibility_scope || 'company',
      discussion_visibility_scope: discussion_visibility_scope || 'all',
      employment_type: finalEmploymentType,
      requires_daily_clock: requiresClock,
      standard_start_time: (finalEmploymentType !== 'job_time' && finalEmploymentType !== 'salary_no_clock') ? standard_start_time : null,
      standard_end_time: (finalEmploymentType !== 'job_time' && finalEmploymentType !== 'salary_no_clock') ? standard_end_time : null,
      travel_bonus_enabled: travel_bonus_enabled || false,
      travel_bonus_rate: travel_bonus_enabled ? travel_bonus_rate : null,
      travel_bonus_method: travel_bonus_enabled ? travel_bonus_method : null,
    };

    console.log("Updating profile with:", updateData);

    const { error: updateError } = await supabaseClient
      .from("profiles")
      .update(updateData)
      .eq("id", newUser.user.id);

    if (updateError) {
      console.error("Profile update error:", updateError);
      await supabaseClient.auth.admin.deleteUser(newUser.user.id);
      
      const errorParts = [];
      if (updateError.message) errorParts.push(updateError.message);
      if (updateError.code) errorParts.push(`[Code: ${updateError.code}]`);
      if (updateError.details) errorParts.push(`[Details: ${updateError.details}]`);
      if (updateError.hint) errorParts.push(`[Hint: ${updateError.hint}]`);
      
      const detailedError = errorParts.length > 0 ? errorParts.join(' ') : 'Unknown database error';
      throw new Error(`Profile update failed: ${detailedError}`);
    }

    console.log("Profile updated successfully");

    if (office_ids && office_ids.length > 0) {
      const officeInserts = office_ids.map((office_id: string) => ({
        user_id: newUser.user.id,
        office_id,
      }));

      const { error: officeError } = await supabaseClient
        .from("user_offices")
        .insert(officeInserts);

      if (officeError) {
        console.error("Office assignment error:", officeError);
      }
    }

    try {
      const { error: starredError } = await supabaseClient.rpc('populate_default_starred_modules', {
        p_user_id: newUser.user.id,
        p_role: role || 'sales'
      });

      if (starredError) {
        console.error("Starred modules error:", starredError);
      }
    } catch (starredErr) {
      console.error("Starred modules exception:", starredErr);
    }

    try {
      await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-welcome-email`,
        {
          method: "POST",
          headers: {
            "Authorization": authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: newUser.user.email,
            full_name,
          }),
        }
      );
    } catch (emailError) {
      console.error("Welcome email exception:", emailError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "User created successfully",
        user: {
          id: newUser.user.id,
          email: newUser.user.email,
        }
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("=== CREATE USER ERROR ===");
    console.error("Error:", error);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    
    return new Response(
      JSON.stringify({ 
        error: error.message || "Failed to create user",
        details: error.stack
      }),
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