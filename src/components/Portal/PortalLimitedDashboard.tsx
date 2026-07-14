import { useState, useEffect } from 'react';
import { FileText, LogOut, Star, ArrowRight, Shield, Calendar, MessageSquare } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { VIPFeatureTeasers } from './VIPFeatureTeasers';

interface ProposalTile {
  id: string;
  proposal_number: string;
  title: string;
  status: string;
  total: number;
  created_at: string;
  expires_at: string | null;
}

export function PortalLimitedDashboard() {
  const [proposals, setProposals] = useState<ProposalTile[]>([]);
  const [loading, setLoading] = useState(true);
  const [contactName, setContactName] = useState('');
  const [contactId, setContactId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const impersonatingContactId = localStorage.getItem('admin_impersonating_contact');
      let targetContactId: string | null = null;

      if (impersonatingContactId) {
        targetContactId = impersonatingContactId;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

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

      // Update last portal access
      await supabase.rpc('update_contact_portal_access', { p_contact_id: targetContactId });

      // Load contact info
      const { data: contact } = await supabase
        .from('contacts')
        .select('first_name, last_name')
        .eq('id', targetContactId)
        .maybeSingle();

      if (contact) {
        setContactName(`${contact.first_name} ${contact.last_name}`.trim() || 'Customer');
      }

      // Load active proposals
      const { data: proposalsData } = await supabase
        .from('proposals')
        .select('id, proposal_number, title, status, total, created_at, expires_at')
        .eq('contact_id', targetContactId)
        .in('status', ['sent', 'viewed'])
        .order('created_at', { ascending: false });

      setProposals(proposalsData || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    const isImpersonating = localStorage.getItem('admin_impersonating_contact');

    if (isImpersonating) {
      localStorage.removeItem('admin_impersonating_contact');
      localStorage.removeItem('admin_impersonating_name');
      window.close();
    } else {
      await supabase.auth.signOut();
      window.location.href = '/portal';
    }
  }

  function handleProposalClick(proposalId: string) {
    window.location.href = `/portal/proposals/${proposalId}`;
  }

  function handleVIPSignup() {
    window.location.href = '/portal/vip-membership';
  }

  function handleContactUs() {
    window.location.href = '/portal/contact';
  }

  const isImpersonating = localStorage.getItem('admin_impersonating_contact');
  const impersonatingName = localStorage.getItem('admin_impersonating_name');

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your proposals...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      {isImpersonating && (
        <div className="bg-orange-600 text-white px-4 py-2 text-center text-sm font-medium">
          Admin View: Viewing limited portal as {impersonatingName || 'customer'}
        </div>
      )}

      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-4">
              <img
                src="/el_logo_color_(2).png"
                alt="Electronic Life"
                className="h-12 object-contain"
              />
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Customer Portal</h1>
                <p className="text-sm text-gray-600">Welcome back, {contactName}</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              {isImpersonating ? 'Exit Preview' : 'Sign Out'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Your Proposals Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Your Proposals</h2>
          </div>

          {proposals.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-12 text-center">
              <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Active Proposals</h3>
              <p className="text-gray-600 mb-6">
                You don't have any active proposals at this time. Contact us to get started!
              </p>
              <button
                onClick={handleContactUs}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
              >
                Contact Us
              </button>
            </div>
          ) : (
            <div className="grid gap-4">
              {proposals.map((proposal) => (
                <button
                  key={proposal.id}
                  onClick={() => handleProposalClick(proposal.id)}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-all text-left group"
                >
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <FileText className="w-6 h-6 text-blue-600" />
                        <span className="text-lg font-bold text-gray-900">
                          {proposal.proposal_number}
                        </span>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          proposal.status === 'sent' ? 'bg-yellow-100 text-yellow-700' :
                          proposal.status === 'viewed' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {proposal.status.charAt(0).toUpperCase() + proposal.status.slice(1)}
                        </span>
                      </div>
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">
                        {proposal.title || 'Untitled Proposal'}
                      </h3>
                      <div className="flex items-center gap-3 sm:gap-6 text-sm text-gray-600 flex-wrap">
                        <span className="font-semibold text-lg text-green-700">
                          ${proposal.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span>
                          Created {new Date(proposal.created_at).toLocaleDateString()}
                        </span>
                        {proposal.expires_at && (
                          <span className="text-orange-600 font-medium">
                            Expires {new Date(proposal.expires_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="w-6 h-6 text-gray-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Upgrade to VIP Section */}
        <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 rounded-2xl shadow-xl p-6 sm:p-8 text-white mb-8">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
            <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center flex-shrink-0">
              <Star className="w-8 h-8 text-yellow-300" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl sm:text-3xl font-bold mb-3">Unlock Full Portal Access</h2>
              <p className="text-blue-100 text-lg mb-6 leading-relaxed">
                Subscribe to our VIP Membership to access your full customer portal including project tracking,
                invoices, appointments, service history, and your personal punchlist system.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-yellow-300 flex-shrink-0 mt-1" />
                  <div>
                    <div className="font-semibold mb-1">Full Portal Access</div>
                    <div className="text-sm text-blue-100">View all your projects and invoices</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-yellow-300 flex-shrink-0 mt-1" />
                  <div>
                    <div className="font-semibold mb-1">Priority Scheduling</div>
                    <div className="text-sm text-blue-100">Book appointments online</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MessageSquare className="w-5 h-5 text-yellow-300 flex-shrink-0 mt-1" />
                  <div>
                    <div className="font-semibold mb-1">Direct Messaging</div>
                    <div className="text-sm text-blue-100">Chat with your service team</div>
                  </div>
                </div>
              </div>
              <button
                onClick={handleVIPSignup}
                className="px-8 py-4 bg-white text-blue-700 rounded-xl hover:bg-blue-50 transition-colors font-bold text-lg shadow-lg hover:shadow-xl inline-flex items-center gap-2 group"
              >
                View Membership Plans
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </div>

        {/* VIP Feature Teasers */}
        <div className="mb-8">
          <div className="mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Unlock These Premium Features</h2>
            <p className="text-gray-600">
              See what you're missing with VIP Membership. Get full access to manage your projects, invoices, and more!
            </p>
          </div>
          <VIPFeatureTeasers />
        </div>

        {/* Help Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Need Help?</h3>
          <p className="text-gray-600 mb-4">
            If you have any questions about your proposals or our services, we're here to help!
          </p>
          <button
            onClick={handleContactUs}
            className="px-6 py-2.5 bg-gray-100 text-gray-900 rounded-lg hover:bg-gray-200 transition-colors font-semibold"
          >
            Contact Us
          </button>
        </div>
      </main>
    </div>
  );
}
