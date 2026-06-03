import { useState, useEffect } from 'react';
import { FileText, CheckCircle, Clock, XCircle, ChevronRight, ArrowLeft } from 'lucide-react';
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

export function PortalProposals() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProposal, setSelectedProposal] = useState<string | null>(null);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [impersonatingName, setImpersonatingName] = useState<string | null>(null);

  useEffect(() => {
    loadProposals();
  }, []);

  useEffect(() => {
    // Check if there's a proposal ID in the URL path
    const path = window.location.pathname;
    const proposalIdMatch = path.match(/\/portal\/proposals\/([a-f0-9-]+)/i);
    if (proposalIdMatch && proposalIdMatch[1]) {
      setSelectedProposal(proposalIdMatch[1]);
    }

    // Handle browser back/forward buttons
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
      // Check for admin impersonation first
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
        // Normal portal user flow
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

      // Update last portal access
      await supabase.rpc('update_contact_portal_access', { p_contact_id: targetContactId });

      const { data, error } = await supabase
        .from('proposals')
        .select('id, proposal_number, title, status, total, created_at, valid_until, expires_at, renewal_count')
        .eq('contact_id', targetContactId)
        .eq('is_portal_visible', true)
        .in('status', ['sent', 'viewed', 'approved'])
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
          // Update URL when going back
          window.history.pushState({}, '', '/portal/proposals');
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading proposals...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {isImpersonating && (
        <div className="bg-purple-600 text-white px-4 py-2 text-center text-sm font-medium">
          Admin View: Viewing portal as {impersonatingName || 'customer'}
        </div>
      )}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-3">
            <a
              href="/portal"
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <ArrowLeft className="w-5 h-5 text-gray-400" />
            </a>
            <img
              src="/el_logo_color_(2).png"
              alt="Electronic Life"
              className="h-8 sm:h-10 object-contain flex-shrink-0"
            />
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">My Proposals</h1>
              <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">View and manage your proposals</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        {proposals.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Proposals Yet</h3>
            <p className="text-gray-600">
              You don't have any proposals at this time. Check back later or contact us if you're expecting one.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {proposals.map((proposal) => (
              <div
                key={proposal.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
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
            ))}
          </div>
        )}
      </main>
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
      className: 'bg-gray-100 text-gray-700',
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
      {renewalCount > 0 && ` (Renewed ${renewalCount}×)`}
    </span>
  );
}
