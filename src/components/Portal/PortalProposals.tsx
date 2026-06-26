import { useState, useEffect } from 'react';
import { FileText, CheckCircle, Clock, XCircle, ChevronRight, ArrowLeft, Send, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PortalProposalDetail } from './PortalProposalDetail';

interface Proposal {
  id: string;
  proposal_number: string;
  title: string;
  status: string;
  total: number;
  created_at: string;
  valid_until: string | null;
  expires_at: string | null;
  renewal_count: number;
}

interface RenewalModalProps {
  proposal: Proposal;
  contactId: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface PortalProposalsProps {
  isEmbedded?: boolean;
}

function isProposalExpired(proposal: Proposal): boolean {
  if (proposal.status === 'expired') return true;
  if (proposal.expires_at) {
    return new Date(proposal.expires_at) < new Date();
  }
  return false;
}

export function PortalProposals({ isEmbedded = false }: PortalProposalsProps = {}) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProposal, setSelectedProposal] = useState<string | null>(null);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [impersonatingName, setImpersonatingName] = useState<string | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [renewalTarget, setRenewalTarget] = useState<Proposal | null>(null);
  const [renewalSuccess, setRenewalSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadProposals();
  }, []);

  useEffect(() => {
    const path = window.location.pathname;
    const proposalIdMatch = path.match(/\/portal\/proposals\/([a-f0-9-]+)/i);
    if (proposalIdMatch && proposalIdMatch[1]) {
      setSelectedProposal(proposalIdMatch[1]);
    }

    const handlePopState = () => {
      const path = window.location.pathname;
      const proposalIdMatch = path.match(/\/portal\/proposals\/([a-f0-9-]+)/i);
      if (proposalIdMatch && proposalIdMatch[1]) {
        setSelectedProposal(proposalIdMatch[1]);
      } else {
        setSelectedProposal(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  async function loadProposals() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlContactId = urlParams.get('contact');
      const urlName = urlParams.get('name');

      const impersonatingContactId = localStorage.getItem('admin_impersonating_contact');
      const impersonatingNameStorage = localStorage.getItem('admin_impersonating_name');

      let targetContactId: string | null = null;

      if (urlContactId) {
        targetContactId = urlContactId;
        setIsImpersonating(true);
        setImpersonatingName(urlName || null);
      } else if (impersonatingContactId) {
        targetContactId = impersonatingContactId;
        setIsImpersonating(true);
        setImpersonatingName(impersonatingNameStorage || null);
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          const destination = window.location.pathname;
          window.location.href = `/portal?redirect=${encodeURIComponent(destination)}`;
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('contact_id')
          .eq('id', user.id)
          .maybeSingle();

        if (!profile?.contact_id) return;
        targetContactId = profile.contact_id;
      }

      if (!targetContactId) return;

      setContactId(targetContactId);

      await supabase.rpc('update_contact_portal_access', { p_contact_id: targetContactId });

      const { data, error } = await supabase
        .from('proposals')
        .select('id, proposal_number, title, status, total, created_at, valid_until, expires_at, renewal_count')
        .eq('contact_id', targetContactId)
        .eq('is_portal_visible', true)
        .in('status', ['sent', 'viewed', 'expired'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProposals(data || []);
    } catch (error) {
      console.error('Error loading proposals:', error);
    } finally {
      setLoading(false);
    }
  }

  if (selectedProposal) {
    return (
      <PortalProposalDetail
        proposalId={selectedProposal}
        onBack={() => {
          setSelectedProposal(null);
          window.history.pushState({}, '', '/portal/proposals');
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading proposals...</p>
        </div>
      </div>
    );
  }

  const activeProposals = proposals.filter(p => !isProposalExpired(p));
  const expiredProposals = proposals.filter(p => isProposalExpired(p));

  const renderProposalCard = (proposal: Proposal) => {
    const expired = isProposalExpired(proposal);

    const accentColors: Record<string, string> = {
      draft: 'bg-gray-400',
      sent: 'bg-blue-500',
      viewed: 'bg-cyan-500',
      approved: 'bg-green-500',
      declined: 'bg-red-500',
      expired: 'bg-gray-300',
    };
    const accent = expired ? 'bg-gray-300' : (accentColors[proposal.status] || 'bg-gray-400');

    if (expired) {
      return (
        <div
          key={proposal.id}
          className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden opacity-60 relative"
        >
          <div className={`absolute left-0 top-0 bottom-0 w-1 ${accent}`} />
          <div className="p-6 pl-7">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <h3 className="text-lg font-semibold text-gray-500">
                    {proposal.proposal_number}
                  </h3>
                  <StatusBadge status="expired" />
                </div>
                <p className="text-gray-400 mb-3">{proposal.title}</p>
                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
                  <span>Created: {new Date(proposal.created_at).toLocaleDateString()}</span>
                  {proposal.expires_at && (
                    <ExpirationBadge expiresAt={proposal.expires_at} renewalCount={proposal.renewal_count} />
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-4 flex-shrink-0">
                <div className="text-left sm:text-right">
                  <p className="text-sm text-gray-400">Total</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-400">
                    ${proposal.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100">
              {renewalSuccess === proposal.id ? (
                <p className="text-sm text-green-600 font-medium">
                  Your renewal request has been sent. We'll be in touch soon.
                </p>
              ) : (
                <p className="text-sm text-gray-500">
                  This proposal has expired.{' '}
                  <button
                    onClick={() => setRenewalTarget(proposal)}
                    className="text-blue-600 hover:text-blue-700 underline font-medium"
                  >
                    Click here if you'd like us to renew this proposal for you.
                  </button>
                </p>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        key={proposal.id}
        className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow relative"
      >
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${accent}`} />
        <div className="p-6 pl-7">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h3 className="text-lg font-semibold text-gray-900">
                  {proposal.proposal_number}
                </h3>
                <StatusBadge status={proposal.status} />
              </div>
              <p className="text-gray-600 mb-3">{proposal.title}</p>
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                <span>Created: {new Date(proposal.created_at).toLocaleDateString()}</span>
                {proposal.expires_at && (
                  <ExpirationBadge expiresAt={proposal.expires_at} renewalCount={proposal.renewal_count} />
                )}
              </div>
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-4 flex-shrink-0">
              <div className="text-left sm:text-right">
                <p className="text-sm text-gray-500">Total</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">
                  ${proposal.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedProposal(proposal.id);
                  window.history.pushState({}, '', `/portal/proposals/${proposal.id}`);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <ChevronRight className="w-6 h-6 text-gray-600" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const content = (
    <>
      {proposals.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Proposals Yet</h3>
          <p className="text-gray-600">
            You don't have any proposals at this time. Check back later or contact us if you're expecting one.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {activeProposals.length > 0 && (
            <div className="space-y-4">
              {expiredProposals.length > 0 && (
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Active</h3>
              )}
              {activeProposals.map(renderProposalCard)}
            </div>
          )}

          {expiredProposals.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Expired</h3>
              {expiredProposals.map(renderProposalCard)}
            </div>
          )}
        </div>
      )}

      {renewalTarget && contactId && (
        <RenewalModal
          proposal={renewalTarget}
          contactId={contactId}
          onClose={() => setRenewalTarget(null)}
          onSuccess={() => {
            setRenewalSuccess(renewalTarget.id);
            setRenewalTarget(null);
          }}
        />
      )}
    </>
  );

  if (isEmbedded) {
    return (
      <div>
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900">My Proposals</h2>
          <p className="text-sm text-gray-500 mt-0.5">View and manage your proposals</p>
        </div>
        {content}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {isImpersonating && (
        <div className="bg-amber-500 text-white px-4 py-2 text-center text-sm font-medium">
          Admin View: Viewing portal as {impersonatingName || 'customer'}
        </div>
      )}
      <header className="bg-[#0f2347] text-white shadow-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 sm:h-20 gap-3">
            <a
              href="/portal"
              className="flex items-center gap-1.5 px-3 py-2 text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors min-h-[44px]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline text-sm font-medium">Dashboard</span>
            </a>
            <img
              src="/el_logo_color_(2).png"
              alt="Electronic Life"
              className="h-8 sm:h-10 object-contain flex-shrink-0"
            />
            <div className="hidden sm:block border-l border-white/20 pl-4">
              <p className="text-white font-semibold text-sm leading-tight">My Proposals</p>
              <p className="text-blue-300 text-xs">View and manage your proposals</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        {content}
      </main>
    </div>
  );
}

function RenewalModal({ proposal, contactId, onClose, onSuccess }: RenewalModalProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    if (!message.trim()) {
      setError('Please enter a message before sending.');
      return;
    }

    setSending(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const authorId = user?.id || contactId;

      const { data: thread, error: threadError } = await supabase
        .from('message_threads')
        .insert({
          contact_id: contactId,
          context_type: 'proposal',
          context_id: proposal.id,
          subject: `Renewal Request: ${proposal.proposal_number}`,
          visibility: 'internal',
          last_message_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (threadError) throw threadError;

      const { error: msgError } = await supabase
        .from('messages')
        .insert({
          thread_id: thread.id,
          author_id: authorId,
          author_name: 'Customer',
          author_type: 'customer',
          body: message.trim(),
        });

      if (msgError) throw msgError;

      onSuccess();
    } catch (err) {
      console.error('Error sending renewal request:', err);
      setError('Failed to send your request. Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Request Proposal Renewal</h2>
            <p className="text-sm text-gray-500 mt-0.5">{proposal.proposal_number} — {proposal.title}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">
            Let us know if there's anything specific you'd like updated, or just send a quick note — we'll get back to you shortly.
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Message to your representative
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. I'd like to move forward with this — can you refresh the pricing and extend the validity?"
              rows={4}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !message.trim()}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {sending ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send Request
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs = {
    draft: {
      icon: <Clock className="w-4 h-4" />,
      label: 'Draft',
      className: 'bg-gray-100 text-gray-700',
    },
    sent: {
      icon: <Clock className="w-4 h-4" />,
      label: 'Awaiting Review',
      className: 'bg-blue-100 text-blue-700',
    },
    viewed: {
      icon: <Clock className="w-4 h-4" />,
      label: 'In Review',
      className: 'bg-cyan-100 text-cyan-700',
    },
    approved: {
      icon: <CheckCircle className="w-4 h-4" />,
      label: 'Approved',
      className: 'bg-green-100 text-green-700',
    },
    declined: {
      icon: <XCircle className="w-4 h-4" />,
      label: 'Declined',
      className: 'bg-red-100 text-red-700',
    },
    expired: {
      icon: <XCircle className="w-4 h-4" />,
      label: 'Expired',
      className: 'bg-gray-100 text-gray-600',
    },
  };

  const config = configs[status as keyof typeof configs] || configs.draft;

  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${config.className}`}>
      {config.icon}
      {config.label}
    </span>
  );
}

function ExpirationBadge({ expiresAt, renewalCount }: { expiresAt: string; renewalCount: number }) {
  const expirationDate = new Date(expiresAt);
  const now = new Date();
  const daysUntilExpiration = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const isExpired = expirationDate < now;

  if (isExpired) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-100 text-red-700 text-xs font-medium">
        <Clock className="w-3 h-3" />
        Expired on {expirationDate.toLocaleDateString()}
      </span>
    );
  }

  const colorClass = daysUntilExpiration <= 7 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700';

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded ${colorClass} text-xs font-medium`}>
      <Clock className="w-3 h-3" />
      {daysUntilExpiration} day{daysUntilExpiration !== 1 ? 's' : ''} remaining
      {renewalCount > 0 && ` (Renewed ${renewalCount}x)`}
    </span>
  );
}
