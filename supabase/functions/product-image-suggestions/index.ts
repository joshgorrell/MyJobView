import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, apikey, content-type, x-client-info',
  'Content-Type': 'application/json',
};

const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);

  const auth = req.headers.get('Authorization');
  if (!auth) return reply({ error: 'Sign in required' }, 401);
  const client = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return reply({ error: 'Sign in required' }, 401);
  const { data: profile } = await client.from('profiles').select('can_edit_products').eq('id', user.id).single();
  if (!profile?.can_edit_products) return reply({ error: 'Product editing permission required' }, 403);

  let manufacturer: string;
  let model: string;
  try {
    const body = await req.json();
    manufacturer = String(body.manufacturer ?? '').trim();
    model = String(body.model ?? '').trim();
  } catch {
    return reply({ error: 'Invalid request' }, 400);
  }
  if (!manufacturer || model.length < 3 || manufacturer.length > 100 || model.length > 100) {
    return reply({ error: 'Enter a manufacturer and model number' }, 400);
  }

  // Icecat returns brand-supplied photos for an exact brand and product code.
  // Its Open catalog does not cover every manufacturer; never substitute a vaguely similar item.
  const username = Deno.env.get('ICECAT_USERNAME');
  if (!username) return reply({ images: [], status: 'not_configured' });
  const url = new URL('https://live.icecat.biz/api');
  url.searchParams.set('lang', 'EN');
  url.searchParams.set('shopname', username);
  url.searchParams.set('Brand', manufacturer);
  url.searchParams.set('ProductCode', model);
  url.searchParams.set('content', 'essentialinfo,gallery');
  const headers: Record<string, string> = {};
  if (Deno.env.get('ICECAT_API_TOKEN')) headers['api-token'] = Deno.env.get('ICECAT_API_TOKEN')!;
  if (Deno.env.get('ICECAT_CONTENT_TOKEN')) headers['content-token'] = Deno.env.get('ICECAT_CONTENT_TOKEN')!;

  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (!response.ok) return reply({ images: [], status: 'unavailable' });
    const payload = await response.json();
    const data = payload.data;
    const info = data?.GeneralInfo;
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!info || normalize(info.Brand ?? '') !== normalize(manufacturer) ||
        normalize(info.BrandPartCode ?? '') !== normalize(model)) {
      return reply({ images: [], status: 'no_match' });
    }
    const gallery = Array.isArray(data.Gallery) ? data.Gallery : [];
    const ordered = [data.Image, ...gallery.sort((a, b) => Number(a.No || 0) - Number(b.No || 0))];
    const images = [...new Set(ordered.map((item) => item?.Pic500x500 || item?.HighPic || item?.Pic)
      .filter((value): value is string => typeof value === 'string' && /^https:\/\/images\.icecat\.biz\//.test(value)))].slice(0, 12);
    return reply({ images, status: images.length ? 'ok' : 'no_match', source: 'Icecat' });
  } catch (error) {
    console.error('Product image lookup failed', error);
    return reply({ images: [], status: 'unavailable' });
  }
});
