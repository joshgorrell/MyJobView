import { SecurityContractSummary } from './SecurityContractSummary';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, AlertCircle, CheckCircle, Loader2, Printer, Download, Shield } from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { securityOnboardingRequest, type PortalSecurityAgreement, type SecurityAgreementListItem } from '../../lib/securityOnboarding';
import { readableAgreementTerms, securityAgreementHtml, printSecurityAgreement, downloadSecurityAgreement } from '../../lib/securityAgreementDocument';
import OnboardingWizard from './OnboardingWizard';

interface SecurityOnboardingPortalProps { token?: string }

export default function SecurityOnboardingPortal({ token: propToken }: SecurityOnboardingPortalProps) {
  const { tenant } = useTenant();
  const params = new URLSearchParams(window.location.search);
  const token = propToken || params.get('token') || undefined;
  const contractId = params.get('contract') || undefined;
  const [agreement, setAgreement] = useState<PortalSecurityAgreement | null>(null);
  const [agreements, setAgreements] = useState<SecurityAgreementListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [printError, setPrintError] = useState('');
  const [revoking, setRevoking] = useState(false);
  const dealerName = agreement?.document.dealer?.company_name || tenant?.organizationName || 'Customer Portal';

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setSignedIn(Boolean(session));
      if (token || contractId) {
        setAgreement(await securityOnboardingRequest<PortalSecurityAgreement>('get', contractId, token));
      } else if (session) {
        setAgreements(await securityOnboardingRequest<SecurityAgreementListItem[]>('list'));
      } else {
        window.location.replace('/portal?redirect=' + encodeURIComponent('/portal/security'));
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load your agreements. Please try again.'); }
    finally { setLoading(false); }
  }, [token, contractId]);

  useEffect(() => { void load(); }, [load]);

  function documentHtml() {
    if (!agreement) return '';
    const doc = agreement.document;
    const terms = readableAgreementTerms(doc.template?.contract_terms || '').replace(/\[term\]/g, `${doc.term_months || '__'} months`);
    return securityAgreementHtml(doc, terms, { personalInfo: agreement.contact, propertyInfo: agreement.contact },
      agreement.customer_signature, agreement.signed_snapshot_available ? agreement.customer_signature_date : null);
  }

  const completed = agreement && (!!agreement.customer_completed_at || ['pending_approval', 'approved', 'active', 'cancelled'].includes(agreement.status));
  return (
    <div className="security-onboarding-controls min-h-screen bg-slate-50">
      <header className="bg-[#0f2347] text-white px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {tenant?.logoUrl ? <img src={tenant.logoUrl} alt={dealerName} className="h-9 object-contain" /> : <Shield className="w-8 h-8" />}
            <div><p className="font-semibold">Customer Portal · Security</p><p className="text-blue-200 text-sm">{dealerName}</p></div>
          </div>
          <a href={signedIn ? '/portal/security' : '/portal?redirect=%2Fportal%2Fsecurity'} className="flex items-center gap-2 text-sm text-blue-100 hover:text-white min-h-[44px]">
            <ArrowLeft className="w-4 h-4" />{signedIn ? 'All security agreements' : 'Sign in to portal'}
          </a>
          {signedIn && <a href="/portal/dashboard" className="text-sm text-blue-100 hover:text-white min-h-[44px] flex items-center">Dashboard</a>}
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
        {loading ? <div className="bg-white rounded-2xl p-10 flex justify-center items-center gap-3 text-gray-700"><Loader2 className="w-6 h-6 animate-spin" />Loading your agreements…</div> : error ? (
          <div role="alert" className="bg-white rounded-2xl p-6 border border-red-200 space-y-4">
            <AlertCircle className="text-red-600 w-8 h-8" /><h1 className="text-xl font-bold text-gray-900">Unable to open agreement</h1>
            <p className="text-gray-700">{error}</p>
            <div className="flex flex-wrap gap-4"><button onClick={() => void load()} className="text-blue-800 underline">Try again</button>
              <a href="/portal?redirect=%2Fportal%2Fsecurity" className="text-blue-800 underline">Sign in to your portal</a></div>
            <p className="text-sm text-gray-600">An expired invitation can be replaced by your provider. Your saved progress stays with the agreement.</p>
          </div>
        ) : agreement ? completed ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 space-y-5">
            <CheckCircle className="w-10 h-10 text-green-600" />
            <h1 className="text-2xl font-bold text-gray-900">{agreement.status === 'active' ? 'Security agreement' : agreement.status === 'cancelled' ? 'Cancelled agreement' : 'Agreement submitted'}</h1>
            <p className="text-gray-700">Agreement {agreement.document.contract_number} · {agreement.status.replace(/_/g, ' ')}</p>
            {agreement.status === 'pending_approval' && <p className="text-gray-700">Your agreement is awaiting review. Our team will confirm monitoring activation separately.</p>}
            {agreement.summary && <SecurityContractSummary summary={agreement.summary} />}
            {agreement.summary?.billing_mode === 'autopay' && !agreement.summary.autopay_revoked_at && <div className="text-sm text-gray-600 space-y-2">
              <p>You can revoke future automatic payments. Amounts owed and your monitoring agreement remain in effect. Contact your provider to arrange payment; a debit already submitted requires provider follow-up.</p>
              <button className="border rounded-lg px-3 py-2 text-gray-900" disabled={revoking} onClick={async () => {
                if (!window.confirm('Revoke future automatic payments? This does not cancel your monitoring agreement or amounts owed.')) return;
                setRevoking(true);
                try { await securityOnboardingRequest('revoke_autopay', agreement.id, token); await load(); }
                catch (e) { setPrintError(e instanceof Error ? e.message : 'Could not revoke authorization. Contact your provider.'); }
                finally { setRevoking(false); }
              }}>{revoking ? 'Updating…' : 'Revoke AutoPay authorization'}</button>
            </div>}
            {!agreement.signed_snapshot_available && <p className="text-amber-900 bg-amber-50 p-4 rounded-xl">An original signed document is not available here for this older agreement. The terms below are the current template; ask your provider for the executed copy.</p>}
            <div className="flex flex-wrap gap-3">
              <button onClick={() => { try { printSecurityAgreement(documentHtml()); } catch (e) { setPrintError(e instanceof Error ? e.message : 'Printing failed.'); } }} className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-300 text-gray-900"><Printer className="w-4 h-4" />Print / Save PDF</button>
              <button onClick={() => downloadSecurityAgreement(documentHtml(), agreement.document.contract_number)} className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-300 text-gray-900"><Download className="w-4 h-4" />Download {agreement.signed_snapshot_available ? 'signed agreement' : 'current terms'}</button>
            </div>
            {printError && <p role="alert" className="text-red-700">{printError}</p>}
            <details className="border border-gray-200 rounded-xl p-4"><summary className="font-semibold text-blue-900 cursor-pointer">Terms and conditions</summary>
              <div className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed mt-4">{readableAgreementTerms(agreement.document.template?.contract_terms || '').replace(/\[term\]/g, `${agreement.document.term_months || '__'} months`)}</div></details>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <OnboardingWizard key={agreement.id} contract={{ ...agreement, ...agreement.document, template: agreement.document.template }} token={token || ''} onComplete={() => void load()} />
          </div>
        ) : (
          <div className="space-y-5">
            <div><h1 className="text-2xl font-bold text-gray-900">Your security agreements</h1><p className="text-gray-600 mt-1">Finish onboarding, review your terms, or print an agreement.</p></div>
            {agreements.length === 0 && <div className="bg-white border border-gray-200 rounded-xl p-6 text-gray-700">No security agreements are available yet. Contact your provider if you were expecting an invitation.</div>}
            {agreements.map(item => <a key={item.id} href={`/portal/security?contract=${encodeURIComponent(item.id)}`} className="block bg-white border border-gray-200 rounded-xl p-5 hover:border-blue-400">
              <div className="flex items-center justify-between gap-3"><div><p className="font-semibold text-gray-900">Agreement {item.contract_number}</p>
                <p className="text-sm text-gray-600 mt-1">{formatCurrency(Number(item.monthly_price))}/month · {item.status.replace(/_/g, ' ')}</p>
                {item.summary && <p className="text-sm text-gray-600 mt-1">Balance: {item.summary.amount_due === null ? 'Awaiting reconciliation' : formatCurrency(Number(item.summary.amount_due))} · Initial term: {item.summary.months_remaining === null ? 'Awaiting activation' : `${item.summary.months_remaining} months remaining`}</p>}
                {!item.customer_completed_at && item.saved_at && <p className="text-sm text-green-800 mt-2">Saved at step {item.current_step} of 6 · {new Date(item.saved_at).toLocaleString()}</p>}
              </div><span className="flex items-center gap-2 text-blue-800 font-semibold text-sm">{item.customer_completed_at || ['active','cancelled'].includes(item.status) ? 'View agreement' : item.saved_at ? 'Resume' : 'Start'}<ArrowRight className="w-4 h-4" /></span></div>
            </a>)}
          </div>
        )}
      </main>
    </div>
  );
}
