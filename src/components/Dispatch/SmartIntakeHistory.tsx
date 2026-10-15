import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Inbox, Mail, MessageSquare, RefreshCw, Search, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { listIntakeHistory } from '../../lib/smart-intake/history-query';
import { loadIntakeTimeline } from '../../lib/smart-intake/history-timeline';
import { loadIntakeCustomerContext, type IntakeCustomerContext } from '../../lib/smart-intake/customer-context';
import { listIntakeAttachmentReviews, type IntakeAttachmentReview } from '../../lib/smart-intake/attachment-review-query';

type Row = Awaited<ReturnType<typeof listIntakeHistory>>[number];
type Timeline = Awaited<ReturnType<typeof loadIntakeTimeline>>;

const ATTENTION_STATUSES = ['received','analyzing','awaiting_customer','awaiting_employee','needs_review','failed_retryable'];

export function SmartIntakeHistory() {
  const { tenant } = useTenant();
  const { profile, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [channel, setChannel] = useState<'all'|'email'|'sms'|'mms'>('all');
  const [view, setView] = useState<'unmatched'|'all'>('unmatched');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Timeline | null>(null);
  const [detailError, setDetailError] = useState('');
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [attachments, setAttachments] = useState<IntakeAttachmentReview[]>([]);
  const [attachmentError, setAttachmentError] = useState('');
  const [customer, setCustomer] = useState<IntakeCustomerContext | null>(null);
  const [customerError, setCustomerError] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerMatches, setCustomerMatches] = useState<IntakeCustomerContext[]>([]);
  const [customerSearchBusy, setCustomerSearchBusy] = useState(false);
  const [customerSearchError, setCustomerSearchError] = useState('');
  const [confirmingCustomer, setConfirmingCustomer] = useState(false);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [serviceAddress, setServiceAddress] = useState('');
  const [serviceCity, setServiceCity] = useState('');
  const [serviceState, setServiceState] = useState('');
  const [serviceZip, setServiceZip] = useState('');
  const [serviceBillingBy, setServiceBillingBy] = useState<'dispatch'|'admin'>('dispatch');
  const [savingService, setSavingService] = useState(false);
  const [serviceMessage, setServiceMessage] = useState('');
  const inspectionVersion = useRef(0);
  const orgId = tenant?.organizationId && profile?.organization_id === tenant.organizationId ? tenant.organizationId : profile?.organization_id && !tenant ? profile.organization_id : null;

  const reload = useCallback(async () => {
    if (!orgId || authLoading || !profile) return;
    setBusy(true);
    setError('');
    try {
      const result = await listIntakeHistory(supabase, { organizationId: orgId, search, channel: channel === 'all' ? undefined : channel, status: view === 'all' && status !== 'all' ? status : undefined, unmatchedOnly: view === 'unmatched', from: dateFrom || undefined, to: dateTo || undefined, limit: 100 });
      setRows(result);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : 'Unable to load intake history');
    } finally { setBusy(false); }
  }, [orgId, authLoading, profile, search, channel, status, dateFrom, dateTo, view]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (!orgId || !selected || selected.item.contact_id || customerSearch.trim().length < 2) {
      setCustomerMatches([]);
      setCustomerSearchBusy(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setCustomerSearchBusy(true);
      setCustomerSearchError('');
      const term = customerSearch.trim().replace(/[%_,()\\]/g, '');
      if (term.length < 2) { setCustomerMatches([]); setCustomerSearchBusy(false); return; }
      const result = await supabase.from('contacts')
        .select('id,company_name,contact_name,email')
        .eq('organization_id', orgId)
        .or('company_name.ilike.%' + term + '%,contact_name.ilike.%' + term + '%,email.ilike.%' + term + '%')
        .limit(20);
      if (cancelled) return;
      setCustomerSearchBusy(false);
      if (result.error) {
        setCustomerMatches([]);
        setCustomerSearchError('Unable to search customers.');
      } else {
        setCustomerMatches((result.data ?? []).map(contact => ({
          id: contact.id,
          name: contact.company_name || contact.contact_name || contact.email || 'Customer',
          email: contact.email ?? null,
        })));
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [orgId, selected, customerSearch]);

  async function confirmCustomer(contact: IntakeCustomerContext) {
    if (!selected || !orgId || selected.item.contact_id || confirmingCustomer) return;
    setConfirmingCustomer(true);
    setCustomerSearchError('');
    try {
      const { error: confirmationError } = await supabase.rpc('smart_intake_confirm_customer', {
        target_intake: selected.item.id,
        target_contact: contact.id,
      });
      if (confirmationError) throw confirmationError;
      await inspect(selected.item.id);
      await reload();
    } catch {
      setCustomerSearchError('Unable to confirm customer. Refresh and verify this message is still unmatched.');
    } finally {
      setConfirmingCustomer(false);
    }
  }

  async function createCustomerAndConfirm() {
    if (!selected || !orgId || selected.item.contact_id || confirmingCustomer || !newCustomerName.trim()) return;
    setConfirmingCustomer(true);
    setCustomerSearchError('');
    try {
      const { error: createError } = await supabase.rpc('smart_intake_create_customer_and_confirm', {
        target_intake: selected.item.id,
        customer_name: newCustomerName.trim(),
        customer_email: newCustomerEmail.trim() || null,
        customer_phone: newCustomerPhone.trim() || null,
      });
      if (createError) throw createError;
      await inspect(selected.item.id);
      await reload();
    } catch (e) {
      setCustomerSearchError(e instanceof Error ? e.message : 'Unable to create customer.');
    } finally {
      setConfirmingCustomer(false);
    }
  }

  async function verifyServiceDetails() {
    if (!selected || !selected.item.contact_id || selected.item.classification !== 'service' || !serviceAddress.trim() || savingService) return;
    setSavingService(true);
    setServiceMessage('');
    try {
      const { error: saveError } = await supabase.rpc('smart_intake_verify_service_details', {
        target_intake: selected.item.id,
        location_address: serviceAddress.trim(),
        location_city: serviceCity.trim(),
        location_state: serviceState.trim(),
        location_zip: serviceZip.trim(),
        billing_type: 'billable',
        billing_by: serviceBillingBy,
      });
      if (saveError) throw saveError;
      await inspect(selected.item.id);
      setServiceMessage('Service details verified. Routing remains pending.');
    } catch (e) {
      setServiceMessage(e instanceof Error ? e.message : 'Unable to verify service details.');
    } finally {
      setSavingService(false);
    }
  }

  async function inspect(id: string) {
    if (!orgId) return;
    const version = ++inspectionVersion.current;
    setSelected(null);
    setAttachments([]);
    setCustomer(null);
    setCustomerSearch('');
    setServiceMessage('');
    setServiceAddress('');
    setServiceCity('');
    setServiceState('');
    setServiceZip('');
    setServiceBillingBy('dispatch');
    setNewCustomerOpen(false);
    setNewCustomerName('');
    setNewCustomerEmail('');
    setNewCustomerPhone('');
    setCustomerMatches([]);
    setCustomerError('');
    setAttachmentError('');
    setDetailError('');
    setLoadingDetail(true);
    try {
      const timeline = await loadIntakeTimeline(supabase, orgId, id);
      if (version !== inspectionVersion.current) return;
      setSelected(timeline);
      if (timeline.item.classification === 'service' && timeline.item.contact_id) {
        const { data: verified, error: detailsError } = await supabase.from('intake_service_details')
          .select('job_location_address,job_location_city,job_location_state,job_location_zip,billable_by')
          .eq('intake_id', id).eq('organization_id', orgId).maybeSingle();
        if (version !== inspectionVersion.current) return;
        if (detailsError) setServiceMessage('Unable to load previously verified service details.');
        else if (verified) {
          setServiceAddress(verified.job_location_address ?? '');
          setServiceCity(verified.job_location_city ?? '');
          setServiceState(verified.job_location_state ?? '');
          setServiceZip(verified.job_location_zip ?? '');
          setServiceBillingBy(verified.billable_by === 'admin' ? 'admin' : 'dispatch');
        }
      }
      try {
        const context = await loadIntakeCustomerContext(supabase, orgId, timeline.item.contact_id);
        if (version === inspectionVersion.current) setCustomer(context);
      } catch {
        if (version === inspectionVersion.current) setCustomerError('Customer details are unavailable. Confirm the customer before filing media.');
      }
      try {
        const files = await listIntakeAttachmentReviews(supabase, orgId, id);
        if (version === inspectionVersion.current) setAttachments(files);
      } catch {
        if (version === inspectionVersion.current) setAttachmentError('Attachment information is not available yet.');
      }
    }
    catch (e) { if (version === inspectionVersion.current) setDetailError(e instanceof Error ? e.message : 'Unable to load message history'); }
    finally { if (version === inspectionVersion.current) setLoadingDetail(false); }
  }

  const visible = rows;
  const unresolvedCustomers = view === 'unmatched' ? rows.length : rows.filter(row => !row.contact_id && ATTENTION_STATUSES.includes(row.status)).length;
  return (
    <section className="min-w-0 space-y-4" aria-label="Smart Intake history">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-semibold text-white">Smart Intake</h2><p className="text-sm text-gray-400">Review incoming email and texts. Manual entries select or create a customer directly.</p></div>
        <button type="button" onClick={() => void reload()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-700 px-3 text-gray-200 hover:bg-gray-800"><RefreshCw className="h-4 w-4" /> Refresh</button>
      </div>
      {unresolvedCustomers > 0 && <p role="status" className="rounded-lg border border-amber-700 p-3 text-sm text-amber-200">{unresolvedCustomers} incoming messages need customer identification before routing.</p>}
      <div className="flex flex-wrap gap-2">
        {(['unmatched','all'] as const).map(tab => <button key={tab} type="button" onClick={() => { setView(tab); setStatus('all'); inspectionVersion.current++; setSelected(null); setAttachments([]); setCustomer(null); }} aria-pressed={view === tab} className={`min-h-11 rounded-lg px-4 text-sm font-medium ${view === tab ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300'}`}>{tab === 'unmatched' ? 'Unmatched' : 'Activity'}</button>)}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <label className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" /><span className="sr-only">Search intake history</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sender, recipient or subject" className="w-full min-h-11 rounded-lg border border-gray-700 bg-gray-900 pl-10 pr-3 text-white" /></label>
        <label className="flex items-center gap-2 text-sm text-gray-300">Channel <select value={channel} onChange={e => setChannel(e.target.value as typeof channel)} className="min-h-11 rounded-lg border border-gray-700 bg-gray-900 px-3 text-white"><option value="all">All</option><option value="email">Email</option><option value="sms">SMS</option><option value="mms">MMS</option></select></label>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-sm text-gray-300">Status<select value={status} onChange={e => setStatus(e.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 text-white"><option value="all">All statuses</option>{(view === 'unmatched' ? ATTENTION_STATUSES : ['received','analyzing','awaiting_customer','awaiting_employee','needs_review','ready','processed','duplicate_linked','dismissed','failed_retryable']).map(value => <option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></label>
        <label className="text-sm text-gray-300">From<input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 text-white" /></label>
        <label className="text-sm text-gray-300">Through<input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 text-white" /></label>
      </div>
      {!orgId && <p className="rounded-lg border border-amber-700 p-3 text-amber-200">Dealer identity is not available. History cannot be loaded.</p>}
      {error && <p role="alert" className="rounded-lg border border-red-700 p-3 text-red-200"><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</p>}
      {busy && <p className="text-sm text-gray-400">Loading intake history…</p>}
      {!busy && !error && orgId && visible.length === 0 && <div className="rounded-xl border border-gray-700 p-8 text-center text-gray-400"><Inbox className="mx-auto mb-2 h-7 w-7" />No matching intake records. This does not prove a customer never sent a message.</div>}
      <div className="space-y-2">{visible.map(row => <button type="button" key={row.id} onClick={() => void inspect(row.id)} className="flex w-full min-w-0 items-start gap-3 rounded-xl border border-gray-700 bg-gray-900 p-4 text-left hover:border-blue-500">
        {row.channel === 'email' ? <Mail className="mt-1 h-5 w-5 shrink-0 text-blue-400" /> : <MessageSquare className="mt-1 h-5 w-5 shrink-0 text-blue-400" />}
        <span className="min-w-0 flex-1"><span className="block truncate font-medium text-white">{row.subject || '(No subject)'}</span><span className="block truncate text-sm text-gray-400">{row.source_address}</span><span className="mt-1 block text-xs text-gray-500">{new Date(row.created_at).toLocaleString()} · {row.channel.toUpperCase()} · {row.status.replaceAll('_',' ')}</span></span><ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
      </button>)}</div>
      {(loadingDetail || detailError || selected) && <div className="rounded-xl border border-gray-700 bg-gray-900 p-4 sm:p-6" aria-label="Intake investigation">
        <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-white">Message investigation</h3><button type="button" className="min-h-11 px-3 text-sm text-gray-300" onClick={() => {inspectionVersion.current++;setSelected(null);setAttachments([]);setCustomer(null);setDetailError('');}}>Close</button></div>
        {loadingDetail && <p className="text-gray-400">Loading timeline…</p>}
        {detailError && <p role="alert" className="text-red-300">{detailError}</p>}
        {selected && <div className="space-y-3 text-sm text-gray-200">
          <p><strong>From:</strong> {selected.item.source_address}</p><p><strong>To:</strong> {selected.item.destination_address}</p><p><strong>Subject:</strong> {selected.item.subject || '(No subject)'}</p>
          <div className="whitespace-pre-wrap break-words rounded-lg bg-gray-800 p-3">{selected.item.raw_body?.trim() ? selected.item.raw_body : '(Blank message body)'}</div>
          <p><strong>Status:</strong> {selected.item.status} · <strong>Classification:</strong> {selected.item.classification}</p>
          <p><strong>Customer:</strong> {customer ? customer.name : selected.item.contact_id ? "Contact matched — details unavailable" : "Unmatched incoming message — employee review required before routing"}</p>
          {customerError && <p role="status" className="text-amber-300">{customerError}</p>}
          {!selected.item.contact_id && <div className="space-y-2 rounded-lg border border-amber-700 p-3">
            <p className="font-semibold text-amber-200">Customer gatekeeper — incoming message</p>
            <p className="text-xs text-gray-300">Search for an existing customer and confirm the correct match. This records the decision but does not yet route the message.</p>
            <label className="block text-sm">Find customer
              <input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="Name or email" className="mt-1 w-full min-h-11 rounded-lg border border-gray-700 bg-gray-800 px-3 text-white" />
            </label>
            {customerSearchBusy && <p role="status">Searching…</p>}
            {customerSearchError && <p role="alert" className="text-amber-300">{customerSearchError}</p>}
            {customerMatches.map(match => <p key={match.id} className="rounded border border-gray-700 p-2">{match.name}{match.email ? ' · ' + match.email : ''} <span className="text-xs text-gray-400">— match candidate (not linked)</span><button type="button" disabled={confirmingCustomer} onClick={() => void confirmCustomer(match)} className="ml-2 rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50">Confirm customer</button></p>)}
            <p className="text-xs text-gray-400"><button type="button" onClick={() => setNewCustomerOpen(value => !value)} className="min-h-11 rounded border border-gray-600 px-3 text-white">{newCustomerOpen ? 'Cancel new customer' : 'Create new customer'}</button>
            {newCustomerOpen && <div className="space-y-2">
              <label className="block">Customer name<input required maxLength={200} value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)} className="mt-1 w-full rounded border border-gray-600 bg-gray-800 p-2" /></label>
              <label className="block">Email (optional)<input type="email" maxLength={254} value={newCustomerEmail} onChange={e => setNewCustomerEmail(e.target.value)} className="mt-1 w-full rounded border border-gray-600 bg-gray-800 p-2" /></label>
              <label className="block">Phone (optional)<input type="tel" maxLength={40} value={newCustomerPhone} onChange={e => setNewCustomerPhone(e.target.value)} className="mt-1 w-full rounded border border-gray-600 bg-gray-800 p-2" /></label>
              <button type="button" disabled={confirmingCustomer || !newCustomerName.trim()} onClick={() => void createCustomerAndConfirm()} className="min-h-11 rounded bg-blue-600 px-3 text-white disabled:opacity-50">Create and confirm customer</button>
            </div>}
          </div>}
          {selected.item.contact_id && selected.item.classification === 'service' && selected.item.status !== 'processed' && <div className="space-y-2 rounded-lg border border-gray-700 p-3">
            <h4 className="font-semibold">Verify service request details</h4>
            <p className="text-xs text-gray-400">Confirm the job location and billing owner before routing. This does not create a service request.</p>
            <label className="block">Job street address<input value={serviceAddress} maxLength={500} onChange={e => setServiceAddress(e.target.value)} className="mt-1 w-full rounded border border-gray-600 bg-gray-800 p-2" /></label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <label>City<input value={serviceCity} maxLength={120} onChange={e => setServiceCity(e.target.value)} className="w-full rounded border border-gray-600 bg-gray-800 p-2" /></label>
              <label>State<input value={serviceState} maxLength={80} onChange={e => setServiceState(e.target.value)} className="w-full rounded border border-gray-600 bg-gray-800 p-2" /></label>
              <label>ZIP<input value={serviceZip} maxLength={20} onChange={e => setServiceZip(e.target.value)} className="w-full rounded border border-gray-600 bg-gray-800 p-2" /></label>
            </div>
            <label className="block">Billing owner<select value={serviceBillingBy} onChange={e => setServiceBillingBy(e.target.value as 'dispatch'|'admin')} className="mt-1 w-full rounded border border-gray-600 bg-gray-800 p-2"><option value="dispatch">Dispatch</option><option value="admin">Admin</option></select></label>
            <p className="text-xs text-gray-400">Billing type: Billable. Warranty and sales-rep billing require the full Service Request form.</p>
            <button type="button" disabled={savingService || !serviceAddress.trim()} onClick={() => void verifyServiceDetails()} className="min-h-11 rounded bg-blue-600 px-3 text-white disabled:opacity-50">Verify service details</button>
            {serviceMessage && <p role="status">{serviceMessage}</p>}
          </div>}
          <p><strong>Linked service request:</strong> {selected.item.service_request_id || 'None'}</p>
          <h4 className="font-semibold">Attachments</h4>
          {attachmentError && <p role="status" className="text-amber-300">{attachmentError}</p>}
          {!attachmentError && attachments.length === 0 && <p className="text-gray-400">No attachments available for review.</p>}
          {attachments.map(file => <div key={file.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-700 bg-gray-800 p-3">
            <div className="min-w-0"><p className="break-all font-medium">{file.original_filename || "Unnamed attachment"}</p><p className="text-xs text-gray-400">{file.byte_size === null ? "Size unknown" : `${(file.byte_size / 1024).toFixed(1)} KB`} · {file.disposition === "discarded" ? "Discarded" : file.disposition === "customer_media" ? "Saved to customer" : file.disposition === "work_order" ? "Linked to work order" : file.disposition === "both" ? "Saved and linked" : file.scan_status === "blocked" || file.scan_status === "failed" ? "Attachment unavailable" : file.scan_status === "pending" ? "Preparing attachment" : new Date(file.expires_at).getTime() <= Date.now() ? "Attachment expired" : "Awaiting review"}</p></div>
            {file.disposition === "pending" && <span className="text-xs text-gray-400">Expires {new Date(file.expires_at).toLocaleDateString()}</span>}
          </div>)}
          <p className="text-xs text-gray-400">Attachment actions will be available once secure review is enabled.</p>
          <h4 className="font-semibold">Processing and delivery timeline</h4>
          {[...selected.messages.map(x => ({id:x.id,at:x.created_at,label:`Message: ${x.direction}`})),...selected.events.map(x => ({id:x.id,at:x.created_at,label:`${x.actor_type}: ${x.event_type}`})),...selected.attempts.map(x => ({id:x.id,at:x.created_at,label:`Attempt ${x.attempt_number}: ${x.outcome}${x.reason_code ? ' ('+x.reason_code+')' : ''}`})),...selected.delivery.map(x => ({id:x.id,at:x.occurred_at,label:`Delivery: ${x.event_kind} ${x.delivery_status ?? ''}`}))].sort((a,b) => a.at.localeCompare(b.at)).map(x => <div key={x.id} className="border-l-2 border-blue-500 py-1 pl-3"><span className="text-xs text-gray-400">{new Date(x.at).toLocaleString()}</span><p>{x.label}</p></div>)}
        </div>}
      </div>}
    </section>
  );
}
