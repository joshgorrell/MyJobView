import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  Users,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  AlertCircle,
  Loader2,
  FileText
} from 'lucide-react';

interface RepSummary {
  id: string;
  full_name: string;
  open_proposals: number;
  notes_this_week: number;
  missing: number;
}

interface StaleProposalForRep {
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

interface RepProposalCardProps {
  proposal: StaleProposalForRep;
  repId: string;
  onSaved: (proposalId: string) => void;
}

function RepProposalCard({ proposal, repId, onSaved }: RepProposalCardProps) {
  const { profile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [savedStatus, setSavedStatus] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  async function handleStatusClick(statusValue: string) {
    if (!profile?.id) return;
    setSaving(true);
    const weekStart = getWeekStart(new Date());

    const { error } = await supabase
      .from('proposal_weekly_notes')
      .upsert({
        proposal_id: proposal.id,
        rep_id: repId,
        created_by: profile.id,
        week_start_date: weekStart,
        status_note: statusValue,
        organization_id: profile.organization_id,
      }, { onConflict: 'proposal_id,rep_id,week_start_date' });

    setSaving(false);
    if (!error) {
      setSavedStatus(statusValue);
      setTimeout(() => {
        setDismissed(true);
        setTimeout(() => onSaved(proposal.id), 300);
      }, 700);
    }
  }

  if (dismissed) return null;

  return (
    <div className={`border border-gray-200 rounded-lg p-3 transition-all duration-300 ${savedStatus ? 'border-green-200 bg-green-50' : 'bg-white'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-gray-800">{proposal.proposal_number}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${getStatusBadgeColor(proposal.status)}`}>
              {formatStatus(proposal.status)}
            </span>
          </div>
          <div className="text-xs text-gray-500 truncate">{proposal.contact_name || proposal.title || '—'}</div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-xs font-semibold text-gray-800">{formatCurrency(proposal.total)}</div>
          <div className="text-xs text-gray-400">{proposal.days_old}d old</div>
        </div>
      </div>

      {savedStatus ? (
        <div className="flex items-center gap-1.5 text-green-700 text-xs font-medium">
          <CheckCircle className="w-3.5 h-3.5" />
          {STATUS_OPTIONS.find(s => s.value === savedStatus)?.label}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleStatusClick(opt.value)}
              disabled={saving}
              className={`text-xs px-2 py-1 rounded-md border font-medium transition-all ${opt.color} disabled:opacity-50`}
            >
              {saving ? <Loader2 className="w-2.5 h-2.5 animate-spin inline" /> : opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ManagerCheckInCompliance() {
  const { profile } = useAuth();
  const [repSummaries, setRepSummaries] = useState<RepSummary[]>([]);
  const [expandedRep, setExpandedRep] = useState<string | null>(null);
  const [repProposals, setRepProposals] = useState<Record<string, StaleProposalForRep[]>>({});
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [loadingRep, setLoadingRep] = useState<string | null>(null);

  const loadSummaries = useCallback(async () => {
    if (!profile?.id || !profile?.organization_id) return;
    setLoading(true);

    const weekStart = getWeekStart(new Date());
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 14);

    const [repsResult, proposalsResult, notesResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name')
        .eq('organization_id', profile.organization_id)
        .in('role', ['sales', 'manager'])
        .eq('is_active', true),

      supabase
        .from('proposals')
        .select('id, created_by')
        .eq('organization_id', profile.organization_id)
        .eq('is_revision', false)
        .in('status', ['sent', 'viewed', 'approved_pending_action'])
        .lte('created_at', cutoffDate.toISOString()),

      supabase
        .from('proposal_weekly_notes')
        .select('proposal_id, rep_id')
        .eq('organization_id', profile.organization_id)
        .eq('week_start_date', weekStart),
    ]);

    if (repsResult.data && proposalsResult.data) {
      const notedSet = new Set(
        (notesResult.data || []).map((n: any) => `${n.proposal_id}|${n.rep_id}`)
      );

      const summaries: RepSummary[] = repsResult.data.map((rep: any) => {
        const repProposals = proposalsResult.data.filter((p: any) => p.created_by === rep.id);
        const notesCount = repProposals.filter((p: any) => notedSet.has(`${p.id}|${rep.id}`)).length;
        return {
          id: rep.id,
          full_name: rep.full_name || 'Unknown',
          open_proposals: repProposals.length,
          notes_this_week: notesCount,
          missing: repProposals.length - notesCount,
        };
      }).filter((r: RepSummary) => r.open_proposals > 0);

      setRepSummaries(summaries);
    }

    setLoading(false);
  }, [profile?.id, profile?.organization_id]);

  useEffect(() => { loadSummaries(); }, [loadSummaries]);

  async function loadRepProposals(repId: string) {
    if (repProposals[repId]) return;
    setLoadingRep(repId);

    const weekStart = getWeekStart(new Date());
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 14);

    const [proposalsResult, notesResult] = await Promise.all([
      supabase
        .from('proposals')
        .select('id, proposal_number, title, status, total, created_at, contacts:contacts!proposals_contact_id_fkey(full_name)')
        .eq('created_by', repId)
        .eq('is_revision', false)
        .in('status', ['sent', 'viewed', 'approved_pending_action'])
        .lte('created_at', cutoffDate.toISOString()),

      supabase
        .from('proposal_weekly_notes')
        .select('proposal_id')
        .eq('rep_id', repId)
        .eq('week_start_date', weekStart),
    ]);

    if (proposalsResult.data) {
      const notedIds = new Set((notesResult.data || []).map((n: any) => n.proposal_id));
      const proposals: StaleProposalForRep[] = proposalsResult.data.map((p: any) => {
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
      });
      setRepProposals(prev => ({ ...prev, [repId]: proposals }));
    }

    setLoadingRep(null);
  }

  async function handleRepRowClick(repId: string) {
    if (expandedRep === repId) {
      setExpandedRep(null);
    } else {
      setExpandedRep(repId);
      await loadRepProposals(repId);
    }
  }

  function handleRepProposalSaved(repId: string, proposalId: string) {
    setRepProposals(prev => ({
      ...prev,
      [repId]: (prev[repId] || []).filter(p => p.id !== proposalId),
    }));
    setRepSummaries(prev =>
      prev.map(r =>
        r.id === repId
          ? { ...r, notes_this_week: r.notes_this_week + 1, missing: Math.max(0, r.missing - 1) }
          : r
      )
    );
  }

  if (!profile || !['admin', 'manager'].includes(profile.role)) return null;
  if (loading) return null;
  if (repSummaries.length === 0) return null;

  const totalMissing = repSummaries.reduce((sum, r) => sum + r.missing, 0);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Users className="w-4 h-4 text-gray-500" />
          Team Check-In Status
          {totalMissing > 0 && (
            <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full font-medium">
              {totalMissing} missing this week
            </span>
          )}
          {totalMissing === 0 && (
            <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">
              All caught up
            </span>
          )}
        </div>
        {collapsed ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
      </button>

      {!collapsed && (
        <div className="divide-y divide-gray-100">
          {repSummaries.map(rep => (
            <div key={rep.id}>
              <button
                onClick={() => handleRepRowClick(rep.id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900">{rep.full_name}</div>
                  <div className="text-xs text-gray-500">
                    {rep.open_proposals} open · {rep.notes_this_week} noted · {rep.missing} missing
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {rep.missing === 0 ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                      {rep.missing} missing
                    </span>
                  )}
                  {expandedRep === rep.id
                    ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                    : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                  }
                </div>
              </button>

              {expandedRep === rep.id && (
                <div className="px-4 pb-4 bg-gray-50 border-t border-gray-100">
                  {loadingRep === rep.id ? (
                    <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading proposals...
                    </div>
                  ) : repProposals[rep.id]?.length === 0 ? (
                    <div className="flex items-center gap-2 py-4 text-sm text-green-600">
                      <CheckCircle className="w-4 h-4" />
                      All proposals have been noted this week.
                    </div>
                  ) : (
                    <div className="pt-3 space-y-2">
                      {(repProposals[rep.id] || [])
                        .filter(p => !p.has_note_this_week)
                        .map(proposal => (
                          <RepProposalCard
                            key={proposal.id}
                            proposal={proposal}
                            repId={rep.id}
                            onSaved={(pid) => handleRepProposalSaved(rep.id, pid)}
                          />
                        ))
                      }
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
