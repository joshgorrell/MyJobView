import { useState, useEffect } from 'react';
import { FileText, Briefcase, Calendar, DollarSign, MessageSquare, LogOut, Shield, XCircle, ClipboardList, Star, ArrowLeft, ChevronRight, CheckSquare, Receipt, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ContractCancellationForm } from './ContractCancellationForm';
import { TrialStatusBanner } from './TrialStatusBanner';
import { TestAndTuneWelcomeModal } from './TestAndTuneWelcomeModal';
import { PortalLimitedDashboard } from './PortalLimitedDashboard';
import { PortalProposals } from './PortalProposals';
import { PortalProjects } from './PortalProjects';
import PortalAppointments from './PortalAppointments';
import { PortalInvoices } from './PortalInvoices';
import PortalMessages from './PortalMessages';
import { PortalVIPServices } from './PortalVIPServices';
import { PortalPunchlist } from './PortalPunchlist';
import { PortalSalesOrders } from './PortalSalesOrders';

interface DashboardStats {
  activeProposals: number;
  activeProjects: number;
  upcomingAppointments: number;
  unpaidInvoices: number;
  unreadMessages: number;
  vipWorkOrders: number;
  punchlistTasks: number;
  activeSalesOrders: number;
}

interface TrialAccess {
  accessType: string;
  daysRemaining: number;
  expirationDate: string;
  isExpiringSoon: boolean;
}

interface PortalModuleSettings {
  portal_proposals_enabled: boolean;
  portal_projects_enabled: boolean;
  portal_appointments_enabled: boolean;
  portal_invoices_enabled: boolean;
  portal_messages_enabled: boolean;
  portal_vip_services_enabled: boolean;
  portal_tasks_enabled: boolean;
  portal_sales_orders_enabled: boolean;
}

interface PortalDashboardProps {
  defaultModule?: 'dashboard' | 'proposals' | 'projects' | 'appointments' | 'invoices' | 'messages' | 'vip' | 'punchlist' | 'sales-orders';
}

export function PortalDashboard({ defaultModule = 'dashboard' }: PortalDashboardProps = {}) {
  const [currentView, setCurrentView] = useState<string>(defaultModule);
  const [stats, setStats] = useState<DashboardStats>({
    activeProposals: 0,
    activeProjects: 0,
    upcomingAppointments: 0,
    unpaidInvoices: 0,
    unreadMessages: 0,
    vipWorkOrders: 0,
    punchlistTasks: 0,
    activeSalesOrders: 0,
  });
  const [loading, setLoading] = useState(true);
  const [contactName, setContactName] = useState('');
  const [trialAccess, setTrialAccess] = useState<TrialAccess | null>(null);
  const [hasVipMembership, setHasVipMembership] = useState(false);
  const [vipSubscription, setVipSubscription] = useState<{
    status: string;
    plan_name: string;
    billing_frequency: string;
    amount: number;
    next_billing_date: string;
    trial_end_date: string | null;
  } | null>(null);
  const [showCancellationForm, setShowCancellationForm] = useState(false);
  const [contactId, setContactId] = useState<string | null>(null);
  const [hasActiveContract, setHasActiveContract] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [portalAccessLevel, setPortalAccessLevel] = useState<string | null>(null);
  const [billingPreference, setBillingPreference] = useState<'monthly' | 'annual'>('monthly');
  const [billingConfig, setBillingConfig] = useState<any>(null);
  const [activeSubscriptions, setActiveSubscriptions] = useState<any[]>([]);
  const [showBillingChangeConfirm, setShowBillingChangeConfirm] = useState(false);
  const [pendingBillingPref, setPendingBillingPref] = useState<'monthly' | 'annual' | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [moduleSettings, setModuleSettings] = useState<PortalModuleSettings>({
    portal_proposals_enabled: false,
    portal_projects_enabled: false,
    portal_appointments_enabled: false,
    portal_invoices_enabled: false,
    portal_messages_enabled: false,
    portal_vip_services_enabled: false,
    portal_tasks_enabled: true,
    portal_sales_orders_enabled: false,
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  useEffect(() => {
    if (!contactId) return;

    const refreshPunchlistCount = async () => {
      const { count } = await supabase
        .from('punchlist_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', contactId)
        .in('status', ['draft', 'requested', 'scheduled']);

      setStats(prev => ({ ...prev, punchlistTasks: count || 0 }));
    };

    const subscription = supabase
      .channel(`portal_dashboard_punchlist_${contactId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'punchlist_tasks',
          filter: `contact_id=eq.${contactId}`,
        },
        () => {
          refreshPunchlistCount();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [contactId]);

  async function loadDashboardData() {
    try {
      const impersonatingContactId = localStorage.getItem('admin_impersonating_contact');
      let contactId: string | null = null;

      if (impersonatingContactId) {
        contactId = impersonatingContactId;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('contact_id')
          .eq('id', user.id)
          .maybeSingle();

        if (!profile?.contact_id) return;
        contactId = profile.contact_id;
      }

      if (!contactId) return;

      setContactId(contactId);

      const { data: accessLevel, error: accessError } = await supabase
        .rpc('get_contact_portal_access_level', { p_contact_id: contactId });

      if (!accessError && accessLevel) {
        setPortalAccessLevel(accessLevel);
        if (accessLevel === 'proposal_only') return;
      }

      await supabase.rpc('update_contact_portal_access', { p_contact_id: contactId });

      const { data: contact } = await supabase
        .from('contacts')
        .select('first_name, last_name')
        .eq('id', contactId)
        .maybeSingle();

      if (contact) {
        setContactName(`${contact.first_name} ${contact.last_name}`.trim() || 'Customer');
      }

      const { data: activeContracts } = await supabase
        .from('security_contracts')
        .select('id')
        .eq('contact_id', contactId)
        .eq('status', 'active')
        .limit(1);

      setHasActiveContract((activeContracts?.length || 0) > 0);

      const { data: portalSettings } = await supabase
        .from('company_settings')
        .select('portal_proposals_enabled, portal_projects_enabled, portal_appointments_enabled, portal_invoices_enabled, portal_messages_enabled, portal_vip_services_enabled, portal_tasks_enabled, portal_sales_orders_enabled')
        .limit(1)
        .maybeSingle();

      if (portalSettings) {
        setModuleSettings(portalSettings);
      }

      const { data: accessGrant } = await supabase
        .from('punchlist_access_grants')
        .select('access_type, expiration_date')
        .eq('contact_id', contactId)
        .eq('status', 'active')
        .eq('access_type', 'test_and_tune')
        .gte('expiration_date', new Date().toISOString().split('T')[0])
        .maybeSingle();

      if (accessGrant && accessGrant.expiration_date) {
        const expirationDate = new Date(accessGrant.expiration_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const daysRemaining = Math.ceil((expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        setTrialAccess({
          accessType: accessGrant.access_type,
          daysRemaining,
          expirationDate: accessGrant.expiration_date,
          isExpiringSoon: daysRemaining <= 14
        });

        const isImpersonatingNow = localStorage.getItem('admin_impersonating_contact');
        const hasSeenWelcome = localStorage.getItem(`test_tune_welcome_${contactId}`);
        if (!hasSeenWelcome && !isImpersonatingNow) {
          setShowWelcomeModal(true);
          localStorage.setItem(`test_tune_welcome_${contactId}`, 'true');
        }
      }

      const { data: vipSub } = await supabase
        .from('recurring_subscriptions')
        .select(`
          status,
          next_billing_date,
          trial_end_date,
          plan:recurring_plans(plan_name, billing_frequency, amount)
        `)
        .eq('contact_id', contactId)
        .in('status', ['active', 'trial'])
        .maybeSingle();
      setHasVipMembership(!!vipSub);
      if (vipSub) {
        const plan = Array.isArray(vipSub.plan) ? vipSub.plan[0] : vipSub.plan;
        setVipSubscription({
          status: vipSub.status,
          plan_name: plan?.plan_name || 'VIP',
          billing_frequency: plan?.billing_frequency || '',
          amount: plan?.amount || 0,
          next_billing_date: vipSub.next_billing_date,
          trial_end_date: vipSub.trial_end_date,
        });
      } else {
        setVipSubscription(null);
      }

      // Load billing preference and config
      const { data: billingSettings } = await supabase
        .from('company_settings')
        .select('annual_billing_enabled, default_billing_preference, annual_discount_type, annual_discount_percentage, annual_discount_flat_amount, customer_can_change_billing_preference')
        .maybeSingle();
      if (billingSettings) setBillingConfig(billingSettings);

      const { data: prefData } = await supabase
        .from('customer_billing_preferences')
        .select('billing_preference')
        .eq('contact_id', contactId)
        .maybeSingle();
      setBillingPreference(prefData?.billing_preference || billingSettings?.default_billing_preference || 'monthly');

      // Load all active recurring subscriptions for this contact
      const { data: subs } = await supabase
        .from('recurring_subscriptions')
        .select(`
          id, next_billing_date, status, custom_amount,
          plan:recurring_plans(plan_name, billing_frequency, amount)
        `)
        .eq('contact_id', contactId)
        .eq('status', 'active');
      setActiveSubscriptions(subs || []);

      const [proposalsRes, projectsRes, appointmentsRes, invoicesRes, messagesRes, vipWorkOrdersRes, punchlistRes, salesOrdersRes] = await Promise.all([
        supabase.from('proposals').select('id', { count: 'exact', head: true }).eq('contact_id', contactId).in('status', ['sent', 'viewed']),
        supabase.from('projects').select('id', { count: 'exact', head: true }).eq('customer_id', contactId).in('status', ['planning', 'active']),
        supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('contact_id', contactId).gte('appointment_date', new Date().toISOString().split('T')[0]).in('status', ['scheduled', 'in_progress']),
        supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('contact_id', contactId).in('status', ['sent', 'partial', 'overdue']),
        supabase.from('message_threads').select('id', { count: 'exact', head: true }).eq('contact_id', contactId).eq('is_internal', false),
        supabase.from('work_orders').select('id', { count: 'exact', head: true }).eq('contact_id', contactId).eq('type', 'vip_program').gte('start_date', new Date().toISOString().split('T')[0]).in('status', ['scheduled', 'in_progress']),
        supabase.from('punchlist_tasks').select('id', { count: 'exact', head: true }).eq('contact_id', contactId).in('status', ['draft', 'requested', 'scheduled']),
        supabase.from('sales_orders').select('id', { count: 'exact', head: true }).eq('contact_id', contactId),
      ]);

      setStats({
        activeProposals: proposalsRes.count || 0,
        activeProjects: projectsRes.count || 0,
        upcomingAppointments: appointmentsRes.count || 0,
        unpaidInvoices: invoicesRes.count || 0,
        unreadMessages: messagesRes.count || 0,
        vipWorkOrders: vipWorkOrdersRes.count || 0,
        punchlistTasks: punchlistRes.count || 0,
        activeSalesOrders: salesOrdersRes.count || 0,
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
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

  const isImpersonating = localStorage.getItem('admin_impersonating_contact');
  const impersonatingName = localStorage.getItem('admin_impersonating_name');

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-5"></div>
          <img src="/el_logo_color_(2).png" alt="Electronic Life" className="h-10 object-contain mx-auto mb-3 opacity-60" />
          <p className="text-gray-500 text-sm font-medium">Loading your portal...</p>
        </div>
      </div>
    );
  }

  if (portalAccessLevel === 'proposal_only') {
    return <PortalLimitedDashboard />;
  }

  const PortalHeader = ({ showBack = false }: { showBack?: boolean }) => (
    <>
      {isImpersonating && (
        <div className="bg-amber-500 text-white px-4 py-2 text-center text-sm font-medium">
          Admin Preview: Viewing portal as {impersonatingName || 'customer'}
        </div>
      )}
      <header className="bg-[#0f2347] text-white shadow-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20">
            <div className="flex items-center gap-3 sm:gap-4">
              {showBack && (
                <button
                  onClick={() => setCurrentView('dashboard')}
                  className="flex items-center gap-1.5 px-3 py-2 text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors min-h-[44px]"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span className="hidden sm:inline text-sm font-medium">Dashboard</span>
                </button>
              )}
              <img
                src="/el_logo_color_(2).png"
                alt="Electronic Life"
                className="h-8 sm:h-10 object-contain"
              />
              <div className="hidden sm:block border-l border-white/20 pl-4">
                <p className="text-white font-semibold text-sm leading-tight">Customer Portal</p>
                <p className="text-blue-300 text-xs">{contactName || 'Welcome back'}</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-sm font-medium min-h-[44px]"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">{isImpersonating ? 'Exit Preview' : 'Sign Out'}</span>
            </button>
          </div>
        </div>
      </header>
    </>
  );

  if (currentView !== 'dashboard') {
    return (
      <div className="min-h-screen bg-gray-50">
        <PortalHeader showBack />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {currentView === 'proposals' && <PortalProposals isEmbedded />}
          {currentView === 'projects' && <PortalProjects isEmbedded />}
          {currentView === 'appointments' && <PortalAppointments />}
          {currentView === 'invoices' && <PortalInvoices isEmbedded />}
          {currentView === 'messages' && <PortalMessages />}
          {currentView === 'vip' && <PortalVIPServices isEmbedded />}
          {currentView === 'punchlist' && <PortalPunchlist isEmbedded />}
          {currentView === 'sales-orders' && <PortalSalesOrders isEmbedded />}
        </main>
      </div>
    );
  }

  const firstName = contactName.split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-24 sm:pb-10">
        {trialAccess && (
          <div className="mb-6">
            <TrialStatusBanner
              daysRemaining={trialAccess.daysRemaining}
              expirationDate={trialAccess.expirationDate}
              showDetails={true}
              compact={false}
            />
          </div>
        )}

        <div className="mb-6 sm:mb-8">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{greeting}, {firstName}!</h2>
          <p className="text-gray-500 text-sm mt-1">Here's an overview of your account.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {moduleSettings.portal_proposals_enabled && (
            <DashboardTile
              icon={<FileText className="w-5 h-5" />}
              title="Proposals"
              count={stats.activeProposals}
              description="Active proposals awaiting your review"
              color="blue"
              onClick={() => setCurrentView('proposals')}
            />
          )}

          {moduleSettings.portal_sales_orders_enabled && (
            <DashboardTile
              icon={<CheckSquare className="w-5 h-5" />}
              title="Projects"
              count={stats.activeSalesOrders}
              description="Your approved Projects"
              color="teal"
              onClick={() => setCurrentView('sales-orders')}
            />
          )}

          {moduleSettings.portal_projects_enabled && (
            <DashboardTile
              icon={<Briefcase className="w-5 h-5" />}
              title="Projects"
              count={stats.activeProjects}
              description="Active projects in progress"
              color="green"
              onClick={() => setCurrentView('projects')}
            />
          )}

          {moduleSettings.portal_appointments_enabled && (
            <DashboardTile
              icon={<Calendar className="w-5 h-5" />}
              title="Appointments"
              count={stats.upcomingAppointments}
              description="Upcoming scheduled appointments"
              color="teal"
              onClick={() => setCurrentView('appointments')}
            />
          )}

          {moduleSettings.portal_invoices_enabled && (
            <DashboardTile
              icon={<DollarSign className="w-5 h-5" />}
              title="Invoices"
              count={stats.unpaidInvoices}
              description="Invoices requiring payment"
              color="orange"
              onClick={() => setCurrentView('invoices')}
            />
          )}

          {moduleSettings.portal_messages_enabled && (
            <DashboardTile
              icon={<MessageSquare className="w-5 h-5" />}
              title="Messages"
              count={stats.unreadMessages}
              description="Active message threads"
              color="cyan"
              onClick={() => setCurrentView('messages')}
            />
          )}

          {moduleSettings.portal_vip_services_enabled && stats.vipWorkOrders > 0 && (
            <DashboardTile
              icon={<Shield className="w-5 h-5" />}
              title="VIP Services"
              count={stats.vipWorkOrders}
              description="Upcoming VIP service appointments"
              color="navy"
              onClick={() => setCurrentView('vip')}
            />
          )}

          {moduleSettings.portal_tasks_enabled && (
            <DashboardTile
              icon={<ClipboardList className="w-5 h-5" />}
              title="My Punchlist"
              count={stats.punchlistTasks}
              description="Track your service items"
              color="amber"
              onClick={() => setCurrentView('punchlist')}
              badge={trialAccess ? <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" /> : undefined}
            />
          )}
        </div>

        {/* Membership Status — visible to all authenticated portal users */}
        <div className="mt-6">
          {vipSubscription ? (
            <div className={`rounded-2xl border p-5 sm:p-6 shadow-sm ${
              vipSubscription.status === 'trial'
                ? 'bg-blue-50 border-blue-200'
                : 'bg-gradient-to-r from-yellow-50 to-amber-50 border-amber-200'
            }`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    vipSubscription.status === 'trial' ? 'bg-blue-100' : 'bg-amber-100'
                  }`}>
                    <Star className={`w-5 h-5 ${vipSubscription.status === 'trial' ? 'text-blue-600' : 'text-amber-600 fill-amber-500'}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-bold text-gray-900">
                        {vipSubscription.status === 'trial' ? 'VIP Trial Active' : vipSubscription.plan_name}
                      </span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        vipSubscription.status === 'trial'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {vipSubscription.status === 'trial' ? 'Free Trial' : 'Active'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {vipSubscription.status === 'trial' && vipSubscription.trial_end_date
                        ? (() => {
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            const end = new Date(vipSubscription.trial_end_date);
                            end.setHours(0, 0, 0, 0);
                            const days = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                            return `${days} day${days !== 1 ? 's' : ''} remaining — expires ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
                          })()
                        : `Renews ${new Date(vipSubscription.next_billing_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · $${vipSubscription.amount}/${vipSubscription.billing_frequency === 'yearly' ? 'yr' : vipSubscription.billing_frequency === 'monthly' ? 'mo' : vipSubscription.billing_frequency}`
                      }
                    </p>
                  </div>
                </div>
                <a
                  href="/portal/vip-membership"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl transition-colors flex-shrink-0 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                >
                  Manage Membership
                  <ChevronRight className="w-4 h-4" />
                </a>
              </div>
            </div>
          ) : !trialAccess ? (
            <div className="relative overflow-hidden bg-gradient-to-br from-[#0f2347] to-[#1a3a6e] rounded-2xl p-6 sm:p-7 shadow-lg border border-[#1a3a6e]">
              <div className="absolute top-0 right-0 w-40 h-40 bg-yellow-400/10 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none hidden sm:block" />
              <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-5">
                <div className="w-12 h-12 bg-yellow-400/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Star className="w-6 h-6 text-yellow-400 fill-yellow-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-bold text-base mb-1">Upgrade to VIP Membership</div>
                  <p className="text-blue-200 text-sm leading-relaxed">Priority scheduling, unlimited punchlist access, regular maintenance visits, and dedicated support — all for one flat rate.</p>
                </div>
                <a
                  href="/portal/vip-membership"
                  className="flex-shrink-0 inline-flex items-center gap-2 px-5 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-white font-bold rounded-xl transition-colors shadow text-sm"
                >
                  View Plans
                  <ChevronRight className="w-4 h-4" />
                </a>
              </div>
            </div>
          ) : null}
        </div>

        {hasActiveContract && (          <div className="mt-6 bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <XCircle className="w-5 h-5 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-gray-900 mb-1">Cancel Security Monitoring?</h3>
                <p className="text-gray-500 text-sm mb-4 leading-relaxed">
                  If you need to cancel your security monitoring contract, you can submit a cancellation request here. Our team will review and follow up with next steps.
                </p>
                <button
                  onClick={() => setShowCancellationForm(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 font-semibold rounded-xl transition-colors border border-red-200 text-sm"
                >
                  Request Cancellation
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Billing Preference Card */}
        {activeSubscriptions.length > 0 && (
          <div className="mt-5 bg-white border border-gray-200 rounded-2xl p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <Receipt className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-gray-900 mb-1">Billing Preference</h3>
                <p className="text-gray-500 text-sm mb-4">
                  Your billing preference applies to all eligible recurring services on your account.
                </p>

                <div className="flex items-center gap-3 mb-4">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
                    billingPreference === 'annual'
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                  }`}>
                    <div className={`w-2 h-2 rounded-full ${billingPreference === 'annual' ? 'bg-green-500' : 'bg-blue-500'}`} />
                    {billingPreference === 'annual' ? 'Annual Billing' : 'Monthly Billing'}
                  </span>
                </div>

                {/* Active subscriptions breakdown */}
                <div className="space-y-2 mb-4">
                  {activeSubscriptions.map((sub: any) => (
                    <div key={sub.id} className="flex items-center justify-between text-sm border-b border-gray-100 pb-2 last:border-0">
                      <span className="text-gray-700">{sub.plan?.plan_name || 'Recurring Service'}</span>
                      <span className="text-gray-900 font-medium">
                        {formatCurrency(sub.custom_amount || sub.plan?.amount || 0)}
                        {billingPreference === 'annual' ? '/yr' : '/mo'}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Change preference button */}
                {billingConfig?.annual_billing_enabled && billingConfig?.customer_can_change_billing_preference && (
                  <button
                    onClick={() => {
                      setPendingBillingPref(billingPreference === 'monthly' ? 'annual' : 'monthly');
                      setShowBillingChangeConfirm(true);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors text-sm"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Switch to {billingPreference === 'monthly' ? 'Annual' : 'Monthly'} Billing
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Billing Change Confirmation Modal */}
        {showBillingChangeConfirm && pendingBillingPref && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Change Billing Preference?</h3>
              <p className="text-sm text-gray-600 mb-4">
                You are about to switch from{' '}
                <strong>{billingPreference === 'monthly' ? 'Monthly' : 'Annual'}</strong> to{' '}
                <strong>{pendingBillingPref === 'monthly' ? 'Monthly' : 'Annual'}</strong> billing.
              </p>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4">
                <p className="text-sm text-blue-800">
                  This change will take effect on your next billing cycle. Your agreement terms, renewal dates,
                  and coverage will not be affected.
                </p>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => { setShowBillingChangeConfirm(false); setPendingBillingPref(null); }}
                  className="px-4 py-2 text-gray-600 font-medium rounded-xl hover:bg-gray-100 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setBillingLoading(true);
                    const { data: { user } } = await supabase.auth.getUser();
                    const { error } = await supabase.rpc('update_customer_billing_preference', {
                      p_contact_id: contactId,
                      p_new_preference: pendingBillingPref,
                      p_reason: 'Changed by customer via portal',
                      p_changed_by: user?.id || null,
                      p_changed_by_name: user?.email || null
                    });
                    setBillingLoading(false);
                    if (!error) {
                      setBillingPreference(pendingBillingPref);
                      setShowBillingChangeConfirm(false);
                      setPendingBillingPref(null);
                    }
                  }}
                  disabled={billingLoading}
                  className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 text-sm"
                >
                  {billingLoading ? 'Saving...' : 'Confirm Change'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-5 bg-gradient-to-r from-[#0f2347] to-[#1a3a6e] rounded-2xl p-5 sm:p-6 text-white">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center flex-shrink-0">
              <MessageSquare className="w-5 h-5 text-blue-200" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-white mb-1">Need Assistance?</h3>
              <p className="text-blue-200 text-sm mb-4 leading-relaxed">
                Our team is here to help. Reach out with any questions about your account or services.
              </p>
              <a
                href="/portal/contact"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-[#0f2347] font-semibold rounded-xl hover:bg-blue-50 transition-colors text-sm"
              >
                Contact Us
                <ChevronRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </main>

      {showCancellationForm && contactId && (
        <ContractCancellationForm
          contactId={contactId}
          onClose={() => setShowCancellationForm(false)}
          onSuccess={() => {
            setHasActiveContract(false);
            loadDashboardData();
          }}
        />
      )}

      {showWelcomeModal && trialAccess && (
        <TestAndTuneWelcomeModal
          onClose={() => setShowWelcomeModal(false)}
          daysRemaining={trialAccess.daysRemaining}
          customerName={contactName}
        />
      )}
    </div>
  );
}

interface DashboardTileProps {
  icon: React.ReactNode;
  title: string;
  count: number;
  description: string;
  color: 'blue' | 'green' | 'teal' | 'orange' | 'cyan' | 'navy' | 'amber';
  onClick: () => void;
  badge?: React.ReactNode;
}

const tileConfig = {
  blue:   { border: 'border-blue-500',   bg: 'bg-blue-50',   icon: 'bg-blue-100 text-blue-600',   count: 'text-blue-700' },
  green:  { border: 'border-green-500',  bg: 'bg-green-50',  icon: 'bg-green-100 text-green-600',  count: 'text-green-700' },
  teal:   { border: 'border-teal-500',   bg: 'bg-teal-50',   icon: 'bg-teal-100 text-teal-600',   count: 'text-teal-700' },
  orange: { border: 'border-orange-500', bg: 'bg-orange-50', icon: 'bg-orange-100 text-orange-600', count: 'text-orange-700' },
  cyan:   { border: 'border-cyan-500',   bg: 'bg-cyan-50',   icon: 'bg-cyan-100 text-cyan-600',   count: 'text-cyan-700' },
  navy:   { border: 'border-[#1a3a6e]',  bg: 'bg-slate-50',  icon: 'bg-[#0f2347]/10 text-[#0f2347]', count: 'text-[#0f2347]' },
  amber:  { border: 'border-amber-500',  bg: 'bg-amber-50',  icon: 'bg-amber-100 text-amber-600',  count: 'text-amber-700' },
};

function DashboardTile({ icon, title, count, description, color, onClick, badge }: DashboardTileProps) {
  const cfg = tileConfig[color];

  return (
    <button
      onClick={onClick}
      className={`group bg-white rounded-2xl border border-gray-200 hover:border-${color === 'navy' ? 'gray-300' : color + '-300'} shadow-sm hover:shadow-md transition-all duration-200 text-left w-full overflow-hidden relative`}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${cfg.border} bg-current`} style={{background: 'currentColor'}} />
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${cfg.border.replace('border-', 'bg-')}`} />
      <div className="p-5 sm:p-6 pl-6">
        {badge && (
          <div className="absolute top-4 right-4">
            {badge}
          </div>
        )}
        <div className="flex items-start justify-between mb-4">
          <div className={`w-10 h-10 rounded-xl ${cfg.icon} flex items-center justify-center flex-shrink-0`}>
            {icon}
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors mt-1" />
        </div>
        <div className="flex items-baseline gap-2 mb-1.5">
          <span className={`text-3xl font-bold ${cfg.count}`}>{count}</span>
          <span className="text-sm font-semibold text-gray-700">{title}</span>
        </div>
        <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">{description}</p>
      </div>
    </button>
  );
}
