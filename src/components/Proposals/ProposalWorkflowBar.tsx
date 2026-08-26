import { useCallback, useEffect, useState } from 'react';
import { Activity, ChevronDown, Eye, FileText, Globe2, Lock, Settings, Unlock, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { PortalProposalDetail } from '../Portal/PortalProposalDetail';
import { ProposalActivityPanel } from './ProposalActivityPanel';
import ProposalTemplateManager from './ProposalTemplateManager';
import { UnlockProposalModal } from './UnlockProposalModal';

interface TemplateOption {
  id: string;
  name: string;
  is_default: boolean;
  is_personal: boolean;
}

interface ProposalState {
  id: string;
  proposal_number: string;
  status: string;
  report_template_id: string | null;
  is_portal_visible: boolean | null;
  is_locked: boolean | null;
  current_portal_version: number | null;
  sent_at: string | null;
}

export default function ProposalWorkflowBar({ proposalId }: { proposalId: string }) {
  const { profile } = useAuth();
  const [proposal, setProposal] = useState<ProposalState | null>(null);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [showUnlock, setShowUnlock] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [viewCount, setViewCount] = useState(0);
  const [questionCount, setQuestionCount] = useState(0);
  const [engagedSeconds, setEngagedSeconds] = useState(0);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    const [{ data: p }, { data: t }, { data: activity }] = await Promise.all([
      supabase
        .from('proposals')
        .select('id,proposal_number,status,report_template_id,is_portal_visible,is_locked,current_portal_version,sent_at')
        .eq('id', proposalId)
        .maybeSingle(),
      supabase
        .from('proposal_report_templates')
        .select('id,name,is_default,is_personal')
        .order('is_default', { ascending: false })
        .order('name'),
      supabase
        .from('proposal_activity')
        .select('activity_type,duration_seconds')
        .eq('proposal_id', proposalId),
    ]);

    if (p) setProposal(p as ProposalState);
    setTemplates((t || []) as TemplateOption[]);
    const rows = activity || [];
    setViewCount(rows.filter((r: any) => r.activity_type === 'viewed').length);
    setEngagedSeconds(rows.reduce((sum: number, r: any) => sum + Math.max(0, r.duration_seconds || 0), 0));

    const { data: thread } = await supabase
      .from('message_threads')
      .select('id')
      .eq('proposal_id', proposalId)
      .eq('context_type', 'proposal')
      .maybeSingle();
    if (thread) {
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('thread_id', thread.id)
        .eq('author_type', 'customer')
        .eq('is_internal', false);
      setQuestionCount(count || 0);
    } else {
      setQuestionCount(0);
    }
  }, [proposalId]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function selectTemplate(templateId: string) {
    setWorking(true);
    try {
      const { error } = await supabase
        .from('proposals')
        .update({ report_template_id: templateId })
        .eq('id', proposalId);
      if (error) throw error;
      setProposal(prev => prev ? { ...prev, report_template_id: templateId } : prev);
      setShowTemplateMenu(false);
    } finally {
      setWorking(false);
    }
  }

  async function lockProposal() {
    if (!proposal || working) return;
    setWorking(true);
    try {
      const { error } = await supabase
        .from('proposals')
        .update({
          is_locked: true,
          locked_at: new Date().toISOString(),
          locked_by: profile?.id || null,
        })
        .eq('id', proposalId);
      if (error) throw error;
      await load();
    } finally {
      setWorking(false);
    }
  }

  const selectedTemplate = templates.find(t => t.id === proposal?.report_template_id)
    || templates.find(t => t.is_default)
    || templates[0];
  const live = !!proposal?.is_portal_visible;
  const locked = !!proposal?.is_locked;
  const delivered = !!proposal?.sent_at || ['sent', 'portal', 'viewed', 'approved', 'expired'].includes(proposal?.status || '');

  function formatEngagement(seconds: number) {
    if (!seconds) return '';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.round(seconds / 60);
    return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  return (
    <>
      <div className="border-b border-gray-700 bg-gray-900 px-3 sm:px-4 py-2 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowPreview(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-xs font-semibold transition-colors"
          title="Preview exactly what the customer will see without publishing"
        >
          <Eye className="w-4 h-4" />
          Preview
        </button>

        <div className="relative">
          <button
            onClick={() => setShowTemplateMenu(v => !v)}
            disabled={working}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-600 bg-gray-800 hover:bg-gray-700 text-gray-100 px-3 py-1.5 text-xs font-medium transition-colors"
          >
            <FileText className="w-4 h-4 text-gray-400" />
            <span className="max-w-[180px] truncate">Template: {selectedTemplate?.name || 'Default'}</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          {showTemplateMenu && (
            <>
              <button className="fixed inset-0 z-40 cursor-default" onClick={() => setShowTemplateMenu(false)} aria-label="Close template menu" />
              <div className="absolute left-0 top-full z-50 mt-1 min-w-[260px] rounded-lg border border-gray-200 bg-white py-1 shadow-xl">
                {templates.map(t => (
                  <button
                    key={t.id}
                    onClick={() => selectTemplate(t.id)}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-blue-50 ${t.id === proposal?.report_template_id ? 'text-blue-700 font-semibold bg-blue-50/60' : 'text-gray-700'}`}
                  >
                    {t.name}{t.is_default ? ' · Company Default' : ''}{t.is_personal ? ' · Personal' : ''}
                  </button>
                ))}
                <div className="my-1 border-t border-gray-200" />
                <button
                  onClick={() => { setShowTemplateMenu(false); setShowTemplateManager(true); }}
                  className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                >
                  <Settings className="w-4 h-4" />
                  Customize / Manage Templates…
                </button>
              </div>
            </>
          )}
        </div>

        <div className="h-5 w-px bg-gray-700 hidden sm:block" />

        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${live ? 'border-green-500/30 bg-green-500/10 text-green-300' : delivered ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-gray-600 bg-gray-800 text-gray-400'}`}>
          <Globe2 className="w-3.5 h-3.5" />
          {live ? `LIVE ON PORTAL${proposal?.current_portal_version ? ` · v${proposal.current_portal_version}` : ''}` : delivered ? 'OFFLINE / DELIVERED' : 'DRAFT / OFFLINE'}
        </span>

        {locked ? (
          <button
            onClick={() => setShowUnlock(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-yellow-500/30 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/20 px-2.5 py-1 text-xs font-bold transition-colors"
            title="Unlocking a live proposal automatically takes it offline first"
          >
            <Lock className="w-3.5 h-3.5" />
            LOCKED
          </button>
        ) : (
          <button
            onClick={delivered ? lockProposal : undefined}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${delivered ? 'border-gray-500 bg-gray-800 text-gray-300 hover:bg-gray-700 cursor-pointer' : 'border-gray-700 bg-gray-900 text-gray-500 cursor-default'}`}
            title={delivered ? 'Lock this delivered proposal' : 'Draft proposals remain unlocked while you build them'}
          >
            <Unlock className="w-3.5 h-3.5" />
            UNLOCKED
          </button>
        )}

        {(live || viewCount > 0 || questionCount > 0) && (
          <button
            onClick={() => setShowActivity(true)}
            className="ml-auto inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 px-3 py-1.5 text-xs text-gray-200 transition-colors"
            title="Customer portal activity"
          >
            <Activity className="w-4 h-4 text-blue-400" />
            <span><strong className="text-white">{viewCount}</strong> views</span>
            {engagedSeconds > 0 && <span>· {formatEngagement(engagedSeconds)}</span>}
            <span>· <strong className="text-white">{questionCount}</strong> questions</span>
          </button>
        )}
      </div>

      {showPreview && (
        <div className="fixed inset-0 z-[80] bg-gray-900 flex flex-col">
          <div className="flex items-center gap-3 border-b border-gray-700 bg-gray-900 px-4 py-2 text-white">
            <button onClick={() => setShowPreview(false)} className="rounded-lg p-2 hover:bg-gray-800"><X className="w-5 h-5" /></button>
            <div>
              <div className="text-sm font-bold">Customer Preview</div>
              <div className="text-xs text-amber-300">Not live — the customer cannot see your edits in this preview.</div>
            </div>
            <div className="ml-auto text-xs text-gray-400">Template: {selectedTemplate?.name || 'Default'}</div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50">
            <PortalProposalDetail
              proposalId={proposalId}
              onBack={() => setShowPreview(false)}
              previewMode={true}
              templateOverrideId={proposal?.report_template_id ?? null}
            />
          </div>
        </div>
      )}

      {showTemplateManager && (
        <div className="fixed inset-0 z-[85] bg-black/60 p-4 overflow-y-auto">
          <div className="mx-auto max-w-6xl rounded-xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-3 rounded-t-xl">
              <div><h2 className="font-bold text-gray-900">Proposal Templates</h2><p className="text-xs text-gray-500">Customize an existing template, duplicate it, or save a personal/company template.</p></div>
              <button onClick={() => { setShowTemplateManager(false); load(); }} className="p-2 text-gray-500 hover:text-gray-900"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5"><ProposalTemplateManager /></div>
          </div>
        </div>
      )}

      {showActivity && (
        <div className="fixed inset-0 z-[85] bg-black/60 p-4 flex items-center justify-center">
          <div className="w-full max-w-4xl max-h-[88vh] overflow-hidden rounded-xl bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div><h2 className="font-bold text-gray-900">Customer Portal Activity</h2><p className="text-xs text-gray-500">Views, downloads, engagement and proposal-version history.</p></div>
              <button onClick={() => setShowActivity(false)} className="p-2 text-gray-500 hover:text-gray-900"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto p-5"><ProposalActivityPanel proposalId={proposalId} /></div>
          </div>
        </div>
      )}

      {showUnlock && proposal && (
        <UnlockProposalModal
          proposalNumber={proposal.proposal_number}
          onCreateRevision={() => {}}
          onUnlockAndEdit={async () => { await load(); setShowUnlock(false); }}
          onClose={() => setShowUnlock(false)}
        />
      )}
    </>
  );
}
