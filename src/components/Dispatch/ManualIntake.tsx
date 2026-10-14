import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';

type IntakeType = 'service' | 'support' | 'task' | 'sales' | 'other';
type Customer = { id: string; company_name: string | null; contact_name: string | null; email: string | null };

export function ManualIntake({ onClose }: { onClose: () => void }) {
  const { tenant } = useTenant();
  const { profile } = useAuth();
  const organizationId = tenant?.organizationId && profile?.organization_id === tenant.organizationId
    ? tenant.organizationId : !tenant ? profile?.organization_id : null;
  const [type, setType] = useState<IntakeType>('service');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [contactId, setContactId] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!organizationId) return;
    // Only a bounded, tenant-scoped customer list. Do not query across organizations.
    void supabase.from('contacts').select('id,company_name,contact_name,email')
      .eq('organization_id', organizationId).order('company_name').limit(200)
      .then(({ data, error: lookupError }) => {
        if (!active) return;
        if (lookupError) setError('Customer lookup is unavailable.');
        else setCustomers(data ?? []);
      });
    return () => { active = false; };
  }, [organizationId]);

  const filtered = customers.filter(customer =>
    [customer.company_name, customer.contact_name, customer.email].some(value =>
      value?.toLowerCase().includes(customerSearch.trim().toLowerCase())));
  const canContinue = !!organizationId && !!contactId && !!subject.trim() && !!description.trim();

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
            <option value="service">Service Request</option><option value="support">Customer Support</option>
            <option value="task">Task</option><option value="sales">Sales Lead</option><option value="other">Other / Needs Review</option>
          </select>
        </label>
        <label className="space-y-1 text-sm text-gray-300">Priority
          <select value={priority} onChange={e => setPriority(e.target.value)} className="w-full min-h-11 rounded-lg border border-gray-700 bg-gray-800 px-3 text-white">
            <option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option><option value="low">Low</option>
          </select>
        </label>
      </div>
      <label className="block space-y-1 text-sm text-gray-300">Find customer
        <input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="Search company, name, or email" className="w-full min-h-11 rounded-lg border border-gray-700 bg-gray-800 px-3 text-white" />
      </label>
      <label className="block space-y-1 text-sm text-gray-300">Customer
        <select value={contactId} onChange={e => setContactId(e.target.value)} className="w-full min-h-11 rounded-lg border border-gray-700 bg-gray-800 px-3 text-white">
          <option value="">Select an existing customer</option>
          {filtered.map(customer => <option key={customer.id} value={customer.id}>{customer.company_name || customer.contact_name || customer.email || 'Unnamed contact'}</option>)}
        </select>
      </label>
      <label className="block space-y-1 text-sm text-gray-300">Subject
        <input value={subject} onChange={e => setSubject(e.target.value)} maxLength={200} className="w-full min-h-11 rounded-lg border border-gray-700 bg-gray-800 px-3 text-white" />
      </label>
      <label className="block space-y-1 text-sm text-gray-300">Details
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} maxLength={10000} className="w-full rounded-lg border border-gray-700 bg-gray-800 p-3 text-white" />
      </label>
      {type === 'task' && <label className="block space-y-1 text-sm text-gray-300">Due date (optional)
        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full min-h-11 rounded-lg border border-gray-700 bg-gray-800 px-3 text-white" />
      </label>}
      {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="min-h-11 rounded-lg px-4 text-gray-300">Cancel</button>
        <button type="button" disabled={!canContinue} title="Server-side creation and routing are not yet enabled" className="min-h-11 rounded-lg bg-gray-700 px-4 font-medium text-gray-300 disabled:opacity-50">
          Create {type === 'service' ? 'Service Request' : type === 'support' ? 'Support Issue' : type === 'task' ? 'Task' : type === 'sales' ? 'Sales Lead' : 'Intake'} (coming soon)
        </button>
      </div>
      <p className="text-xs text-gray-400">Form preview only. Creation remains disabled until secure server-side routing is connected. No records are saved.</p>
    </section>
  );
}
