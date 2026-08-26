import { useCallback, useEffect, useState } from 'react';
import { Activity, ChevronDown, Eye, FileText, Globe2, Lock, Send, Settings, Unlock, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { PortalProposalDetail } from '../Portal/PortalProposalDetail';
import { ProposalActivityPanel } from './ProposalActivityPanel';
import ProposalTemplateManager from './ProposalTemplateManager';
import { UnlockProposalModal } from './UnlockProposalModal';
import { DeliverProposalModal } from './DeliverProposalModal';

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
  const [showDeliver, setShowDeliver] = useState(false);
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
      const { error } = await supabase.from('proposals').update({ report_template_id: templateId }).eq('id', proposalId);
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
        .update({ is_locked: true, locked_at: new Date().toISOString(), locked_by: profile?.id || null })
        .eq('id', proposalId);
      if (error) throw error;
      await load();
    } finally {
      setWorking(false);
    }
  }

  const selectedTemplate = templates.find(t => t.id === proposal?.report_template_id) || templates.find(t => t.is_default) || templates[0];
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
      <div className="border-b border-gray-700 bg-gray-900 px-2.5 py-2 sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowPreview(true)}
            className="inline-flex h-9 flex-shrink-0 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
            title="Preview exactly what the customer will see without publishing"
          >
            <Eye className="h-4 w-4" />
            <span>Preview</span>
          </button>

          <div className="relative min-w-0 flex-1 sm:flex-none">
            <button
              onClick={() => setShowTemplateMenu(v => !v)}
              disabled={working}
              className="flex h-9 w-full min-w-0 items-center gap-1.5 rounded-lg border border-gray-600 bg-gray-800 px-2.5 text-xs font-medium text-gray-100 transition-colors hover:bg-gray-700 sm:w-auto sm:max-w-[260px]"
            >
              <FileText className="h-4 w-4 flex-shrink-0 text-gray-400" />
              <span className="min-w-0 flex-1 truncate text-left sm:flex-none">{selectedTemplate?.name || 'Default Template'}</span>
              <ChevronDown className="h-3 w-3 flex-shrink-0" />
            </button>
            {showTemplateMenu && (
              <>
                <button className="fixed inset-0 z-40 cursor-default" onClick={() => setShowTemplateMenu(false)} aria-label="Close template menu" />
                <div className="fixed left-2.5 right-2.5 top-auto z-50 mt-1 max-h-[65dvh] overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-2xl sm:absolute sm:left-0 sm:right-auto sm:min-w-[300px] sm:max-w-[360px]">
                  <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Proposal Template</div>
                  {templates.map(t => (
                    <button
                      key={t.id}
                      onClick={() => selectTemplate(t.id)}
                      className={`w-full px-3 py-2.5 text-left text-sm hover:bg-blue-50 ${t.id === proposal?.report_template_id ? 'bg-blue-50/60 font-semibold text-blue-700' : 'text-gray-700'}`}
                    >
                      <div className="truncate">{t.name}</div>
                      {(t.is_default || t.is_personal) && <div className="mt-0.5 text-[11px] font-normal text-gray-400">{t.is_default ? 'Company Default' : ''}{t.is_default && t.is_personal ? ' · ' : ''}{t.is_personal ? 'Personal' : ''}</div>}
                    </button>
                  ))}
                  <div className="my-1 border-t border-gray-200" />
                  <button
                    onClick={() => { setShowTemplateMenu(false); setShowTemplateManager(true); }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <Settings className="h-4 w-4" />
                    Customize / Manage Templates…
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => setShowDeliver(true)}
            className="order-2 inline-flex h-9 flex-shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white transition-colors hover:bg-emerald-700 sm:order-none"
            title="Email, publish to portal, create a PDF, or do any combination"
          >
            <Send className="h-4 w-4" />
            <span>Deliver</span>
          </button>

          <div className="hidden h-5 w-px bg-gray-700 md:block" />

          <div className="order-3 flex w-full flex-wrap items-center gap-2 sm:order-none sm:w-auto">
            <span className={`inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold sm:flex-none sm:text-xs ${live ? 'border-green-500/30 bg-green-500/10 text-green-300' : delivered ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-gray-600 bg-gray-800 text-gray-400'}`}>
              <Globe2 className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{live ? `LIVE${proposal?.current_portal_version ? ` · v${proposal.current_portal_version}` : ''}` : delivered ? 'OFFLINE / DELIVERED' : 'DRAFT / OFFLINE'}</span>
            </span>

            {locked ? (
              <button
                onClick={() => setShowUnlock(true)}
                className="inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-1 text-[11px] font-bold text-yellow-300 transition-colors hover:bg-yellow-500/20 sm:flex-none sm:text-xs"
                title="Unlocking a live proposal automatically takes it offline first"
              >
                <Lock className="h-3.5 w-3.5" /> LOCKED
              </button>
            ) : (
              <button
                onClick={delivered ? lockProposal : undefined}
                className={`inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold sm:flex-none sm:text-xs ${delivered ? 'cursor-pointer border-gray-500 bg-gray-800 text-gray-300 hover:bg-gray-700' : 'cursor-default border-gray-700 bg-gray-900 text-gray-500'}`}
                title={delivered ? 'Lock this delivered proposal' : 'Draft proposals remain unlocked while you build them'}
              >
                <Unlock className="h-3.5 w-3.5" /> UNLOCKED
              </button>
            )}
          </div>

          {(live || viewCount > 0 || questionCount > 0) && (
            <button
              onClick={() => setShowActivity(true)}
              className="order-4 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 text-xs text-gray-200 transition-colors hover:bg-gray-700 sm:order-none sm:ml-auto sm:w-auto"
              title="Customer portal activity"
            >
              <Activity className="h-4 w-4 flex-shrink-0 text-blue-400" />
              <span><strong className="text-white">{viewCount}</strong> views</span>
              {engagedSeconds > 0 && <span>· {formatEngagement(engagedSeconds)}</span>}
              <span>· <strong className="text-white">{questionCount}</strong> questions</span>
            </button>
          )}
        </div>
      </div>

      {showPreview && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-gray-900">
          <div className="flex flex-shrink-0 items-center gap-2 border-b border-gray-700 bg-gray-900 px-2.5 py-2 text-white sm:gap-3 sm:px-4">
            <button onClick={() => setShowPreview(false)} className="flex-shrink-0 rounded-lg p-2 hover:bg-gray-800"><X className="h-5 w-5" /></button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">Customer Preview</div>
              <div className="truncate text-[11px] text-amber-300 sm:text-xs">Draft preview — customer cannot see these edits.</div>
            </div>
            <div className="hidden max-w-[35vw] truncate text-xs text-gray-400 sm:block">Template: {selectedTemplate?.name || 'Default'}</div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50">
            <PortalProposalDetail proposalId={proposalId} onBack={() => setShowPreview(false)} previewMode={true} templateOverrideId={proposal?.report_template_id ?? null} />
          </div>
        </div>
      )}

      {showTemplateManager && (
        <div className="fixed inset-0 z-[85] overflow-y-auto bg-black/60 p-0 sm:p-4">
          <div className="mx-auto min-h-full w-full bg-white shadow-2xl sm:min-h-0 sm:max-w-6xl sm:rounded-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-white px-4 py-3 sm:rounded-t-xl sm:px-5">
              <div className="min-w-0"><h2 className="truncate font-bold text-gray-900">Proposal Templates</h2><p className="hidden text-xs text-gray-500 sm:block">Customize, duplicate, or save a personal/company template.</p></div>
              <button onClick={() => { setShowTemplateManager(false); load(); }} className="flex-shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-3 sm:p-5"><ProposalTemplateManager /></div>
          </div>
        </div>
      )}

      {showActivity && (
        <div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-w-4xl sm:rounded-xl">
            <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-5 sm:py-4">
              <div className="min-w-0"><h2 className="truncate font-bold text-gray-900">Customer Portal Activity</h2><p className="truncate text-xs text-gray-500">Views, downloads, engagement and proposal versions.</p></div>
              <button onClick={() => setShowActivity(false)} className="flex-shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"><X className="h-5 w-5" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5"><ProposalActivityPanel proposalId={proposalId} /></div>
          </div>
        </div>
      )}

      {showDeliver && proposal && (
        <DeliverProposalModal
          proposalId={proposal.id}
          templateId={proposal.report_template_id}
          onClose={() => setShowDeliver(false)}
          onDelivered={async () => { await load(); }}
        />
      )}

      {showUnlock && proposal && (
        <UnlockProposalModal
          proposalId={proposal.id}
          proposalNumber={proposal.proposal_number}
          onCreateRevision={() => {}}
          onUnlockAndEdit={async () => { await load(); setShowUnlock(false); }}
          onClose={() => setShowUnlock(false)}
        />
      )}
    </>
  );
}
