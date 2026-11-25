export function validateWebsiteService(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid submission');
  const body = input as Record<string, unknown>;
  function field(key: string, max: number) {
    const value = body[key];
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Invalid '+key);
    return value.trim();
  }
  const name=field('name',120), email=field('email',254).toLowerCase(), phone=field('phone',40);
  const address=field('address',250), city=field('city',100), state=field('state',50), zip=field('zip',12);
  const description=field('description',4000), requestId=field('requestId',36);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[+()\d .-]{7,40}$/.test(phone) || phone.replace(/\D/g,'').length<7) throw new Error('Invalid contact details');
  if(!/^\d{5}(-\d{4})?$/.test(zip) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId) || body.consent!==true) throw new Error('Invalid request');
  return {name,email,phone,address,city,state,zip,description,requestId,consent:true};
}
