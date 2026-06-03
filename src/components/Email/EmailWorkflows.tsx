import { useState, useEffect } from 'react';
import { Mail, Plus, Play, Pause, Trash2, Edit, Eye, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ConfirmModal from '../ui/ConfirmModal';

interface Workflow {
  id: string;
  name: string;
  description: string;
  trigger_event: string;
  is_active: boolean;
  created_at: string;
}

interface WorkflowStep {
  id: string;
  step_order: number;
  name: string;
  delay_days: number;
  delay_hours: number;
  subject: string;
  body: string;
}

export function EmailWorkflows() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showStepsModal, setShowStepsModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    loadWorkflows();
  }, []);

  async function loadWorkflows() {
    try {
      const { data, error } = await supabase
        .from('email_workflows')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setWorkflows(data || []);
    } catch (error) {
      console.error('Error loading workflows:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadWorkflowSteps(workflowId: string) {
    try {
      const { data, error } = await supabase
        .from('email_workflow_steps')
        .select('*')
        .eq('workflow_id', workflowId)
        .order('step_order');

      if (error) throw error;
      setSteps(data || []);
    } catch (error) {
      console.error('Error loading steps:', error);
    }
  }

  async function toggleWorkflowStatus(workflowId: string, currentStatus: boolean) {
    try {
      const { error } = await supabase
        .from('email_workflows')
        .update({ is_active: !currentStatus })
        .eq('id', workflowId);

      if (error) throw error;
      loadWorkflows();
    } catch (error) {
      console.error('Error toggling workflow:', error);
      alert('Failed to update workflow status');
    }
  }

  async function deleteWorkflow(workflowId: string) {
    try {
      const { error } = await supabase
        .from('email_workflows')
        .delete()
        .eq('id', workflowId);

      if (error) throw error;
      loadWorkflows();
    } catch (error) {
      console.error('Error deleting workflow:', error);
      alert('Failed to delete workflow');
    }
  }

  function openStepsModal(workflow: Workflow) {
    setSelectedWorkflow(workflow);
    loadWorkflowSteps(workflow.id);
    setShowStepsModal(true);
  }

  const triggerLabels: { [key: string]: string } = {
    lead_created: 'Lead Created',
    proposal_sent: 'Proposal Sent',
    proposal_approved: 'Proposal Approved',
    invoice_sent: 'Invoice Sent',
    invoice_overdue: 'Invoice Overdue',
    manual: 'Manual Enrollment'
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-300">Loading workflows...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">Email Automation Workflows</h2>
          <p className="text-gray-300">Create automated email sequences and drip campaigns</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Create Workflow
        </button>
      </div>

      {workflows.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <Mail className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No workflows yet</h3>
          <p className="text-gray-600 mb-6">
            Create your first automated email workflow to nurture leads and engage customers
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Create Your First Workflow
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {workflows.map(workflow => (
            <div
              key={workflow.id}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">{workflow.name}</h3>
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        workflow.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {workflow.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{workflow.description}</p>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Clock className="w-4 h-4" />
                    Trigger: {triggerLabels[workflow.trigger_event] || workflow.trigger_event}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-4 border-t border-gray-200">
                <button
                  onClick={() => openStepsModal(workflow)}
                  className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 flex items-center gap-1"
                >
                  <Eye className="w-4 h-4" />
                  View Steps
                </button>
                <button
                  onClick={() => toggleWorkflowStatus(workflow.id, workflow.is_active)}
                  className={`px-3 py-1.5 text-sm rounded flex items-center gap-1 ${
                    workflow.is_active
                      ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                  }`}
                >
                  {workflow.is_active ? (
                    <>
                      <Pause className="w-4 h-4" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Activate
                    </>
                  )}
                </button>
                <button
                  onClick={() => setConfirmModal({ title: 'Delete Workflow', message: 'Are you sure you want to delete this workflow? This cannot be undone.', onConfirm: () => deleteWorkflow(workflow.id) })}
                  className="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 flex items-center gap-1"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateWorkflowModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            loadWorkflows();
            setShowCreateModal(false);
          }}
        />
      )}

      {showStepsModal && selectedWorkflow && (
        <WorkflowStepsModal
          workflow={selectedWorkflow}
          steps={steps}
          onClose={() => {
            setShowStepsModal(false);
            setSelectedWorkflow(null);
          }}
        />
      )}

      <ConfirmModal
        isOpen={confirmModal !== null}
        title={confirmModal?.title ?? ''}
        message={confirmModal?.message ?? ''}
        onConfirm={() => { confirmModal?.onConfirm(); setConfirmModal(null); }}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}

function CreateWorkflowModal({
  onClose,
  onSuccess
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [trigger, setTrigger] = useState('lead_created');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      const { error } = await supabase
        .from('email_workflows')
        .insert({
          company_id: profile?.id,
          name,
          description,
          trigger_event: trigger,
          is_active: false
        });

      if (error) throw error;
      onSuccess();
    } catch (error) {
      console.error('Error creating workflow:', error);
      alert('Failed to create workflow');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">Create Email Workflow</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Workflow Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Welcome Series"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Brief description of this workflow"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Trigger Event
            </label>
            <select
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="lead_created">Lead Created</option>
              <option value="proposal_sent">Proposal Sent</option>
              <option value="proposal_approved">Proposal Approved</option>
              <option value="invoice_sent">Invoice Sent</option>
              <option value="invoice_overdue">Invoice Overdue</option>
              <option value="manual">Manual Enrollment</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Workflow'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function WorkflowStepsModal({
  workflow,
  steps,
  onClose
}: {
  workflow: Workflow;
  steps: WorkflowStep[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">{workflow.name}</h3>
            <p className="text-sm text-gray-600">{workflow.description}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        </div>

        {steps.length === 0 ? (
          <div className="text-center py-12">
            <Mail className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-300">No steps configured yet</p>
            <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Add First Step
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {steps.map((step, index) => (
              <div key={step.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-semibold">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 mb-1">{step.name}</h4>
                    <p className="text-sm text-gray-600 mb-2">
                      Delay: {step.delay_days} days, {step.delay_hours} hours
                    </p>
                    <div className="bg-gray-50 rounded p-3 mt-2">
                      <p className="text-sm font-medium text-gray-700 mb-1">
                        Subject: {step.subject}
                      </p>
                      <p className="text-sm text-gray-600 line-clamp-3">
                        {step.body}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
