// Pure rendering only. Caller must resolve tenant-scoped data and authorized feedback URL.
const keys = new Set(['customer_name','company_name','feedback_url']);
const escapeHtml = value => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderFeedbackTemplate(template, values) {
  if (!template || template.is_active !== true) throw new Error('Inactive feedback template');
  for (const key of keys) {
    if (typeof values?.[key] !== 'string' || !values[key].trim() || /[\r\n]/.test(values[key])) throw new Error('Invalid feedback value: '+key);
  }
  const url = new URL(values.feedback_url);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid feedback URL');
  const render = (source, html) => {
    if (typeof source !== 'string' || !source.trim()) throw new Error('Empty feedback template');
    // Validate original template before interpolation; inserted customer data is never reinterpreted.
    const remainder = source.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, key) => {
      if (!keys.has(key)) throw new Error('Unknown feedback placeholder: '+key);
      return '';
    });
    if (/\{\{|\}\}/.test(remainder)) throw new Error('Malformed feedback placeholder');
    const pattern = /\{\{\s*([a-z_]+)\s*\}\}/g;
    if (!html) return source.replace(pattern, (_,key)=>values[key]);
    let out='', start=0;
    for (const match of source.matchAll(pattern)) {
      out+=escapeHtml(source.slice(start,match.index));
      out+=match[1]==='feedback_url' ? '<a href="'+escapeHtml(url.href)+'">Share your feedback</a>' : escapeHtml(values[match[1]]);
      start=match.index+match[0].length;
    }
    return (out+escapeHtml(source.slice(start))).replace(/\r\n|\r|\n/g,'<br>');
  };
  if (!/\{\{\s*feedback_url\s*\}\}/.test(template.body)) throw new Error('Missing feedback link');
  const subject=render(template.subject,false);
  if (/[\r\n]/.test(subject)) throw new Error('Invalid feedback subject');
  return {subject,text:render(template.body,false),html:render(template.body,true)};
}
