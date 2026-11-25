export function validateWebsiteLead(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid submission');
  const body = input as Record<string, unknown>;
  function field(key: string, max: number, required = true) {
    const value = body[key];
    if (value == null && !required) return '';
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error('Invalid ' + key);
    return value.trim();
  }
  const name = field('name', 120);
  const email = field('email', 254).toLowerCase();
  const phone = field('phone', 40);
  const projectType = field('projectType', 20);
  const zip = field('zip', 12);
  const timeline = field('timeline', 100);
  const budget = field('budget', 100, false);
  const description = field('description', 4000, false);
  const requestId = field('requestId', 36);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[+()\d .-]{7,40}$/.test(phone) || phone.replace(/\D/g, '').length < 7) throw new Error('Invalid contact information');
  if (!['residential','commercial'].includes(projectType) || !/^\d{5}(-\d{4})?$/.test(zip)) throw new Error('Invalid project details');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) throw new Error('Invalid request identifier');
  if (body.consent !== true || !Array.isArray(body.interests) || body.interests.length < 1 || body.interests.length > 12 || body.interests.some(x => typeof x !== 'string' || !x.trim() || x.length > 100)) throw new Error('Invalid interests or consent');
  const interests = [...new Set((body.interests as string[]).map(x => x.trim()))];
  return { name, email, phone, projectType, zip, timeline, budget, description, requestId, interests, consent: true };
}
