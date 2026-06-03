import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { token } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Token is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: tokenRecord, error: tokenError } = await supabaseAdmin
      .from('portal_access_tokens')
      .select('id, contact_id, expires_at, invalidated_at, use_count')
      .eq('token', token)
      .maybeSingle();

    if (tokenError || !tokenRecord) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired link. Please request a new login link.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (tokenRecord.invalidated_at) {
      return new Response(
        JSON.stringify({ error: 'This link has been replaced by a newer one. Please use your most recent login link or request a new one.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date();
    const expiresAt = new Date(tokenRecord.expires_at);
    if (now > expiresAt) {
      return new Response(
        JSON.stringify({ error: 'This login link has expired. Please request a new one.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: contact, error: contactError } = await supabaseAdmin
      .from('contacts')
      .select('id, email, first_name, last_name, portal_user_id, organization_id')
      .eq('id', tokenRecord.contact_id)
      .maybeSingle();

    if (contactError || !contact) {
      return new Response(
        JSON.stringify({ error: 'Customer account not found.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!contact.email) {
      return new Response(
        JSON.stringify({ error: 'No email address on file for this account.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let userId = contact.portal_user_id;

    const portalMetadata = {
      contact_id: contact.id,
      first_name: contact.first_name,
      last_name: contact.last_name,
      is_portal_user: true,
      organization_id: contact.organization_id,
    };

    if (!userId) {
      const { data: authUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: contact.email.toLowerCase(),
        email_confirm: true,
        app_metadata: portalMetadata,
      });

      if (createError || !authUser?.user) {
        console.error('Error creating user:', createError);
        return new Response(
          JSON.stringify({ error: 'Failed to create user account.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      userId = authUser.user.id;

      await supabaseAdmin
        .from('contacts')
        .update({ portal_user_id: userId, portal_access_enabled: true })
        .eq('id', contact.id);
    } else {
      const { data: existingUser, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (getUserError || !existingUser?.user) {
        console.error('Stored portal_user_id not found in auth, recreating:', getUserError);

        const { data: newAuthUser, error: recreateError } = await supabaseAdmin.auth.admin.createUser({
          email: contact.email.toLowerCase(),
          email_confirm: true,
          app_metadata: portalMetadata,
        });

        if (recreateError || !newAuthUser?.user) {
          console.error('Error recreating user:', recreateError);
          return new Response(
            JSON.stringify({ error: 'Failed to restore user account.' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        userId = newAuthUser.user.id;
        await supabaseAdmin
          .from('contacts')
          .update({ portal_user_id: userId, portal_access_enabled: true })
          .eq('id', contact.id);
      } else {
        await supabaseAdmin.auth.admin.updateUserById(userId, { app_metadata: portalMetadata });
        await supabaseAdmin
          .from('contacts')
          .update({ portal_access_enabled: true })
          .eq('id', contact.id);
      }
    }

    // Generate a magic link — returns token_hash which the client uses with verifyOtp
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: contact.email.toLowerCase(),
      options: { data: portalMetadata },
    });

    if (linkError || !linkData?.properties) {
      console.error('Error generating login link:', JSON.stringify(linkError));
      return new Response(
        JSON.stringify({ error: 'Failed to create login session.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await supabaseAdmin
      .from('portal_access_tokens')
      .update({
        last_used_at: now.toISOString(),
        use_count: (tokenRecord.use_count || 0) + 1,
      })
      .eq('id', tokenRecord.id);

    // Return the token_hash so the client can call verifyOtp to get a real session
    return new Response(
      JSON.stringify({
        success: true,
        token_hash: linkData.properties.hashed_token,
        email: contact.email.toLowerCase(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error in verify-portal-token:', error);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
