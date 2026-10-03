import { ChevronRight, Globe, Linkedin, Mail, Phone, User } from 'lucide-react';

export interface CardBranding {
  company_name: string;
  company_logo_url?: string | null;
  business_card_banner_url?: string | null;
  website: string | null;
  organization_id?: string;
}

function cardWebsiteUrl(value: string): string | undefined {
  const normalized = value.trim().replace(/^https?:\s*(?!\/\/)(?:\/+)?/i, 'https://');
  try {
    const url = new URL(/^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
  } catch { return undefined; }
}

export function BusinessCardIdentity({ fullName, title, email, phone, linkedinUrl, photoUrl, company }: {
  fullName: string; title: string; email: string; phone: string;
  linkedinUrl?: string | null; photoUrl?: string | null; company?: CardBranding | null;
}) {
  const electronicLife = company?.company_name.trim().toLowerCase() === 'electronic life';
  const banner = company?.business_card_banner_url ?? (electronicLife ? '/images/electronic-life-card-banner.webp' : null);
  const logo = company?.company_logo_url || (electronicLife ? '/el_logo_color_(2).png' : null);
  const names = fullName.trim().split(/\s+/);
  const actions = [
    { label: 'Email', value: email, href: `mailto:${email}`, icon: Mail, color: 'from-cyan-400 to-blue-600' },
    { label: 'Phone', value: phone, href: `tel:${phone}`, icon: Phone, color: 'from-purple-500 to-pink-600' },
    ...(linkedinUrl ? [{ label: 'LinkedIn', value: 'View Profile', href: cardWebsiteUrl(linkedinUrl), icon: Linkedin, color: 'from-blue-500 to-blue-700' }] : []),
    ...(company?.website ? [{ label: 'Website', value: company.website.replace(/^https?:\/*/i, '').replace(/\/$/, ''), href: cardWebsiteUrl(company.website), icon: Globe, color: 'from-emerald-400 to-emerald-600' }] : []),
  ];

  return <>
    {logo && <div className="bg-white px-6 py-6 sm:py-8 text-center">
      <img src={logo} alt={company?.company_name || 'Company logo'} className="mx-auto h-14 sm:h-20 w-auto max-w-full object-contain" />
      {electronicLife && <p className="mt-3 text-[10px] sm:text-xs font-semibold tracking-[0.25em] text-gray-400">INNOVATE. INTEGRATE. INSPIRE.</p>}
    </div>}
    <div className="relative h-32 sm:h-44 bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600">
      {banner && <img src={banner} alt="" className="h-full w-full object-cover object-center" />}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0c1325]/60 to-transparent" />
      <div className="absolute -bottom-10 sm:-bottom-12 left-6 sm:left-8 rounded-full bg-gradient-to-br from-cyan-400 via-blue-500 to-purple-600 p-[3px] shadow-[0_8px_30px_rgba(75,80,255,0.4)]">
        {photoUrl ? <img src={photoUrl} alt={fullName} className="h-28 w-28 sm:h-36 sm:w-36 rounded-full border-4 border-[#0c1325] object-cover" /> : <div className="h-28 w-28 sm:h-36 sm:w-36 rounded-full border-4 border-[#0c1325] bg-slate-800 flex items-center justify-center"><User className="h-12 w-12 text-cyan-300" /></div>}
      </div>
    </div>
    <div className="px-6 sm:px-8 pt-14 sm:pt-16 pb-6">
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight break-words text-white">{names[0]}{names.length > 1 && <> <span className="text-cyan-400">{names.slice(1).join(' ')}</span></>}</h1>
      {title && <p className="mt-2 text-sm sm:text-base uppercase tracking-[0.22em] text-slate-300">{title}</p>}
      {company?.company_name && <p className="mt-1 text-base sm:text-lg text-slate-400">{company.company_name}</p>}
      <div className="mt-6 space-y-3">
        {actions.filter(action => action.value && action.href).map(({ label, value, href, icon: Icon, color }) => <a key={label} href={href} {...(['LinkedIn', 'Website'].includes(label) ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="group flex min-h-[72px] items-center gap-3 sm:gap-4 rounded-2xl border border-slate-600/60 bg-gradient-to-br from-slate-800/75 to-slate-800/35 p-3 sm:p-4 shadow-inner transition hover:border-cyan-400/60 hover:bg-slate-800/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">
          <span className={`flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${color}`}><Icon className="h-6 w-6 text-white" /></span>
          <span className="min-w-0 flex-1"><span className="block text-[10px] sm:text-xs uppercase tracking-widest text-slate-400">{label}</span><span className="mt-1 block break-words text-sm sm:text-base text-white">{value}</span></span>
          <ChevronRight className="h-5 w-5 shrink-0 text-slate-400 group-hover:text-cyan-300" />
        </a>)}
      </div>
    </div>
  </>;
}

export function BusinessCardFooter({ company }: { company?: CardBranding | null }) {
  const electronicLife = company?.company_name.trim().toLowerCase() === 'electronic life';
  const logo = electronicLife ? '/el_logo_color_(2).png' : company?.company_logo_url;
  return <div className="flex items-center gap-4 px-6 sm:px-8 pb-7" aria-hidden="true"><div className="h-px flex-1 bg-gradient-to-r from-cyan-400 to-blue-500" />{logo && (electronicLife ? <span className="block h-10 w-7 overflow-hidden"><img src={logo} alt="" className="h-10 w-auto max-w-none" /></span> : <img src={logo} alt="" className="h-7 max-w-[110px] object-contain" />)}<div className="h-px flex-1 bg-gradient-to-r from-blue-500 to-fuchsia-500" /></div>;
}
