/*
  # Revoke EXECUTE on http extension functions from anon role

  ## Summary
  The `http` extension is installed in the public schema and cannot be relocated
  via ALTER EXTENSION SET SCHEMA (unsupported). The security risk is that the
  anon (unauthenticated) role could call these HTTP functions directly via
  PostgREST, allowing unauthenticated outbound HTTP calls from the database.

  ## Changes
  - REVOKE EXECUTE on all 19 http extension functions from the anon role
  - Functions covered: bytea_to_text, http, http_delete (x2), http_get (x2),
    http_head, http_header, http_list_curlopt, http_patch, http_post (x2),
    http_put, http_reset_curlopt, http_set_curlopt, text_to_bytea, urlencode (x3)

  ## Security Impact
  Unauthenticated callers can no longer invoke these HTTP functions via PostgREST.
  Authenticated users and service_role remain unaffected (only anon is revoked).
*/

REVOKE EXECUTE ON FUNCTION public.bytea_to_text(bytea) FROM anon;
REVOKE EXECUTE ON FUNCTION public.http(public.http_request) FROM anon;
REVOKE EXECUTE ON FUNCTION public.http_delete(varchar) FROM anon;
REVOKE EXECUTE ON FUNCTION public.http_delete(varchar, varchar, varchar) FROM anon;
REVOKE EXECUTE ON FUNCTION public.http_get(varchar) FROM anon;
REVOKE EXECUTE ON FUNCTION public.http_get(varchar, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.http_head(varchar) FROM anon;
REVOKE EXECUTE ON FUNCTION public.http_header(varchar, varchar) FROM anon;
REVOKE EXECUTE ON FUNCTION public.http_list_curlopt() FROM anon;
REVOKE EXECUTE ON FUNCTION public.http_patch(varchar, varchar, varchar) FROM anon;
REVOKE EXECUTE ON FUNCTION public.http_post(varchar, varchar, varchar) FROM anon;
REVOKE EXECUTE ON FUNCTION public.http_post(varchar, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.http_put(varchar, varchar, varchar) FROM anon;
REVOKE EXECUTE ON FUNCTION public.http_reset_curlopt() FROM anon;
REVOKE EXECUTE ON FUNCTION public.http_set_curlopt(varchar, varchar) FROM anon;
REVOKE EXECUTE ON FUNCTION public.text_to_bytea(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.urlencode(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.urlencode(bytea) FROM anon;
REVOKE EXECUTE ON FUNCTION public.urlencode(varchar) FROM anon;
