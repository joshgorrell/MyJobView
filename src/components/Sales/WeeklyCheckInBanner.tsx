import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  DollarSign,
  FileText,
  ListChecks,
  X,
  Loader2
} from 'lucide-react';

interface StaleProposal {
  id: string;
  proposal_number: string;
  title: string | null;
  status: string;
  total: number;
  created_at: string;
  days_old: number;
  contact_name: string | null;
  has_note_this_week: boolean;
}

interface OverdueTask {
  id: string;
  title: string;
  due_date: string;
  days_overdue: number;
  status: string;
  contact_name: string | null;
}

const STATUS_OPTIONS = [
  { value: 'following_up', label: 'Following Up', color: 'bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200' },
  { value: 'waiting_on_customer', label: 'Waiting on Customer', color: 'bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200' },
  { value: 'verbal_yes', label: 'Verbal Yes', color: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200' },
  { value: 'needs_revision', label: 'Needs Revision', color: 'bg-orange-100 text-orange-700 hover:bg-orange-200 border-orange-200' },
  { value: 'no_response', label: 'No Response', color: 'bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-200' },
  { value: 'ready_to_close', label: 'Ready to Close', color: 'bg-green-100 text-green-700 hover:bg-green-200 border-green-200' },
];

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

function getStatusBadgeColor(status: string): string {
  const map: Record<string, string> = {
    sent: 'bg-blue-100 text-blue-700',
    viewed: 'bg-cyan-100 text-cyan-700',
    approved_pending_action: 'bg-amber-100 text-amber-700',
    designing: 'bg-purple-100 text-purple-700',
    ready: 'bg-teal-100 text-teal-700',
  };
  return map[status] || 'bg-gray-100 text-gray-600';
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

interface ProposalCardProps {
  proposal: StaleProposal;
  onSaved: (proposalId: string) => void;
  onNavigate?: (proposalId: string) => void;
}

function ProposalCheckInCard({ proposal, onSaved, onNavigate }: ProposalCardProps) {
  const { profile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [savedStatus, setSavedStatus] = useState<string | null>(null);
  const [showFreeText, setShowFreeText] = useState(false);
  const [freeText, setFreeText] = useState('');
  const [dismissed, setDismissed] = useState(false);

  async function handleStatusClick(statusValue: string) {
    if (!profile?.id) return;
    setSaving(true);
    const weekStart = getWeekStart(new Date());

    const { error } = await supabase
      .from('proposal_weekly_notes')
      .upsert({
        proposal_id: proposal.id,
        rep_id: profile.id,
        created_by: profile.id,
        week_start_date: weekStart,
        status_note: statusValue,
        free_text: freeText || null,
        organization_id: profile.organization_id,
      }, { onConflict: 'proposal_id,rep_id,week_start_date' });

    setSaving(false);
    if (!error) {
      setSavedStatus(statusValue);
      setTimeout(() => {
        setDismissed(true);
        setTimeout(() => onSaved(proposal.id), 300);
      }, 800);
    }
  }

  async function handleFreeTextSave() {
    if (!savedStatus) return;
    await handleStatusClick(savedStatus);
  }

  if (dismissed) return null;

  return (
    <div className={`bg-white border border-gray-200 rounded-xl p-4 transition-all duration-300 ${savedStatus ? 'border-green-300 bg-green-50' : ''}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => onNavigate?.(proposal.id)}
              className="font-semibold text-gray-900 hover:text-blue-600 transition-colors text-sm truncate"
            >
              {proposal.proposal_number}
            </button>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusBadgeColor(proposal.status)}`}>
              {formatStatus(proposal.status)}
            </span>
          </div>
          <div className="text-sm text-gray-600 truncate mt-0.5">
            {proposal.contact_name || proposal.title || 'Unnamed Proposal'}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-sm font-semibold text-gray-900">{formatCurrency(proposal.total)}</div>
          <div className="text-xs text-gray-500">{proposal.days_old}d old</div>
        </div>
      </div>

      {savedStatus ? (
        <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
          <CheckCircle className="w-4 h-4" />
          Saved — {STATUS_OPTIONS.find(s => s.value === savedStatus)?.label}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleStatusClick(opt.value)}
                disabled={saving}
                className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-all ${opt.color} disabled:opacity-50`}
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin inline" /> : opt.label}
              </button>
            ))}
          </div>
          {!showFreeText && (
            <button
              onClick={() => setShowFreeText(true)}
              className="mt-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              + Add detail...
            </button>
          )}
          {showFreeText && (
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={freeText}
                onChange={e => setFreeText(e.target.value)}
                placeholder="Optional notes..."
                className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => setShowFreeText(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface TaskRowProps {
  task: OverdueTask;
  onCompleted: (taskId: string) => void;
}

function OverdueTaskRow({ task, onCompleted }: TaskRowProps) {
  const [completing, setCompleting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleComplete() {
    setCompleting(true);
    const { error } = await supabase
      .from('tasks')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', task.id);

    setCompleting(false);
    if (!error) {
      setDone(true);
      setTimeout(() => onCompleted(task.id), 500);
    }
  }

  if (done) return null;

  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-100 last:border-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate">{task.title}</div>
        <div className="text-xs text-gray-500">
          {task.contact_name && <span>{task.contact_name} · </span>}
          <span className="text-red-500">{task.days_overdue}d overdue</span>
        </div>
      </div>
      <button
        onClick={handleComplete}
        disabled={completing}
        className="flex-shrink-0 text-xs px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-lg font-medium transition-colors disabled:opacity-50"
      >
        {completing ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Mark Done'}
      </button>
    </div>
  );
}

interface WeeklyCheckInBannerProps {
  onNavigateToProposal?: (proposalId: string) => void;
}

export function WeeklyCheckInBanner({ onNavigateToProposal }: WeeklyCheckInBannerProps) {
  const { profile } = useAuth();
  const [staleProposals, setStaleProposals] = useState<StaleProposal[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<OverdueTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePanel, setActivePanel] = useState<'proposals' | 'tasks' | null>(null);

  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);

    const weekStart = getWeekStart(new Date());
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 14);
    const today = new Date().toISOString().split('T')[0];

    const [proposalsResult, notesResult, tasksResult] = await Promise.all([
      supabase
        .from('proposals')
        .select('id, proposal_number, title, status, total, created_at, contacts:contacts!proposals_contact_id_fkey(full_name)')
        .eq('created_by', profile.id)
        .eq('is_revision', false)
        .in('status', ['sent', 'viewed', 'approved_pending_action'])
        .lte('created_at', cutoffDate.toISOString()),

      supabase
        .from('proposal_weekly_notes')
        .select('proposal_id')
        .eq('rep_id', profile.id)
        .eq('week_start_date', weekStart),

      supabase
        .from('tasks')
        .select('id, title, due_date, status, contacts(full_name)')
        .eq('assigned_to', profile.id)
        .in('status', ['pending', 'in_progress'])
        .lt('due_date', today)
        .not('due_date', 'is', null),
    ]);

    if (proposalsResult.data) {
      const notedIds = new Set((notesResult.data || []).map((n: any) => n.proposal_id));
      const proposals: StaleProposal[] = proposalsResult.data.map((p: any) => {
        const daysOld = Math.floor((Date.now() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: p.id,
          proposal_number: p.proposal_number,
          title: p.title,
          status: p.status,
          total: p.total || 0,
          created_at: p.created_at,
          days_old: daysOld,
          contact_name: p.contacts?.full_name || null,
          has_note_this_week: notedIds.has(p.id),
        };
      }).filter((p: StaleProposal) => !p.has_note_this_week);
      setStaleProposals(proposals);
    }

    if (tasksResult.data) {
      const tasks: OverdueTask[] = tasksResult.data.map((t: any) => {
        const daysOverdue = Math.floor((Date.now() - new Date(t.due_date).getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: t.id,
          title: t.title,
          due_date: t.due_date,
          days_overdue: Math.max(0, daysOverdue),
          status: t.status,
          contact_name: t.contacts?.full_name || null,
        };
      });
      setOverdueTasks(tasks);
    }

    setLoading(false);
  }, [profile?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  function handleProposalSaved(proposalId: string) {
    setStaleProposals(prev => prev.filter(p => p.id !== proposalId));
    if (staleProposals.length <= 1) setActivePanel(null);
  }

  function handleTaskCompleted(taskId: string) {
    setOverdueTasks(prev => prev.filter(t => t.id !== taskId));
    if (overdueTasks.length <= 1) setActivePanel(null);
  }

  if (loading) return null;

  const proposalCount = staleProposals.length;
  const taskCount = overdueTasks.length;
  const allClear = proposalCount === 0 && taskCount === 0;

  if (allClear) {
    return (
      <div className="flex items-center gap-2.5 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm font-medium">
        <CheckCircle className="w-4 h-4 flex-shrink-0" />
        You're all caught up for the week — no stale proposals or overdue tasks.
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Banner Header */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2 text-gray-700 font-semibold text-sm">
          <ListChecks className="w-4 h-4 text-blue-500" />
          Weekly Check-In
        </div>
        <div className="flex gap-2 flex-1 flex-wrap">
          {proposalCount > 0 && (
            <button
              onClick={() => setActivePanel(activePanel === 'proposals' ? null : 'proposals')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                activePanel === 'proposals'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              {proposalCount} Proposal{proposalCount !== 1 ? 's' : ''} Need Updates
              {activePanel === 'proposals' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
          {taskCount > 0 && (
            <button
              onClick={() => setActivePanel(activePanel === 'tasks' ? null : 'tasks')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                activePanel === 'tasks'
                  ? 'bg-red-600 text-white border-red-600'
                  : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              {taskCount} Overdue Task{taskCount !== 1 ? 's' : ''}
              {activePanel === 'tasks' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>

      {/* Proposals Panel */}
      {activePanel === 'proposals' && (
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Tap a status to log your check-in — one tap and you're done.
            </p>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              14+ days old
            </span>
          </div>
          <div className="space-y-3">
            {staleProposals.map(proposal => (
              <ProposalCheckInCard
                key={proposal.id}
                proposal={proposal}
                onSaved={handleProposalSaved}
                onNavigate={onNavigateToProposal}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tasks Panel */}
      {activePanel === 'tasks' && (
        <div className="p-4">
          <p className="text-xs text-gray-500 mb-3">
            Overdue tasks assigned to you — mark done or navigate to the task for details.
          </p>
          <div className="bg-gray-50 rounded-lg px-3 py-1">
            {overdueTasks.map(task => (
              <OverdueTaskRow
                key={task.id}
                task={task}
                onCompleted={handleTaskCompleted}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
