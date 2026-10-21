import { ArrowDown, ShieldCheck } from 'lucide-react';
import { hasElectronicLifePromise, proposalPromiseStyles, renderProposalPromise } from '../../../supabase/functions/_shared/proposalPromise';

export function ProposalPromise({ companyName, logoUrl }: { companyName: string; logoUrl?: string | null }) {
  if (!hasElectronicLifePromise(companyName)) return null;
  return (
    <details className="el-promise-details mb-6 rounded-2xl border border-sky-200 bg-white shadow-sm group">
      <style>{proposalPromiseStyles}</style>
      <summary className="el-promise-banner flex cursor-pointer list-none items-center gap-3 rounded-2xl bg-gradient-to-r from-sky-50 to-white p-4 sm:p-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 [&::-webkit-details-marker]:hidden">
        <ShieldCheck className="h-7 w-7 flex-shrink-0 text-sky-700" aria-hidden="true" />
        <span className="min-w-0 flex-1"><span className="block text-base font-bold text-slate-900">Our Promise to You</span><span className="mt-1 block text-sm leading-relaxed text-slate-600">Let’s find your perfect fit. Flexible options. Our best price—or dinner is on us.</span></span>
        <span className="flex flex-shrink-0 items-center gap-2 text-sm font-semibold text-sky-800"><span className="hidden sm:inline">Read our promise</span><ArrowDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" /></span>
      </summary>
      <div className="el-promise-content p-2 sm:p-4" dangerouslySetInnerHTML={{ __html: renderProposalPromise(companyName, logoUrl) }} />
    </details>
  );
}
