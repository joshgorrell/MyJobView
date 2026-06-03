import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { notifyTechJobAssigned } from '../../lib/dispatchNotifications';
import {
  X,
  Split,
  Calendar,
  Users,
  ListTodo,
  Plus,
  Trash2,
  AlertCircle
} from 'lucide-react';

interface JobSplitModalProps {
  workOrder: {
    id: string;
    work_order_number: string;
    title: string;
    description: string | null;
    estimated_hours: number;
    assigned_to: string | null;
    start_date: string | null;
    projects: {
      contacts: {
        full_name: string;
      };
    };
  };
  onClose: () => void;
  onSuccess: () => void;
}

interface Technician {
  id: string;
  full_name: string;
  role: string;
}

interface SplitPart {
  id: string;
  description: string;
  estimated_hours: number;
  assigned_to: string;
  scheduled_date: string;
}

export function JobSplitModal({ workOrder, onClose, onSuccess }: JobSplitModalProps) {
  const { profile } = useAuth();
  const [techs, setTechs] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(false);
  const [splitType, setSplitType] = useState<'multi_day' | 'multi_tech' | 'multi_task'>('multi_task');
  const [splitReason, setSplitReason] = useState('');
  const [parts, setParts] = useState<SplitPart[]>([
    {
      id: '1',
      description: '',
      estimated_hours: Math.floor(workOrder.estimated_hours / 2),
      assigned_to: workOrder.assigned_to || '',
      scheduled_date: workOrder.start_date || ''
    },
    {
      id: '2',
      description: '',
      estimated_hours: Math.ceil(workOrder.estimated_hours / 2),
      assigned_to: workOrder.assigned_to || '',
      scheduled_date: workOrder.start_date || ''
    }
  ]);

  useEffect(() => {
    loadTechs();
  }, []);

  async function loadTechs() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('role', 'tech')
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;
      setTechs(data || []);
    } catch (error) {
      console.error('Error loading techs:', error);
    }
  }

  function addPart() {
    const nextDate = parts.length > 0 && parts[parts.length - 1].scheduled_date
      ? new Date(parts[parts.length - 1].scheduled_date)
      : new Date();

    if (splitType === 'multi_day') {
      nextDate.setDate(nextDate.getDate() + 1);
    }

    setParts([
      ...parts,
      {
        id: String(parts.length + 1),
        description: '',
        estimated_hours: 2,
        assigned_to: parts[0]?.assigned_to || '',
        scheduled_date: nextDate.toISOString().split('T')[0]
      }
    ]);
  }

  function removePart(id: string) {
    if (parts.length <= 2) {
      alert('Must have at least 2 parts');
      return;
    }
    setParts(parts.filter(p => p.id !== id));
  }

  function updatePart(id: string, field: keyof SplitPart, value: any) {
    setParts(parts.map(p => p.id === id ? { ...p, [field]: value } : p));
  }

  async function handleSplit() {
    if (parts.some(p => !p.description.trim())) {
      alert('All parts must have a description');
      return;
    }

    if (parts.some(p => !p.assigned_to)) {
      alert('All parts must have an assigned technician');
      return;
    }

    if (parts.some(p => !p.scheduled_date)) {
      alert('All parts must have a scheduled date');
      return;
    }

    setLoading(true);
    try {
      const { data: splitData, error: splitError } = await supabase
        .from('job_splits')
        .insert({
          parent_work_order_id: workOrder.id,
          split_type: splitType,
          split_reason: splitReason,
          total_parts: parts.length,
          created_by: profile?.id
        })
        .select()
        .single();

      if (splitError) throw splitError;

      const { data: companyData } = await supabase
        .from('company_settings')
        .select('id')
        .single();

      if (!companyData) throw new Error('Company settings not found');

      const { data: parentWO } = await supabase
        .from('work_orders')
        .select('project_id, contact_id, billable_type, address, service_location_city, service_location_state, service_location_zip')
        .eq('id', workOrder.id)
        .single();

      if (!parentWO) throw new Error('Parent work order not found');

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const woNumber = `${workOrder.work_order_number}-P${i + 1}`;

        const { data: newWO, error: woError } = await supabase
          .from('work_orders')
          .insert({
            company_id: companyData.id,
            project_id: parentWO.project_id,
            contact_id: parentWO.contact_id,
            work_order_number: woNumber,
            title: `${workOrder.title} (Part ${i + 1}/${parts.length})`,
            description: part.description,
            type: 'service',
            status: 'assigned',
            priority: 'medium',
            assigned_to: part.assigned_to,
            start_date: part.scheduled_date,
            estimated_hours: part.estimated_hours,
            created_by: profile?.id,
            billable_type: parentWO.billable_type,
            address: parentWO.address,
            service_location_city: parentWO.service_location_city,
            service_location_state: parentWO.service_location_state,
            service_location_zip: parentWO.service_location_zip,
            is_split_part: true,
            parent_split_id: splitData.id,
            notes: `Part ${i + 1} of ${parts.length} - Split from ${workOrder.work_order_number}`
          })
          .select()
          .single();

        if (woError) throw woError;

        const { error: partError } = await supabase
          .from('job_split_parts')
          .insert({
            job_split_id: splitData.id,
            work_order_id: newWO.id,
            part_number: i + 1,
            assigned_to: part.assigned_to,
            scheduled_date: part.scheduled_date,
            description: part.description,
            estimated_hours: part.estimated_hours,
            status: 'assigned'
          });

        if (partError) throw partError;

        const tech = techs.find(t => t.id === part.assigned_to);
        if (tech) {
          await notifyTechJobAssigned(part.assigned_to, {
            work_order_number: woNumber,
            title: newWO.title,
            customer_name: workOrder.projects.contacts.full_name,
            scheduled_date: part.scheduled_date,
            address: parentWO.address || undefined
          });
        }
      }

      const { error: updateError } = await supabase
        .from('work_orders')
        .update({
          status: 'split',
          notes: `Split into ${parts.length} parts. See split parts for details.`
        })
        .eq('id', workOrder.id);

      if (updateError) throw updateError;

      alert(`Job successfully split into ${parts.length} parts!`);
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error splitting job:', error);
      alert('Failed to split job');
    } finally {
      setLoading(false);
    }
  }

  function getSplitTypeDescription(type: string) {
    switch (type) {
      case 'multi_day':
        return 'Split job across multiple days with same or different techs';
      case 'multi_tech':
        return 'Assign different parts to different technicians simultaneously';
      case 'multi_task':
        return 'Break job into distinct tasks that can be scheduled separately';
      default:
        return '';
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-gray-700">
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Split className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Split Job</h3>
                <p className="text-sm text-gray-400 mt-1">
                  {workOrder.work_order_number} - {workOrder.title}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-gray-900 rounded-lg p-4">
            <div className="text-sm text-gray-400 mb-2">Customer</div>
            <div className="text-white font-medium">{workOrder.projects.contacts.full_name}</div>
            <div className="text-sm text-gray-400 mt-2">Original Estimated Hours: {workOrder.estimated_hours}h</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Split Type *
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { value: 'multi_day', icon: Calendar, label: 'Multi-Day' },
                { value: 'multi_tech', icon: Users, label: 'Multi-Tech' },
                { value: 'multi_task', icon: ListTodo, label: 'Multi-Task' }
              ].map(type => {
                const Icon = type.icon;
                return (
                  <button
                    key={type.value}
                    onClick={() => setSplitType(type.value as any)}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      splitType === type.value
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-gray-700 hover:border-gray-600 bg-gray-900'
                    }`}
                  >
                    <Icon className={`w-6 h-6 mb-2 ${
                      splitType === type.value ? 'text-blue-400' : 'text-gray-400'
                    }`} />
                    <div className={`font-medium ${
                      splitType === type.value ? 'text-blue-400' : 'text-white'
                    }`}>
                      {type.label}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {getSplitTypeDescription(splitType)}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Split Reason (Optional)
            </label>
            <textarea
              value={splitReason}
              onChange={(e) => setSplitReason(e.target.value)}
              rows={2}
              placeholder="Why is this job being split?"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-400">
                Job Parts ({parts.length})
              </label>
              <button
                onClick={addPart}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                Add Part
              </button>
            </div>

            <div className="space-y-3">
              {parts.map((part, idx) => (
                <div
                  key={part.id}
                  className="bg-gray-900 rounded-lg border border-gray-700 p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="text-sm font-medium text-white">
                      Part {idx + 1} of {parts.length}
                    </div>
                    {parts.length > 2 && (
                      <button
                        onClick={() => removePart(part.id)}
                        className="p-1 hover:bg-gray-800 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Description *</label>
                      <input
                        type="text"
                        value={part.description}
                        onChange={(e) => updatePart(part.id, 'description', e.target.value)}
                        placeholder="What needs to be done in this part?"
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Est. Hours *</label>
                        <input
                          type="number"
                          step="0.5"
                          value={part.estimated_hours}
                          onChange={(e) => updatePart(part.id, 'estimated_hours', parseFloat(e.target.value))}
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Scheduled Date *</label>
                        <input
                          type="date"
                          value={part.scheduled_date}
                          onChange={(e) => updatePart(part.id, 'scheduled_date', e.target.value)}
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Assign To *</label>
                        <select
                          value={part.assigned_to}
                          onChange={(e) => updatePart(part.id, 'assigned_to', e.target.value)}
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select...</option>
                          {techs.map(tech => (
                            <option key={tech.id} value={tech.id}>{tech.full_name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-300">
                <strong>Note:</strong> Splitting this job will create {parts.length} new work orders and mark the original as "split". Each technician will receive a notification for their assigned part.
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-700 flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-6 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSplit}
            disabled={loading}
            className="px-8 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-semibold"
          >
            <Split className="w-5 h-5" />
            {loading ? 'Splitting...' : `Split into ${parts.length} Parts`}
          </button>
        </div>
      </div>
    </div>
  );
}
