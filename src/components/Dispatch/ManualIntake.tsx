import { useEffect, useState, lazy, Suspense } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { validateManualIntakeDraft } from '../../lib/smart-intake/manual-draft';
import { toTaskDraft } from '../../lib/smart-intake/task-payload';

const TaskForm = lazy(() => import('../Tasks/TaskForm').then(m => ({ default: m.TaskForm })));

type IntakeType = 'service' | 'support' | 'task';
type Customer = { id: string; company_name: string | null; contact_name: string | null; email: string | null; office_id: string | null };

export function ManualIntake({ onClose, onCreated, serviceOnly = false }: { onClose: () => void; onCreated?: () => void; serviceOnly?: boolean }) {
  const { tenant } = useTenant();
  const { profile } = useAuth();
  const organizationId = tenant?.organizationId && profile?.organization_id === tenant.organizationId
    ? tenant.organizationId : !tenant ? profile?.organization_id : null;
  const [type, setType] = useState<IntakeType>('service');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [contactId, setContactId] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [dueDate, setDueDate] = useState('');
  const [jobAddress, setJobAddress] = useState('');
  const [jobCity, setJobCity] = useState('');
  const [jobState, setJobState] = useState('');
  const [jobZip, setJobZip] = useState('');
  const [billableType, setBillableType] = useState('billable');
  const [billableBy, setBillableBy] = useState('dispatch');
  const [assigneeNotes, setAssigneeNotes] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [officeId, setOfficeId] = useState('');
  const [offices, setOffices] = useState<Array<{ id: string; office_name: string }>>([]);
  const [assignees, setAssignees] = useState<Array<{ id: string; full_name: string | null }>>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [error, setError] = useState('');
  const [taskReviewOpen, setTaskReviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    const query = customerSearch.trim();
    setCustomers([]);
    setError('');
    if (!organizationId || query.length < 2) return () => { active = false; };
    setCustomerLoading(true);
    const timer = setTimeout(async () => {
      const safe = query.replace(/[%_,()\\]/g, '').slice(0, 80);
      if (!safe) { if (active) setCustomerLoading(false); return; }
      const { data, error: lookupError } = await supabase.from('contacts')
        .select('id,company_name,contact_name,email,office_id')
        .eq('organization_id', organizationId)
        .or(['company_name.ilike.%' + safe + '%', 'contact_name.ilike.%' + safe + '%', 'email.ilike.%' + safe + '%'].join(','))
        .order('company_name').limit(25);
      if (!active) return;
      setCustomerLoading(false);
      if (lookupError) setError('Customer lookup is unavailable.');
      else setCustomers(data ?? []);
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [organizationId, customerSearch]);

  useEffect(() => {
    let active = true;
    setAssignees([]);
    setAssigneeId('');
    if (!organizationId) return () => { active = false; };
    void supabase.from('profiles').select('id,full_name')
      .eq('organization_id', organizationId).order('full_name').then(({ data, error: lookupError }) => {
        if (!active) return;
        if (lookupError) setError('Employee lookup is unavailable.');
        else setAssignees(data ?? []);
      });
    return () => { active = false; };
  }, [organizationId]);

  useEffect(() => {
    let active = true;
    setOffices([]);
    setOfficeId('');
    if (!organizationId) return () => { active = false; };
    void supabase.from('company_offices').select('id,office_name')
      .eq('organization_id', organizationId).order('office_name').then(({ data, error: lookupError }) => {
        if (!active) return;
        if (lookupError) setError('Office lookup is unavailable.');
        else setOffices(data ?? []);
      });
    return () => { active = false; };
  }, [organizationId]);

  const filtered = [ ...(selectedCustomer && !customers.some(customer => customer.id === selectedCustomer.id) ? [selectedCustomer] : []), ...customers ].filter(customer => customer.id === contactId || [customer.company_name, customer.contact_name, customer.email].some(value => value?.toLowerCase().includes(customerSearch.trim().toLowerCase())));
  const purposeGuidance: Record<IntakeType, string> = {
    service: 'Equipment, installation, repair, or on-site service. Creates a service request for the dispatch queue.',
    support: 'A customer question or issue that may be resolved without dispatching a technician.',
    task: 'Internal follow-up or action for an employee. Assign an owner and optional due date.',
  };
  const draftValidation = validateManualIntakeDraft({
    purpose: type, organizationId, contactId, subject, description, priority, dueDate, assignmentNotes: assigneeNotes, assigneeId, officeId, jobAddress, jobCity, jobState, jobZip, billableType, billableBy,
  });


  const submitService = async () => {
    if (!draftValidation.ok || draftValidation.value.purpose !== 'service' || submitting) return;
    const draft = draftValidation.value;
    if (selectedCustomer?.id !== draft.contactId || selectedCustomer.office_id !== draft.officeId) {
      setError('Select a customer and their matching office before submitting.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const { error: submitError } = await supabase.rpc('smart_intake_create_manual_service', {
        target_org: draft.organizationId, target_contact: draft.contactId,
        target_office: draft.officeId, request_subject: draft.subject,
        request_details: draft.description, request_priority: draft.priority,
        job_address: draft.jobAddress, job_city: draft.jobCity,
        job_state: draft.jobState, job_zip: draft.jobZip,
        billing_type: draft.billableType, billing_by: draft.billableBy,
      });
      if (submitError) throw submitError;
      (onCreated ?? onClose)();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not create the Service Request.');
    } finally {
      setSubmitting(false);
    }
  };

  if (taskReviewOpen && draftValidation.ok && draftValidation.value.purpose === 'task') {
    const taskDraft = toTaskDraft(draftValidation.value);
    return <Suspense fallback={<p className="p-4 text-gray-300">Loading task review…</p>}>
      <TaskForm contactId={taskDraft.contact_id} aiPrefill={{ contactId: taskDraft.contact_id, title: taskDraft.title, description: taskDraft.description, priority: taskDraft.priority, dueDate: taskDraft.due_date || undefined, assigneeId: taskDraft.assigned_to || undefined }} onClose={() => setTaskReviewOpen(false)} onSuccess={onClose} />
    </Suspense>;
  }

  return (
    <section className="rounded-xl border border-gray-700 bg-gray-900 p-4 sm:p-6 space-y-4" aria-label="New manual intake">
      <div className="flex items-start justify-between gap-3">
        <div><h3 className="text-lg font-semibold text-white">New Intake</h3>
          <p className="text-sm text-gray-400">Enter the customer and choose what needs to happen.</p></div>
        <button type="button" onClick={onClose} className="min-h-11 rounded-lg px-3 text-gray-300 hover:bg-gray-800">Close</button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm text-gray-300">Type
          <select value={type} onChange={e => setType(e.target.value as IntakeType)} className="w-full min-h-11 rounded-lg border border-gray-700 bg-gray-800 px-3 text-white">
            <option value="service">Service Request</option>{!serviceOnly && <option value="support">Customer Support</option>}
            {!serviceOnly && <option value="task">Task</option>}
          </select>
        </label>
        <label className="space-y-1 text-sm text-gray-300">Priority
          <select value={priority} onChange={e => setPriority(e.target.value)} className="w-full min-h-11 rounded-lg border border-gray-700 bg-gray-800 px-3 text-white">
            <option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option><option value="low">Low</option>
          </select>
        </label>
      </div>
      <label className="block space-y-1 text-sm text-gray-300">Office
        <select value={officeId} onChange={e => setOfficeId(e.target.value)} className="w-full min-h-11 rounded-lg border border-gray-700 bg-gray-800 px-3 text-white">
          <option value="">No office selected</option>
          {offices.map(office => <option key={office.id} value={office.id}>{office.office_name}</option>)}
        </select>
      </label>
      <label className="block space-y-1 text-sm text-gray-300">Find customer
        <input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="Enter at least 2 characters to search customers" className="w-full min-h-11 rounded-lg border border-gray-700 bg-gray-800 px-3 text-white" />
      </label>
      {customerLoading && <p role="status" className="text-xs text-gray-400">Searching customers…</p>}
      <p className="text-sm text-blue-300">{purposeGuidance[type]}</p>
      <label className="block space-y-1 text-sm text-gray-300">Customer
        <select value={contactId} onChange={e => { const id = e.target.value; setContactId(id); const customer = filtered.find(customer => customer.id === id) ?? null; setSelectedCustomer(customer); if (customer?.office_id) setOfficeId(customer.office_id); }} className="w-full min-h-11 rounded-lg border border-gray-700 bg-gray-800 px-3 text-white">
          <option value="">Select an existing customer</option>
          {filtered.map(customer => <option key={customer.id} value={customer.id}>{customer.company_name || customer.contact_name || customer.email || 'Unnamed contact'}</option>)}
        </select>
      </label>
      {contactId && <p className="text-xs text-gray-400">Selected customer: {selectedCustomer?.company_name || selectedCustomer?.contact_name || selectedCustomer?.email || 'Previously selected contact'}</p>}
      <label className="block space-y-1 text-sm text-gray-300">Subject
        <input value={subject} onChange={e => setSubject(e.target.value)} maxLength={200} className="w-full min-h-11 rounded-lg border border-gray-700 bg-gray-800 px-3 text-white" />
      </label>
      <label className="block space-y-1 text-sm text-gray-300">Details
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} maxLength={10000} className="w-full rounded-lg border border-gray-700 bg-gray-800 p-3 text-white" />
      </label>
      {type === 'service' && <div className="space-y-3 rounded-lg border border-gray-700 p-3" aria-label="Service request details">
        <h4 className="font-medium text-white">Service location & billing</h4>
        <label className="block space-y-1 text-sm text-gray-300">Job address
          <input value={jobAddress} onChange={e => setJobAddress(e.target.value)} maxLength={300} className="w-full min-h-11 rounded-lg border border-gray-700 bg-gray-800 px-3 text-white" />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm text-gray-300">City<input value={jobCity} onChange={e => setJobCity(e.target.value)} maxLength={100} className="w-full min-h-11 rounded-lg border border-gray-700 bg-gray-800 px-3 text-white" /></label>
          <label className="space-y-1 text-sm text-gray-300">State<input value={jobState} onChange={e => setJobState(e.target.value)} maxLength={50} className="w-full min-h-11 rounded-lg border border-gray-700 bg-gray-800 px-3 text-white" /></label>
          <label className="space-y-1 text-sm text-gray-300">ZIP<input value={jobZip} onChange={e => setJobZip(e.target.value)} maxLength={20} className="w-full min-h-11 rounded-lg border border-gray-700 bg-gray-800 px-3 text-white" /></label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm text-gray-300">Billing type
            <select value={billableType} onChange={e => setBillableType(e.target.value)} className="w-full min-h-11 rounded-lg border border-gray-700 bg-gray-800 px-3 text-white"><option value="billable">Billable</option><option value="warranty">Warranty</option></select>
          </label>
          <label className="space-y-1 text-sm text-gray-300">Billing responsibility
            <select value={billableBy} onChange={e => setBillableBy(e.target.value)} className="w-full min-h-11 rounded-lg border border-gray-700 bg-gray-800 px-3 text-white"><option value="dispatch">Dispatch</option><option value="admin">Administration</option><option value="assigned_sales_rep">Assigned sales rep</option><option value="other_sales_rep">Other sales rep</option></select>
          </label>
        </div>
      </div>}
      {(type === 'task' || type === 'support') && <label className="block space-y-1 text-sm text-gray-300">Assign to employee
        <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className="w-full min-h-11 rounded-lg border border-gray-700 bg-gray-800 px-3 text-white">
          <option value="">Unassigned</option>
          {assignees.map(person => <option key={person.id} value={person.id}>{person.full_name || 'Unnamed employee'}</option>)}
        </select>
      </label>}
      {(type === 'task' || type === 'support') && <label className="block space-y-1 text-sm text-gray-300">Assignment / follow-up notes
        <textarea value={assigneeNotes} onChange={e => setAssigneeNotes(e.target.value)} rows={2} maxLength={1000} placeholder="Who should handle this, and what needs to happen?" className="w-full rounded-lg border border-gray-700 bg-gray-800 p-3 text-white" />
      </label>}
      {type === 'task' && <label className="block space-y-1 text-sm text-gray-300">Due date (optional)
        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full min-h-11 rounded-lg border border-gray-700 bg-gray-800 px-3 text-white" />
      </label>}
      {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}
      {!draftValidation.ok && <p className="text-xs text-gray-400">{draftValidation.errors[0]}</p>}
      {type === 'task' && draftValidation.ok && <button type="button" onClick={() => setTaskReviewOpen(true)} className="min-h-11 rounded-lg bg-blue-600 px-4 font-medium text-white hover:bg-blue-500">Review in Task Form</button>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="min-h-11 rounded-lg px-4 text-gray-300">Cancel</button>
        <button type="button" onClick={() => { if (type === 'service') void submitService(); }} disabled={type !== 'service' || !draftValidation.ok || submitting} className="min-h-11 rounded-lg bg-blue-600 px-4 font-medium text-white disabled:opacity-50">
          {submitting ? 'Creating…' : type === 'service' ? 'Create Service Request' : type === 'support' ? 'Support submission coming soon' : 'Task submission coming soon'}
        </button>
      </div>
      <p className="text-xs text-gray-400">Service Requests are created directly with a linked audit record. Support and Task submission are still being connected.</p>
    </section>
  );
}
