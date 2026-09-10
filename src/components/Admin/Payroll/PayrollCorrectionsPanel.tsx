import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { GitBranch, Plus, X } from 'lucide-react';

interface Correction {
  id: string;
  original_segment_id: string;
  correction_type: string;
  original_hours: number | null;
  corrected_hours: number | null;
  original_jurisdiction: string | null;
  corrected_jurisdiction: string | null;
  reason: string;
  status: string;
  created_at: string;
  applied_to_pay_period_id: string | null;
}

export default function PayrollCorrectionsPanel({ payPeriodId }: { payPeriodId: string | null }) {
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    original_segment_id: '',
    correction_type: 'hours_adjustment',
    original_hours: '',
    corrected_hours: '',
    original_jurisdiction: '',
    corrected_jurisdiction: '',
    reason: '',
  });

  const loadCorrections = useCallback(async () => {
    if (!payPeriodId) return;
    setLoading(true);
    try {
      const { data: period } = await supabase
        .from('pay_periods')
        .select('organization_id')
        .eq('id', payPeriodId)
        .maybeSingle();

      if (!period) return;

      const { data, error } = await supabase
        .from('payroll_corrections')
        .select('*')
        .eq('organization_id', period.organization_id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setCorrections(data || []);
    } catch (err) {
      console.error('Error loading corrections:', err);
    } finally {
      setLoading(false);
    }
  }, [payPeriodId]);

  useEffect(() => {
    loadCorrections();
  }, [loadCorrections]);

  const submitCorrection = async () => {
    if (!formData.original_segment_id || !formData.reason) return;
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data: period } = await supabase
        .from('pay_periods')
        .select('organization_id')
        .eq('id', payPeriodId)
        .maybeSingle();

      if (!period) return;

      const { error } = await supabase.from('payroll_corrections').insert({
        organization_id: period.organization_id,
        original_segment_id: formData.original_segment_id,
        correction_type: formData.correction_type,
        original_hours: formData.original_hours ? Number(formData.original_hours) : null,
        corrected_hours: formData.corrected_hours ? Number(formData.corrected_hours) : null,
        original_jurisdiction: formData.original_jurisdiction || null,
        corrected_jurisdiction: formData.corrected_jurisdiction || null,
        reason: formData.reason,
        created_by: userData.data.user?.id,
        status: 'open',
      });

      if (error) throw error;
      setShowForm(false);
      setFormData({
        original_segment_id: '',
        correction_type: 'hours_adjustment',
        original_hours: '',
        corrected_hours: '',
        original_jurisdiction: '',
        corrected_jurisdiction: '',
        reason: '',
      });
      await loadCorrections();
    } catch (err: any) {
      console.error('Error creating correction:', err);
      alert(err.message || 'Failed to create correction');
    }
  };

  if (loading) {
    return <div className="p-4 text-sm text-slate-500">Loading corrections...</div>;
  }

  if (!payPeriodId) {
    return <div className="p-4 text-sm text-slate-500">Select a pay period to view corrections.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-slate-400" />
          <h3 className="text-lg font-semibold text-slate-800">Payroll Corrections</h3>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancel' : 'Create Correction'}
        </button>
      </div>

      {showForm && (
        <div className="p-4 bg-white border border-slate-200 rounded-lg space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500">Original Segment ID</label>
              <input
                type="text"
                value={formData.original_segment_id}
                onChange={(e) => setFormData({ ...formData, original_segment_id: e.target.value })}
                className="w-full px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-500"
                placeholder="UUID of locked segment"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Correction Type</label>
              <select
                value={formData.correction_type}
                onChange={(e) => setFormData({ ...formData, correction_type: e.target.value })}
                className="w-full px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-500"
              >
                <option value="hours_adjustment">Hours Adjustment</option>
                <option value="jurisdiction_change">Jurisdiction Change</option>
                <option value="time_type_change">Time Type Change</option>
                <option value="removal">Removal</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500">Original Hours</label>
              <input
                type="number"
                step="0.1"
                value={formData.original_hours}
                onChange={(e) => setFormData({ ...formData, original_hours: e.target.value })}
                className="w-full px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Corrected Hours</label>
              <input
                type="number"
                step="0.1"
                value={formData.corrected_hours}
                onChange={(e) => setFormData({ ...formData, corrected_hours: e.target.value })}
                className="w-full px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Original Jurisdiction</label>
              <input
                type="text"
                maxLength={2}
                value={formData.original_jurisdiction}
                onChange={(e) => setFormData({ ...formData, original_jurisdiction: e.target.value })}
                className="w-full px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Corrected Jurisdiction</label>
              <input
                type="text"
                maxLength={2}
                value={formData.corrected_jurisdiction}
                onChange={(e) => setFormData({ ...formData, corrected_jurisdiction: e.target.value })}
                className="w-full px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500">Reason (required)</label>
            <input
              type="text"
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              className="w-full px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-500"
              placeholder="Why is this correction needed?"
            />
          </div>
          <button
            onClick={submitCorrection}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Submit Correction
          </button>
        </div>
      )}

      {corrections.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-500 bg-slate-50 rounded-lg">
          No corrections have been created. Corrections are used when a locked payroll
          period needs adjustment — the correction flows into the next pay period rather
          than rewriting history.
        </div>
      ) : (
        <div className="space-y-2">
          {corrections.map((c) => (
            <div key={c.id} className="p-3 bg-white border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-slate-700">
                  {c.correction_type.replace('_', ' ')}
                </div>
                <span
                  className={`px-2 py-0.5 text-xs rounded-full ${
                    c.status === 'open'
                      ? 'bg-amber-100 text-amber-700'
                      : c.status === 'applied'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {c.status}
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {c.original_hours !== null && `Original: ${c.original_hours}h`}
                {c.corrected_hours !== null && ` -> Corrected: ${c.corrected_hours}h`}
                {c.original_jurisdiction && ` | ${c.original_jurisdiction}`}
                {c.corrected_jurisdiction && ` -> ${c.corrected_jurisdiction}`}
              </div>
              <div className="text-xs text-slate-600 mt-1">Reason: {c.reason}</div>
              <div className="text-xs text-slate-400 mt-1">
                {new Date(c.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
