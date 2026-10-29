// Validates public build configuration without logging credentials.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
let parsed;
try { parsed = new URL(url); } catch { throw new Error('EAS production Supabase URL is missing or invalid'); }
if (parsed.origin !== 'https://bqtsuzvuvqvgidipbsis.supabase.co' ||
    parsed.pathname !== '/' || parsed.search || parsed.hash ||
    parsed.username || parsed.password) {
  throw new Error('EAS production Supabase URL does not match the MJV project root');
}
if (!key.trim()) throw new Error('EAS production Supabase public key is missing');
console.log('EAS production Supabase URL and public key presence verified');
