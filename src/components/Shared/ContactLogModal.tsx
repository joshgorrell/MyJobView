import { useState } from 'react';
import { X, Phone, MessageSquare, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { NO_CONTACT_UPDATED_EVENT } from '../../hooks/useNoContactCount';

interface ContactLogModalProps {
  workOrderId?: string;
  serviceRequestId?: string;
  customerName: string;
  onClose: () => void;
  onSaved: () => void;
}

export function ContactLogModal({ workOrderId, serviceRequestId, customerName, onClose, onSaved }: ContactLogModalProps) {
  const { profile } = useAuth();
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolveOrgId(): Promise<string | null> {
    if (profile?.organization_id) return profile.organization_id;

    if (serviceRequestId) {
      const { data } = await supabase
        .from('service_requests')
        .select('organization_id')
        .eq('id', serviceRequestId)
        .maybeSingle();
      if (data?.organization_id) return data.organization_id;
    }

    if (workOrderId) {
      const { data } = await supabase
        .from('work_orders')
        .select('organization_id')
        .eq('id', workOrderId)
        .maybeSingle();
      if (data?.organization_id) return data.organization_id;
    }

    const { data } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', profile?.id)
      .maybeSingle();
    return data?.organization_id ?? null;
  }

  async function handleSave() {
    if (!profile) return;
    if (!notes.trim()) {
      setError('Please add a note about this contact attempt.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const orgId = await resolveOrgId();

      if (!orgId) {
        throw new Error('Could not determine your organization. Please reload and try again.');
      }

      const { error: insertError } = await supabase
        .from('customer_contact_log')
        .insert({
          organization_id: orgId,
          work_order_id: workOrderId ?? null,
          service_request_id: serviceRequestId ?? null,
          logged_by: profile.id,
          logged_by_name: profile.full_name || profile.username || 'Unknown',
          notes: notes.trim(),
        });

      if (insertError) throw insertError;

      if (workOrderId && !serviceRequestId) {
        await supabase
          .from('work_orders')
          .update({
            customer_contact_confirmed_at: new Date().toISOString(),
            customer_contact_confirmed_by: profile.id,
          })
          .eq('id', workOrderId)
          .is('customer_contact_confirmed_at', null);
      }

      if (serviceRequestId) {
        await supabase
          .from('service_requests')
          .update({
            customer_contact_confirmed_at: new Date().toISOString(),
            customer_contact_confirmed_by: profile.id,
          })
          .eq('id', serviceRequestId)
          .is('customer_contact_confirmed_at', null);
      }

      window.dispatchEvent(new CustomEvent(NO_CONTACT_UPDATED_EVENT));
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save contact log.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center">
              <Phone className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Log Customer Contact</h2>
              <p className="text-xs text-gray-500">{customerName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-gray-400" />
              Contact Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Left voicemail, requested callback — or — Spoke with customer, confirmed appointment for Thursday..."
              rows={4}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 pb-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !notes.trim()}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Contact Log
          </button>
        </div>
      </div>
    </div>
  );
}
