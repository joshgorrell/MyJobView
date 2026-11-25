const mounted = new Set();
const labels = { 'sales-lead': 'Request a consultation', chat: 'Chat with us', service: 'Request service', feedback: 'Send feedback', portal: 'Customer portal' };
export async function mountWidget({ kind, id, endpoint, script }) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const key = kind + ':' + id;
  if (mounted.has(key)) return;
  mounted.add(key);
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid endpoint');
    url.searchParams.set('id', id);
    url.searchParams.set('kind', kind);
    const response = await fetch(url, { credentials: 'omit', cache: 'no-store', redirect: 'error' });
    if (!response.ok) throw new Error('Unavailable');
    const config = await response.json();
    if (config.kind !== kind) throw new Error('Invalid configuration');
    // Foundation deliberately renders nothing until a functional handler is registered.
    // Never show a nonfunctional customer-facing button.
    if (!labels[kind]) return;
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    const region = document.createElement('section');
    region.setAttribute('aria-label', labels[kind]);
    region.hidden = true;
    root.append(region);
    script.after(host);
  } catch {
    mounted.delete(key);
  }
}
