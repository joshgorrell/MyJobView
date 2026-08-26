import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, ChevronDown, ChevronUp, Download, FileText, Globe2, Loader2, Mail, Send, Square, CheckSquare, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface DeliverProposalModalProps {
  proposalId: string;
  templateId?: string | null;
  onClose: () => void;
  onDelivered: () => void | Promise<void>;
}

interface ProposalInfo {
  id: string;
  proposal_number: string;
  title: string | null;
  status: string;
  is_portal_visible: boolean | null;
  is_locked: boolean | null;
  sent_at: string | null;
  report_template_id: string | null;
  portal_customer_message?: string | null;
  contacts: { full_name: string | null; email: string | null } | null;
}

interface DocumentAvailability {
  termsAvailable: boolean;
  termsBase64: string | null;
  paymentScheduleAvailable: boolean;
  paymentScheduleBase64: string | null;
  financingAvailable: boolean;
  financingFiles: Array<{ id: string; name: string; storagePath: string }>;
}

function Choice({ checked, onClick, icon, title, description, disabled = false }: { checked: boolean; onClick: () => void; icon: React.ReactNode; title: string; description: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors sm:p-4 ${checked ? 'border-blue-500 bg-blue-500/10' : 'border-gray-600 bg-gray-700/40 hover:border-gray-500'} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${checked ? 'bg-blue-500/20 text-blue-300' : 'bg-gray-700 text-gray-400'}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-white">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-gray-400">{description}</span>
      </span>
      {checked ? <CheckSquare className="mt-1 h-5 w-5 flex-shrink-0 text-blue-400" /> : <Square className="mt-1 h-5 w-5 flex-shrink-0 text-gray-500" />}
    </button>
  );
}

function AttachmentChoice({ checked, disabled, label, onClick }: { checked: boolean; disabled?: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-gray-200 hover:bg-gray-700/70 disabled:cursor-not-allowed disabled:opacity-40">
      {checked ? <CheckSquare className="h-4 w-4 flex-shrink-0 text-blue-400" /> : <Square className="h-4 w-4 flex-shrink-0 text-gray-500" />}
      <span>{label}</span>
    </button>
  );
}

export function DeliverProposalModal({ proposalId, templateId, onClose, onDelivered }: DeliverProposalModalProps) {
  const { profile } = useAuth();
  const [proposal, setProposal] = useState<ProposalInfo | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState(false);
  const [portal, setPortal] = useState(false);
  const [pdf, setPdf] = useState(false);
  const [sameMessage, setSameMessage] = useState(true);
  const [emailMessage, setEmailMessage] = useState('');
  const [portalMessage, setPortalMessage] = useState('');
  const [toEmail, setToEmail] = useState('');
  const [ccEmails, setCcEmails] = useState('');
  const [subject, setSubject] = useState('');
  const [approvalWindowDays, setApprovalWindowDays] = useState(30);
  const [showEmailDetails, setShowEmailDetails] = useState(false);
  const [includeProposal, setIncludeProposal] = useState(true);
  const [includeTerms, setIncludeTerms] = useState(false);
  const [includePaymentSchedule, setIncludePaymentSchedule] = useState(false);
  const [includeFinancing, setIncludeFinancing] = useState(false);
  const [docs, setDocs] = useState<DocumentAvailability | null>(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const [{ data: p, error: pError }, { data: settings }] = await Promise.all([
          supabase
            .from('proposals')
            .select('id,proposal_number,title,status,is_portal_visible,is_locked,sent_at,report_template_id,portal_customer_message,contacts:contacts!proposals_contact_id_fkey(full_name,email)')
            .eq('id', proposalId)
            .maybeSingle(),
          supabase.from('company_settings').select('company_name').maybeSingle(),
        ]);
        if (pError) throw pError;
        if (!p || !alive) return;
        const info = p as unknown as ProposalInfo;
        setProposal(info);
        const name = info.contacts?.full_name?.trim() || 'there';
        const firstName = name.split(/\s+/)[0] || name;
        const defaultMessage = info.portal_customer_message?.trim() || `Hi ${firstName} — check out the proposal and let us know what you think!`;
        setPortalMessage(defaultMessage);
        setEmailMessage(defaultMessage);
        setToEmail(info.contacts?.email || '');
        const co = settings?.company_name || 'Your Company';
        setCompanyName(co);
        setSubject(`Proposal #${info.proposal_number} from ${co}`);
        setPortal(!!info.is_portal_visible);
      } catch (e: any) {
        setError(e?.message || 'Unable to load proposal delivery options.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [proposalId]);

  useEffect(() => {
    if (!email || docs || docsLoading) return;
    setDocsLoading(true);
    supabase.functions.invoke('generate-proposal-documents', { body: { proposalId } })
      .then(({ data, error: docsError }) => {
        if (docsError) throw docsError;
        setDocs(data as DocumentAvailability);
      })
      .catch(() => setDocs({ termsAvailable: false, termsBase64: null, paymentScheduleAvailable: false, paymentScheduleBase64: null, financingAvailable: false, financingFiles: [] }))
      .finally(() => setDocsLoading(false));
  }, [email, docs, docsLoading, proposalId]);

  const anySelected = email || portal || pdf;
  const activeMessage = sameMessage ? portalMessage : emailMessage;
  const deliveryLabel = useMemo(() => {
    const chosen = [portal && 'Portal', email && 'Email', pdf && 'PDF'].filter(Boolean);
    return chosen.length ? `Deliver via ${chosen.join(' + ')}` : 'Choose Delivery Method';
  }, [portal, email, pdf]);

  function setSharedMessage(value: string) {
    setPortalMessage(value);
    if (sameMessage) setEmailMessage(value);
  }

  async function makeEmailAttachments() {
    if (!proposal) return [] as Array<{ filename: string; content: string }>;
    const attachments: Array<{ filename: string; content: string }> = [];
    if (includeProposal) {
      const { data, error: pdfError } = await supabase.functions.invoke('generate-proposal-pdf', { body: { proposalId } });
      if (pdfError) throw pdfError;
      if (data?.base64) attachments.push({ filename: `Proposal-${proposal.proposal_number}.pdf`, content: data.base64 });
    }
    if (includeTerms && docs?.termsBase64) attachments.push({ filename: `Terms-Conditions-${proposal.proposal_number}.html`, content: docs.termsBase64 });
    if (includePaymentSchedule && docs?.paymentScheduleBase64) attachments.push({ filename: `Payment-Schedule-${proposal.proposal_number}.html`, content: docs.paymentScheduleBase64 });
    if (includeFinancing && docs?.financingFiles?.length) {
      for (const file of docs.financingFiles) {
        const { data: fileData, error: dlError } = await supabase.storage.from('attachments').download(file.storagePath);
        if (dlError || !fileData) continue;
        const uint8 = new Uint8Array(await fileData.arrayBuffer());
        let binary = '';
        for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
        attachments.push({ filename: file.name, content: btoa(binary) });
      }
    }
    return attachments;
  }

  async function openPdf() {
    if (!proposal) return;
    const { data, error: pdfError } = await supabase.functions.invoke('generate-proposal-pdf', { body: { proposalId } });
    if (pdfError) throw pdfError;
    if (!data?.base64) throw new Error('PDF generation did not return a file.');
    const bytes = Uint8Array.from(atob(data.base64), c => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Proposal-${proposal.proposal_number}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async function deliver() {
    if (!proposal || working || !anySelected) return;
    if (email && !toEmail.trim()) {
      setError('Enter an email address before sending.');
      return;
    }
    setWorking(true);
    setError('');
    setResult([]);
    const completed: string[] = [];
    try {
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + approvalWindowDays);

      if (portal) {
        const { error: portalError } = await supabase
          .from('proposals')
          .update({
            status: 'sent',
            sent_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
            is_portal_visible: true,
            is_locked: true,
            locked_at: now.toISOString(),
            locked_by: profile?.id || null,
            report_template_id: templateId || proposal.report_template_id,
            portal_customer_message: portalMessage.trim() || null,
          })
          .eq('id', proposalId);
        if (portalError) throw portalError;
        completed.push('Published to Customer Portal');
      }

      if (email) {
        const attachments = await makeEmailAttachments();
        const sentAttachments: Record<string, boolean> = {
          proposal: includeProposal,
          terms: includeTerms && !!docs?.termsBase64,
          paymentSchedule: includePaymentSchedule && !!docs?.paymentScheduleBase64,
          financing: includeFinancing && !!docs?.financingFiles?.length,
        };
        const { error: emailError } = await supabase.functions.invoke('send-proposal-email', {
          body: {
            proposalId,
            toEmail: toEmail.trim(),
            ccEmails: ccEmails.split(',').map(v => v.trim()).filter(Boolean),
            subject: subject.trim() || `Proposal #${proposal.proposal_number} from ${companyName || 'Your Company'}`,
            message: sameMessage ? portalMessage : activeMessage,
            attachments,
            sentAttachments,
          },
        });
        if (emailError) throw emailError;
        completed.push(`Emailed to ${toEmail.trim()}`);
      }

      if (pdf) {
        await openPdf();
        completed.push('PDF generated');
      }

      // Any external delivery locks the working proposal. Portal visibility is only changed when Portal was selected.
      const lockUpdates: Record<string, any> = {
        is_locked: true,
        locked_at: now.toISOString(),
        locked_by: profile?.id || null,
      };
      if (!proposal.sent_at && !portal) {
        lockUpdates.sent_at = now.toISOString();
        lockUpdates.status = 'sent';
      }
      if (templateId) lockUpdates.report_template_id = templateId;
      const { error: lockError } = await supabase.from('proposals').update(lockUpdates).eq('id', proposalId);
      if (lockError) throw lockError;

      setResult(completed);
      await onDelivered();
    } catch (e: any) {
      console.error('Proposal delivery failed:', e);
      setError(e?.message || 'Proposal delivery failed. Completed actions are shown below; review before retrying.');
      setResult(completed);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/65 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[96dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-gray-700 bg-gray-800 shadow-2xl sm:max-w-3xl sm:rounded-xl">
        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-gray-700 px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-white sm:text-lg">Deliver Proposal</h2>
            <p className="truncate text-xs text-gray-400">#{proposal?.proposal_number || '…'} · choose one or more delivery methods</p>
          </div>
          <button type="button" onClick={onClose} disabled={working} className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-700 hover:text-white disabled:opacity-40"><X className="h-5 w-5" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6">
          {loading ? (
            <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-blue-400" /></div>
          ) : (
            <div className="space-y-5">
              {error && <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"><AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" /><span>{error}</span></div>}

              <section>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Delivery Methods</h3>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Choice checked={portal} onClick={() => setPortal(v => !v)} icon={<Globe2 className="h-5 w-5" />} title="Customer Portal" description={proposal?.is_portal_visible ? 'Currently live. Publish/refresh this version.' : 'Publish this proposal to the customer portal.'} />
                  <Choice checked={email} onClick={() => setEmail(v => !v)} icon={<Mail className="h-5 w-5" />} title="Email Customer" description="Send a personalized email with the secure proposal link." />
                  <Choice checked={pdf} onClick={() => setPdf(v => !v)} icon={<Download className="h-5 w-5" />} title="Print / PDF" description="Generate a PDF that can be saved or printed." />
                </div>
              </section>

              {(portal || email) && (
                <section className="rounded-xl border border-gray-700 bg-gray-900/40 p-3 sm:p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div><h3 className="text-sm font-semibold text-white">Personal note to customer</h3><p className="text-xs text-gray-400">This is separate from the proposal itself and can be changed each time you deliver.</p></div>
                    {portal && email && <button type="button" onClick={() => { setSameMessage(v => !v); if (!sameMessage) setEmailMessage(portalMessage); }} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-gray-600 px-3 text-xs font-medium text-gray-200 hover:bg-gray-700">{sameMessage ? <CheckSquare className="h-4 w-4 text-blue-400" /> : <Square className="h-4 w-4" />} Same message for both</button>}
                  </div>
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">{portal && email && sameMessage ? 'Email + Portal Message' : portal ? 'Portal Message' : 'Email Message'}</label>
                  <textarea value={portal ? portalMessage : emailMessage} onChange={e => portal ? setSharedMessage(e.target.value) : setEmailMessage(e.target.value)} rows={3} className="w-full resize-y rounded-lg border border-gray-600 bg-gray-700 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                  {portal && email && !sameMessage && <><label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-wide text-gray-500">Email Message</label><textarea value={emailMessage} onChange={e => setEmailMessage(e.target.value)} rows={3} className="w-full resize-y rounded-lg border border-gray-600 bg-gray-700 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" /></>}
                </section>
              )}

              {portal && (
                <section className="rounded-xl border border-gray-700 p-3 sm:p-4">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-400">Approval Window</label>
                  <select value={approvalWindowDays} onChange={e => setApprovalWindowDays(Number(e.target.value))} className="h-11 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 text-sm text-white sm:max-w-xs">
                    <option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option><option value={45}>45 days</option><option value={60}>60 days</option><option value={90}>90 days</option>
                  </select>
                  <p className="mt-2 text-xs text-gray-500">Publishing locks the proposal. To make changes later, use Take Offline & Unlock.</p>
                </section>
              )}

              {email && (
                <section className="rounded-xl border border-gray-700 p-3 sm:p-4">
                  <button type="button" onClick={() => setShowEmailDetails(v => !v)} className="flex min-h-10 w-full items-center justify-between text-left"><span><span className="block text-sm font-semibold text-white">Email details & attachments</span><span className="block text-xs text-gray-400">{toEmail || 'No recipient email'} · Proposal PDF {includeProposal ? 'attached' : 'not attached'}</span></span>{showEmailDetails ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}</button>
                  {showEmailDetails && <div className="mt-4 space-y-3 border-t border-gray-700 pt-4">
                    <div className="grid gap-3 sm:grid-cols-2"><div><label className="mb-1 block text-xs text-gray-400">To</label><input type="email" value={toEmail} onChange={e => setToEmail(e.target.value)} className="h-11 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 text-sm text-white" /></div><div><label className="mb-1 block text-xs text-gray-400">CC</label><input value={ccEmails} onChange={e => setCcEmails(e.target.value)} placeholder="Optional, comma separated" className="h-11 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 text-sm text-white" /></div></div>
                    <div><label className="mb-1 block text-xs text-gray-400">Subject</label><input value={subject} onChange={e => setSubject(e.target.value)} className="h-11 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 text-sm text-white" /></div>
                    <div><div className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-500">Attachments</div><div className="grid sm:grid-cols-2"><AttachmentChoice checked={includeProposal} label="Proposal PDF" onClick={() => setIncludeProposal(v => !v)} /><AttachmentChoice checked={includeTerms} disabled={docsLoading || !docs?.termsAvailable} label={docsLoading ? 'Terms & Conditions (checking…)' : 'Terms & Conditions'} onClick={() => setIncludeTerms(v => !v)} /><AttachmentChoice checked={includePaymentSchedule} disabled={docsLoading || !docs?.paymentScheduleAvailable} label={docsLoading ? 'Payment Schedule (checking…)' : 'Payment Schedule'} onClick={() => setIncludePaymentSchedule(v => !v)} /><AttachmentChoice checked={includeFinancing} disabled={docsLoading || !docs?.financingAvailable} label={docsLoading ? 'Financing Documents (checking…)' : 'Financing Documents'} onClick={() => setIncludeFinancing(v => !v)} /></div></div>
                  </div>}
                </section>
              )}

              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-xs leading-relaxed text-blue-200"><strong>After delivery:</strong> MyJobView locks this proposal to prevent accidental edits. If it is live on the portal, unlocking it will automatically take it offline first. Discussion history remains with the proposal.</div>

              {result.length > 0 && <div className="rounded-xl border border-green-500/25 bg-green-500/10 p-3"><div className="mb-1 text-sm font-semibold text-green-300">Completed</div>{result.map(item => <div key={item} className="flex items-center gap-2 py-0.5 text-xs text-green-200"><Check className="h-3.5 w-3.5" />{item}</div>)}</div>}
            </div>
          )}
        </div>

        <div className="flex flex-shrink-0 flex-col-reverse gap-2 border-t border-gray-700 bg-gray-800 px-3 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-6">
          <button type="button" onClick={onClose} disabled={working} className="min-h-11 rounded-lg px-4 text-sm font-medium text-gray-300 hover:bg-gray-700 disabled:opacity-40">{result.length ? 'Close' : 'Cancel'}</button>
          <button type="button" onClick={deliver} disabled={working || loading || !anySelected || result.length > 0} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"><Send className="h-4 w-4" />{working ? 'Delivering…' : deliveryLabel}</button>
        </div>
      </div>
    </div>
  );
}
