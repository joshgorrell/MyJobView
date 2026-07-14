import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DepartmentProvider, useDepartments } from './contexts/DepartmentContext';
import { LoginForm } from './components/Auth/LoginForm';
import { Header } from './components/Layout/Header';
import { MessageTicker } from './components/Layout/MessageTicker';
import { DepartmentSidebar } from './components/Layout/DepartmentSidebar';
import { QuickAccessNavigation } from './components/Layout/QuickAccessNavigation';
import { OfflineIndicator } from './components/Offline/OfflineIndicator';
import BugReportModal from './components/Shared/BugReportModal';
import { ToastProvider } from './components/Shared/Toast';
import { ErrorBoundary } from './components/Shared/ErrorBoundary';
import { AIAssistant } from './components/AIAssistant/AIAssistant';
import type { ProposalPrefill, ServiceRequestPrefill, SecurityContractPrefill } from './components/AIAssistant/AIAssistant';
import type { SalesRepAIContext } from './components/Sales/SalesDashboard';
import { getIcon } from './lib/iconMap';
import { X, LogOut, FileText, Bug, MessageSquare } from 'lucide-react';
import { QuickActionModal } from './components/Shared/QuickActionModal';
import { offlineStorage } from './lib/offlineStorage';
import { syncManager } from './lib/syncManager';
import { useNotificationCount } from './hooks/useNotificationCount';
import { supabase } from './lib/supabase';

// Lazy load components
const ContactForm = lazy(() => import('./components/Contacts/ContactForm').then(m => ({ default: m.ContactForm })));
const ContactsView = lazy(() => import('./components/Contacts/ContactsView').then(m => ({ default: m.ContactsView })));
const LeadDetail = lazy(() => import('./components/Leads/LeadDetail').then(m => ({ default: m.LeadDetail })));
const LeadForm = lazy(() => import('./components/Leads/LeadForm').then(m => ({ default: m.LeadForm })));
const LeadsHistory = lazy(() => import('./components/Feed/LeadsHistory').then(m => ({ default: m.LeadsHistory })));
const ServiceRequestForm = lazy(() => import('./components/Service/ServiceRequestForm').then(m => ({ default: m.ServiceRequestForm })));
const MasterFeed = lazy(() => import('./components/Feed/MasterFeed').then(m => ({ default: m.MasterFeed })));
const FishbowlView = lazy(() => import('./components/Fishbowl/FishbowlView').then(m => ({ default: m.FishbowlView })));
const BusinessCardPage = lazy(() => import('./components/BusinessCard/BusinessCardPage').then(m => ({ default: m.BusinessCardPage })));
const MyCardView = lazy(() => import('./components/BusinessCard/MyCardView').then(m => ({ default: m.MyCardView })));
const Settings = lazy(() => import('./components/Admin/Settings').then(m => ({ default: m.Settings })));
const PointsAndRewards = lazy(() => import('./components/Admin/PointsAndRewards').then(m => ({ default: m.PointsAndRewards })));
const RewardsDashboard = lazy(() => import('./components/Rewards/RewardsDashboard').then(m => ({ default: m.RewardsDashboard })));
const DepartmentManager = lazy(() => import('./components/Admin/DepartmentManager').then(m => ({ default: m.DepartmentManager })));
const GPSDiagnostics = lazy(() => import('./components/Admin/GPSDiagnostics').then(m => ({ default: m.GPSDiagnostics })));
const ContactCSVImport = lazy(() => import('./components/Admin/ContactCSVImport').then(m => ({ default: m.ContactCSVImport })));
const HistoricalSalesImport = lazy(() => import('./components/Admin/HistoricalSalesImport').then(m => ({ default: m.HistoricalSalesImport })));
const TasksView = lazy(() => import('./components/Tasks/TasksView').then(m => ({ default: m.TasksView })));
const TaskForm = lazy(() => import('./components/Tasks/TaskForm').then(m => ({ default: m.TaskForm })));
const UserPreferences = lazy(() => import('./components/Settings/UserPreferences').then(m => ({ default: m.UserPreferences })));
const HowItWorks = lazy(() => import('./components/Help/HowItWorks').then(m => ({ default: m.HowItWorks })));
const ProposalsView = lazy(() => import('./components/Proposals/ProposalsView'));
const ConnectionsView = lazy(() => import('./components/Connections/ConnectionsView'));
const ImprovementsView = lazy(() => import('./components/Improvements/ImprovementsView').then(m => ({ default: m.ImprovementsView })));
const RecurView = lazy(() => import('./components/Recur/RecurView'));
const DispatchDashboard = lazy(() => import('./components/Dispatch/DispatchDashboard').then(m => ({ default: m.DispatchDashboard })));
const TechMap = lazy(() => import('./components/Dispatch/TechMap').then(m => ({ default: m.TechMap })));
const TechStatusDashboard = lazy(() => import('./components/Dispatch/TechStatusDashboard').then(m => ({ default: m.TechStatusDashboard })));
const TravelBonusQueue = lazy(() => import('./components/Dispatch/TravelBonusQueue').then(m => ({ default: m.TravelBonusQueue })));
const ServiceRequestQueue = lazy(() => import('./components/Dispatch/ServiceRequestQueue').then(m => ({ default: m.ServiceRequestQueue })));
const ServiceRequestAnalytics = lazy(() => import('./components/Dispatch/ServiceRequestAnalytics').then(m => ({ default: m.ServiceRequestAnalytics })));
const ProjectWorkOrdersQueue = lazy(() => import('./components/Dispatch/ProjectWorkOrdersQueue').then(m => ({ default: m.ProjectWorkOrdersQueue })));
const JobStatusPanel = lazy(() => import('./components/Dispatch/JobStatusPanel').then(m => ({ default: m.JobStatusPanel })));
const JobAcceptanceQueue = lazy(() => import('./components/Dispatch/JobAcceptanceQueue').then(m => ({ default: m.JobAcceptanceQueue })));
const DispatchCustomerComms = lazy(() => import('./components/Dispatch/DispatchCustomerComms').then(m => ({ default: m.DispatchCustomerComms })));
const TechSkillsFilter = lazy(() => import('./components/Dispatch/TechSkillsFilter').then(m => ({ default: m.TechSkillsFilter })));
const WorkOrdersList = lazy(() => import('./components/Production/WorkOrdersList').then(m => ({ default: m.WorkOrdersList })));
const WorkOrderDetail = lazy(() => import('./components/Production/WorkOrderDetail').then(m => ({ default: m.WorkOrderDetail })));
const ChangeOrdersView = lazy(() => import('./components/Production/ChangeOrdersView').then(m => ({ default: m.ChangeOrdersView })));

const TechnicianWorkCenter = lazy(() => import('./components/Production/TechnicianWorkCenter').then(m => ({ default: m.TechnicianWorkCenter })));
const ProductionManagerDashboard = lazy(() => import('./components/Production/ProductionManagerDashboard').then(m => ({ default: m.ProductionManagerDashboard })));
const PartsRequestManagement = lazy(() => import('./components/Production/PartsRequestManagement').then(m => ({ default: m.PartsRequestManagement })));
const JobPhotosGallery = lazy(() => import('./components/Production/JobPhotosGallery').then(m => ({ default: m.JobPhotosGallery })));
const TechStats = lazy(() => import('./components/Production/TechStats').then(m => ({ default: m.TechStats })));
const InventoryDashboard = lazy(() => import('./components/Inventory/InventoryDashboard').then(m => ({ default: m.InventoryDashboard })));
const ProductsManagement = lazy(() => import('./components/Products/ProductsManagement'));
const ServiceBillingQueue = lazy(() => import('./components/Service/ServiceBillingQueue').then(m => ({ default: m.ServiceBillingQueue })));
const AppointmentsCalendar = lazy(() => import('./components/Appointments/AppointmentsCalendar').then(m => ({ default: m.AppointmentsCalendar })));
const CalendarPopout = lazy(() => import('./components/Appointments/CalendarPopout').then(m => ({ default: m.CalendarPopout })));
const SalesDashboard = lazy(() => import('./components/Sales/SalesDashboard').then(m => ({ default: m.SalesDashboard })));
const PipelineBoard = lazy(() => import('./components/Sales/PipelineBoard').then(m => ({ default: m.PipelineBoard })));
const ProspectsPage = lazy(() => import('./components/Sales/ProspectsPage').then(m => ({ default: m.ProspectsPage })));
const SalesActivity = lazy(() => import('./components/Sales/SalesActivity').then(m => ({ default: m.SalesActivity })));
const SalesPerformance = lazy(() => import('./components/Sales/SalesPerformance').then(m => ({ default: m.SalesPerformance })));
const SalesOrdersView = lazy(() => import('./components/Sales/SalesOrdersView').then(m => ({ default: m.SalesOrdersView })));
const SalesOrderDetail = lazy(() => import('./components/Sales/SalesOrderDetail').then(m => ({ default: m.SalesOrderDetail })));
const ReviewsView = lazy(() => import('./components/Sales/ReviewsView'));
const SalesServiceRequestsView = lazy(() => import('./components/Sales/SalesServiceRequestsView').then(m => ({ default: m.SalesServiceRequestsView })));
const SalesBillingDashboard = lazy(() => import('./components/Sales/SalesBillingDashboard').then(m => ({ default: m.SalesBillingDashboard })));
const IndividualDashboard = lazy(() => import('./components/Dashboard/IndividualDashboard').then(m => ({ default: m.IndividualDashboard })));
const TeamLeaderboard = lazy(() => import('./components/Dashboard/TeamLeaderboard').then(m => ({ default: m.TeamLeaderboard })));
const ProjectsView = lazy(() => import('./components/Projects/ProjectsView'));
const InvoicesView = lazy(() => import('./components/Invoices/InvoicesView').then(m => ({ default: m.InvoicesView })));
const CommissionsPage = lazy(() => import('./components/Commissions/CommissionsPage').then(m => ({ default: m.CommissionsPage })));
const MessagesView = lazy(() => import('./components/Messages/MessagesView').then(m => ({ default: m.MessagesView })));
const PunchlistAdminDashboard = lazy(() => import('./components/Production/PunchlistAdminDashboard').then(m => ({ default: m.PunchlistAdminDashboard })));
const TestTunePerformanceDashboard = lazy(() => import('./components/Production/TestTunePerformanceDashboard').then(m => ({ default: m.TestTunePerformanceDashboard })));
const VIPPlanManagement = lazy(() => import('./components/Finance/VIPPlanManagement').then(m => ({ default: m.VIPPlanManagement })));
const BonusApprovalDashboard = lazy(() => import('./components/Finance/BonusApprovalDashboard').then(m => ({ default: m.BonusApprovalDashboard })));
const TestTuneSettings = lazy(() => import('./components/Admin/TestTuneSettings').then(m => ({ default: m.TestTuneSettings })));
const PortalPunchlist = lazy(() => import('./components/Portal/PortalPunchlist').then(m => ({ default: m.PortalPunchlist })));
const PortalVIPMembership = lazy(() => import('./components/Portal/PortalVIPMembership').then(m => ({ default: m.PortalVIPMembership })));
const PublicVIPMembership = lazy(() => import('./components/Portal/PublicVIPMembership').then(m => ({ default: m.PublicVIPMembership })));
const PortalSignup = lazy(() => import('./components/Portal/PortalSignup').then(m => ({ default: m.PortalSignup })));
const PortalDashboard = lazy(() => import('./components/Portal/PortalDashboard').then(m => ({ default: m.PortalDashboard })));
const PortalContactUs = lazy(() => import('./components/Portal/PortalContactUs').then(m => ({ default: m.PortalContactUs })));
const PortalProposals = lazy(() => import('./components/Portal/PortalProposals').then(m => ({ default: m.PortalProposals })));
const DailyClock = lazy(() => import('./components/Technician/DailyClock').then(m => ({ default: m.DailyClock })));
const TimeClockHistory = lazy(() => import('./components/Dispatch/TimeClockHistory').then(m => ({ default: m.TimeClockHistory })));
const ContractManagement = lazy(() => import('./components/Finance/ContractOnboarding'));
const SecurityOnboarding = lazy(() => import('./components/Finance/SecurityOnboarding'));
const FinanceDashboard = lazy(() => import('./components/Finance/FinanceDashboard').then(m => ({ default: m.FinanceDashboard })));
const SecurityOnboardingPortal = lazy(() => import('./components/Portal/SecurityOnboardingPortal'));
const PortalLogin = lazy(() => import('./components/Portal/PortalLogin').then(m => ({ default: m.PortalLogin })));
const SalesTaxReports = lazy(() => import('./components/Finance/SalesTaxReports').then(m => ({ default: m.default })));
const SalesTaxInstructions = lazy(() => import('./components/Finance/SalesTaxInstructions').then(m => ({ default: m.default })));
const TimeClockManagement = lazy(() => import('./components/Admin/TimeClockManagement').then(m => ({ default: m.TimeClockManagement })));
const ProposalMessagesAdmin = lazy(() => import('./components/Proposals/ProposalMessagesAdmin').then(m => ({ default: m.ProposalMessagesAdmin })));
const PTOManagement = lazy(() => import('./components/Admin/PTOManagement').then(m => ({ default: m.PTOManagement })));
const MyTimeOff = lazy(() => import('./components/Dispatch/MyTimeOff').then(m => ({ default: m.MyTimeOff })));
const StickyNotes = lazy(() => import('./components/Sales/StickyNotes').then(m => ({ default: m.default })));
const DesignQueue = lazy(() => import('./components/Sales/DesignQueue'));
const DesignBriefModal = lazy(() => import('./components/Sales/DesignBriefModal'));
const TVDashboard = lazy(() => import('./components/Production/TVDashboard').then(m => ({ default: m.default })));
const SalesTVDashboard = lazy(() => import('./components/Sales/SalesTVDashboard').then(m => ({ default: m.default })));
const BugManagement = lazy(() => import('./components/Admin/BugManagement').then(m => ({ default: m.default })));
const EULA = lazy(() => import('./components/Public/EULA').then(m => ({ default: m.EULA })));
const PrivacyPolicy = lazy(() => import('./components/Public/PrivacyPolicy').then(m => ({ default: m.PrivacyPolicy })));
const FeedbackPage = lazy(() => import('./components/Public/FeedbackPage').then(m => ({ default: m.FeedbackPage })));
const TradeshowKiosk = lazy(() => import('./components/Kiosk/TradeshowKiosk').then(m => ({ default: m.TradeshowKiosk })));
const ProposalTemplateManager = lazy(() => import('./components/Proposals/ProposalTemplateManager').then(m => ({ default: m.default })));
const VehicleManagement = lazy(() => import('./components/Admin/VehicleManagement').then(m => ({ default: m.default })));
const MileageEntryForm = lazy(() => import('./components/Shared/MileageEntryForm').then(m => ({ default: m.default })));
const CreateSecurityContractModal = lazy(() => import('./components/Finance/CreateSecurityContractModal'));
const AddProjectTimeModal = lazy(() => import('./components/Projects/AddProjectTimeModal').then(m => ({ default: m.AddProjectTimeModal })));

// Loading component
function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent mb-3"></div>
        <p className="text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    </div>
  );
}

function AppContent() {
  const { user, profile, loading, isPasswordRecovery, isPortalUser, updatePassword, signOut } = useAuth();
  const { footerDepartments, getUserModules, hasModuleAccess: checkModuleAccess, modules: departmentModules, loading: departmentsLoading } = useDepartments();
  const openAIAssistantRef = useRef<(() => void) | null>(null);
  const [showContactForm, setShowContactForm] = useState(false);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [showMessageForm, setShowMessageForm] = useState(false);
  const [showServiceRequestForm, setShowServiceRequestForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [aiTaskPrefill, setAiTaskPrefill] = useState<{ contactId?: string; contactName?: string; title?: string; description?: string; priority?: string; dueDate?: string } | null>(null);
  const [showAiTaskForm, setShowAiTaskForm] = useState(false);
  const [showJobMediaUpload, setShowJobMediaUpload] = useState(false);
  const [showAddProjectTime, setShowAddProjectTime] = useState(false);
  const [showBugReportModal, setShowBugReportModal] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [openProposalId, setOpenProposalId] = useState<string | null>(null);
  const [aiProposalPrefill, setAiProposalPrefill] = useState<ProposalPrefill | null>(null);
  const [aiServiceRequestPrefill, setAiServiceRequestPrefill] = useState<ServiceRequestPrefill | null>(null);
  const [showAiSecurityContractModal, setShowAiSecurityContractModal] = useState(false);
  const [aiSecurityContractPrefill, setAiSecurityContractPrefill] = useState<SecurityContractPrefill | null>(null);
  const [openSalesOrderId, setOpenSalesOrderId] = useState<string | null>(null);
  const [invoiceContactFilter, setInvoiceContactFilter] = useState<string | null>(null);
  const [openChangeOrderId, setOpenChangeOrderId] = useState<string | null>(null);
  const [salesRepAIContext, setSalesRepAIContext] = useState<SalesRepAIContext | null>(null);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string | null>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('workOrderId');
  });
  const [showDesignBriefModal, setShowDesignBriefModal] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(() => {
    // First check URL parameters, then localStorage, default to 'feed'
    const urlParams = new URLSearchParams(window.location.search);
    const urlTab = urlParams.get('tab');
    return urlTab || localStorage.getItem('activeTab') || 'feed';
  });
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('departmentSidebarOpen');
    return saved !== null ? saved === 'true' : false;
  });
  const [sidebarPinned, setSidebarPinned] = useState(() => {
    const saved = localStorage.getItem('departmentSidebarPinned');
    return saved === 'true';
  });
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [currentHash, setCurrentHash] = useState(window.location.hash);
  const [newPassword, setNewPassword] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);

  const notificationCount = useNotificationCount();
  const [footerLogoUrl, setFooterLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    document.title = notificationCount > 0 ? `(${notificationCount}) MyJobView` : 'MyJobView';
  }, [notificationCount]);

  useEffect(() => {
    async function loadFooterLogo() {
      try {
        const { data } = await supabase
          .from('organizations')
          .select('footer_logo_url')
          .limit(1)
          .maybeSingle();
        if (data?.footer_logo_url) {
          setFooterLogoUrl(data.footer_logo_url);
        }
      } catch {
        // silently use text fallback
      }
    }
    if (user) loadFooterLogo();
  }, [user]);

  const toggleSidebar = () => {
    if (sidebarPinned) return;
    setSidebarOpen(!sidebarOpen);
  };

  const toggleSidebarPin = () => {
    const newPinned = !sidebarPinned;
    setSidebarPinned(newPinned);
    localStorage.setItem('departmentSidebarPinned', newPinned.toString());
    if (newPinned) {
      setSidebarOpen(true);
    }
  };

  useEffect(() => {
    localStorage.setItem('departmentSidebarOpen', sidebarOpen.toString());
  }, [sidebarOpen]);

  // Check if we're in standalone/popout mode (no header/nav)
  const isStandalone = new URLSearchParams(window.location.search).get('standalone') === 'true';

  // Initialize state from URL on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlProposalId = urlParams.get('proposalId');
    const urlLeadId = urlParams.get('leadId');
    const urlTaskId = urlParams.get('taskId');
    const urlThreadId = urlParams.get('threadId');
    const urlCoId = urlParams.get('coId');
    const urlSalesOrderId = urlParams.get('openOrderId');

    if (urlProposalId) setOpenProposalId(urlProposalId);
    if (urlLeadId) setSelectedLeadId(urlLeadId);
    if (urlTaskId) setOpenTaskId(urlTaskId);
    if (urlThreadId) setOpenThreadId(urlThreadId);
    if (urlCoId) setOpenChangeOrderId(urlCoId);
    if (urlSalesOrderId) setOpenSalesOrderId(urlSalesOrderId);
  }, []);

  const renderIcon = (iconName: string, className: string = "w-4 h-4") => {
    const IconComponent = getIcon(iconName);
    return IconComponent ? <IconComponent className={className} /> : null;
  };

  useEffect(() => {
    offlineStorage.init();
    syncManager.startAutoSync();
  }, []);

  const checkModuleAccessRef = React.useRef(checkModuleAccess);
  checkModuleAccessRef.current = checkModuleAccess;
  const activeTabRef = React.useRef(activeTab);
  activeTabRef.current = activeTab;

  useEffect(() => {
    if (profile && !departmentsLoading && departmentModules.length > 0) {
      const currentTab = activeTabRef.current;
      if (!currentTab || currentTab === 'feed') return;

      if (currentTab === 'settings' && profile.role === 'admin') return;
      if (currentTab === 'preferences') return;

      const hasAccess = checkModuleAccessRef.current(currentTab);
      if (!hasAccess) {
        setActiveTab('feed');
        localStorage.setItem('activeTab', 'feed');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, departmentsLoading, departmentModules]);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
      setCurrentHash(window.location.hash);

      // Restore state from URL when using browser back/forward
      const urlParams = new URLSearchParams(window.location.search);
      const urlTab = urlParams.get('tab');
      const urlProposalId = urlParams.get('proposalId');
      const urlLeadId = urlParams.get('leadId');
      const urlTaskId = urlParams.get('taskId');
      const urlThreadId = urlParams.get('threadId');
      const urlCoId = urlParams.get('coId');
      const urlSalesOrderId = urlParams.get('openOrderId');
      const urlWorkOrderId = urlParams.get('workOrderId');

      if (urlTab) {
        setActiveTab(urlTab);
      } else {
        setActiveTab('feed');
      }

      setOpenProposalId(urlProposalId);
      setSelectedLeadId(urlLeadId);
      setOpenTaskId(urlTaskId);
      setOpenThreadId(urlThreadId);
      setOpenChangeOrderId(urlCoId);
      setOpenSalesOrderId(urlSalesOrderId);
      setSelectedWorkOrderId(urlWorkOrderId);
    };

    const handleHashChange = () => {
      setCurrentHash(window.location.hash);
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  // Save active tab to localStorage and update URL whenever state changes
  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);

    // Skip URL manipulation for standalone routes that don't use tab-based navigation
    const standaloneRoutes = ['/kiosk', '/portal', '/business-card', '/public', '/eula', '/privacy'];
    if (standaloneRoutes.some(r => currentPath.startsWith(r))) return;

    // Update URL to persist state across refreshes
    const urlParams = new URLSearchParams(window.location.search);

    // Update tab parameter
    if (activeTab && activeTab !== 'feed') {
      urlParams.set('tab', activeTab);
    } else {
      urlParams.delete('tab');
    }

    // Update opened item parameters
    if (openProposalId) {
      urlParams.set('proposalId', openProposalId);
    } else {
      urlParams.delete('proposalId');
    }

    if (selectedLeadId) {
      urlParams.set('leadId', selectedLeadId);
    } else {
      urlParams.delete('leadId');
    }

    if (openTaskId) {
      urlParams.set('taskId', openTaskId);
    } else {
      urlParams.delete('taskId');
    }

    if (openThreadId) {
      urlParams.set('threadId', openThreadId);
    } else {
      urlParams.delete('threadId');
    }

    if (openChangeOrderId) {
      urlParams.set('coId', openChangeOrderId);
    } else {
      urlParams.delete('coId');
    }

    if (openSalesOrderId) {
      urlParams.set('openOrderId', openSalesOrderId);
    } else {
      urlParams.delete('openOrderId');
    }

    if (selectedWorkOrderId) {
      urlParams.set('workOrderId', selectedWorkOrderId);
    } else {
      urlParams.delete('workOrderId');
    }

    // Update the URL without reloading the page
    const newUrl = urlParams.toString() ? `${window.location.pathname}?${urlParams.toString()}` : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
  }, [activeTab, openProposalId, selectedLeadId, openTaskId, openThreadId, openChangeOrderId, openSalesOrderId, selectedWorkOrderId, currentPath]);

  // Close all modals when switching tabs to prevent overlay issues
  useEffect(() => {
    setShowContactForm(false);
    setShowLeadForm(false);
    setShowMessageForm(false);
    setShowServiceRequestForm(false);
    setShowTaskForm(false);
    setShowJobMediaUpload(false);
  }, [activeTab]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center p-4">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent mb-4"></div>
          <div className="text-gray-300 text-lg mb-2">Loading...</div>
          <div className="text-gray-400 text-sm">
            If this takes more than a few seconds, try refreshing the page.
          </div>
        </div>
      </div>
    );
  }

  // --- PORTAL USER ISOLATION ---
  // Portal users (customers) must ONLY ever see portal paths and security-onboarding.
  // This allowlist check fires before any other route is evaluated, so there is no
  // timing window or unguarded route that could expose internal admin pages.
  const PORTAL_ALLOWED_PATHS = [
    '/portal',
    '/portal/punchlist',
    '/portal/proposals',
    '/portal/vip-membership',
    '/portal/contact',
    '/portal/membership',
    '/portal/signup',
    '/security-onboarding',
  ];

  const isPortalAllowedPath =
    PORTAL_ALLOWED_PATHS.includes(currentPath) ||
    currentPath.startsWith('/portal/proposals/');

  if (isPortalUser && user && !isPortalAllowedPath) {
    // If the user is navigating to the root path (/) they are trying to reach
    // the internal staff login. Sign them out of the portal session so they can
    // access the internal app, then reload to show the login form.
    if (currentPath === '/' || currentPath === '') {
      supabase.auth.signOut().then(() => {
        window.location.replace('/');
      });
      return <LoadingFallback />;
    }
    // For all other non-portal paths redirect back to the portal.
    window.location.replace('/portal/punchlist');
    return <LoadingFallback />;
  }
  // --- END PORTAL USER ISOLATION ---

  // Portal & public routes — must come AFTER the portal isolation guard above
  if (currentPath === '/portal/membership') {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <PublicVIPMembership />
      </Suspense>
    );
  }

  if (currentPath === '/portal/signup') {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <PortalSignup />
      </Suspense>
    );
  }

  if (currentPath === '/portal') {
    const portalTokenParam = new URLSearchParams(window.location.search).get('portal_token');

    // If a real customer is arriving via an invite link, clear any stale admin
    // impersonation state so the token verification flow runs correctly.
    if (portalTokenParam) {
      localStorage.removeItem('admin_impersonating_contact');
      localStorage.removeItem('admin_impersonating_name');
    }

    // Check if we have impersonation data (use localStorage for cross-tab compatibility)
    const impersonatingContactId = localStorage.getItem('admin_impersonating_contact');

    // If admin is impersonating a customer, show the portal dashboard
    if (impersonatingContactId) {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <PortalDashboard />
        </Suspense>
      );
    }

    // Otherwise show the customer login page
    return (
      <Suspense fallback={<LoadingFallback />}>
        <PortalLogin />
      </Suspense>
    );
  }

  if (currentPath === '/portal/punchlist') {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <PortalPunchlist />
      </Suspense>
    );
  }

  if (currentPath === '/portal/proposals' || currentPath.startsWith('/portal/proposals/')) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <PortalProposals />
      </Suspense>
    );
  }

  if (currentPath === '/portal/vip-membership') {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <PortalVIPMembership />
      </Suspense>
    );
  }

  if (currentPath === '/portal/vip-benefits') {
    window.location.replace('/portal/vip-membership');
    return null;
  }

  if (currentPath === '/portal/contact') {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <PortalContactUs />
      </Suspense>
    );
  }

  if (currentPath === '/security-onboarding') {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    return (
      <Suspense fallback={<LoadingFallback />}>
        <SecurityOnboardingPortal token={token || undefined} />
      </Suspense>
    );
  }

  // --- INTERNAL-ONLY ROUTES (portal users never reach below this point) ---

  const cardMatch = currentPath.match(/^\/card\/(.+)$/);
  if (cardMatch) {
    if (!user || !profile) return <LoginForm />;
    return (
      <Suspense fallback={<LoadingFallback />}>
        <BusinessCardPage slug={cardMatch[1]} isOwnCard={false} />
      </Suspense>
    );
  }

  if (currentPath === '/calendar') {
    if (!user || !profile) return <LoginForm />;
    return (
      <Suspense fallback={<LoadingFallback />}>
        <CalendarPopout />
      </Suspense>
    );
  }

  if (currentPath === '/feedback') {
    if (!user || !profile) return <LoginForm />;
    return (
      <Suspense fallback={<LoadingFallback />}>
        <FeedbackPage />
      </Suspense>
    );
  }

  if (currentPath === '/eula') {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <EULA />
      </Suspense>
    );
  }

  if (currentPath === '/privacy-policy') {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <PrivacyPolicy />
      </Suspense>
    );
  }

  if (currentPath === '/kiosk') {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <TradeshowKiosk />
      </Suspense>
    );
  }

  if (currentPath === '/tv-dashboard') {
    if (!user || !profile) return <LoginForm />;
    return (
      <Suspense fallback={<LoadingFallback />}>
        <TVDashboard />
      </Suspense>
    );
  }

  if (currentPath === '/sales-tv-dashboard') {
    if (!user || !profile) return <LoginForm />;
    return (
      <Suspense fallback={<LoadingFallback />}>
        <SalesTVDashboard />
      </Suspense>
    );
  }

  if (currentPath === '/sales-order-fullscreen') {
    if (!user || !profile) {
      return <LoginForm />;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const soId = urlParams.get('id');
    const soActiveTab = urlParams.get('activeTab') as 'scope' | 'primary_scope' | 'billing' | 'change_orders' | 'project' | 'reports' | 'stats' | 'commissions' | null;

    if (!soId) {
      return (
        <div className="h-screen bg-gray-900 flex items-center justify-center">
          <p className="text-gray-400">No sales order specified.</p>
        </div>
      );
    }

    return (
      <div className="h-screen bg-gray-900 flex flex-col overflow-auto p-6">
        <Suspense fallback={<LoadingFallback />}>
          <SalesOrderDetail orderId={soId} onBack={() => window.close()} isStandalone={true} initialTab={soActiveTab ?? undefined} />
        </Suspense>
      </div>
    );
  }

  if (currentPath === '/proposals-fullscreen') {
    if (!user || !profile) {
      return <LoginForm />;
    }

    // Check module access for proposals
    if (!checkModuleAccess('proposals')) {
      return (
        <div className="h-screen bg-gray-900 flex items-center justify-center">
          <div className="text-center">
            <FileText size={64} className="mx-auto text-gray-600 mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
            <p className="text-gray-400">You don't have permission to access Proposals.</p>
          </div>
        </div>
      );
    }

    // Check if there's an 'id' parameter - if so, open in standalone mode
    const urlParams = new URLSearchParams(window.location.search);
    const proposalId = urlParams.get('id');

    return (
      <div className="h-screen bg-gray-900 flex flex-col overflow-hidden">
        <Suspense fallback={<LoadingFallback />}>
          <ProposalsView isStandalone={!!proposalId} openProposalId={proposalId} />
        </Suspense>
      </div>
    );
  }

  if (!user || !profile) {
    if (isPasswordRecovery) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
          <div className="bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-purple-500/30 p-8 max-w-md w-full">
            <h2 className="text-2xl font-bold text-white mb-6">Reset Your Password</h2>

            {resetSuccess ? (
              <div className="text-center">
                <div className="p-3 bg-green-500/20 border border-green-500/50 rounded-lg text-green-300 text-sm mb-4">
                  Password updated successfully!
                </div>
                <p className="text-gray-300 mb-4">You can now sign in with your new password.</p>
                <button
                  onClick={() => {
                    window.location.href = '/';
                  }}
                  className="w-full py-3 bg-gradient-to-r from-cyan-500 to-purple-600 text-white rounded-lg font-semibold hover:from-cyan-600 hover:to-purple-700 transition-all"
                >
                  Go to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={async (e) => {
                e.preventDefault();
                setResetError(null);
                try {
                  await updatePassword(newPassword);
                  setResetSuccess(true);
                  window.history.replaceState(null, '', window.location.pathname);
                } catch (error: any) {
                  setResetError(error?.message || 'Failed to update password');
                }
              }}>
                {resetError && (
                  <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm mb-4">
                    {resetError}
                  </div>
                )}

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    New Password
                  </label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="Enter new password"
                    minLength={6}
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-gradient-to-r from-cyan-500 to-purple-600 text-white rounded-lg font-semibold hover:from-cyan-600 hover:to-purple-700 transition-all"
                >
                  Update Password
                </button>
              </form>
            )}
          </div>
        </div>
      );
    }
    return <LoginForm />;
  }

  if (!profile.is_active) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-900 via-orange-900 to-pink-900 flex items-center justify-center p-4">
        <div className="bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-red-500/30 p-8 max-w-md text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Access Revoked</h2>
          <p className="text-gray-300">
            Your access to this application has been revoked. Please contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col overflow-hidden">
      <OfflineIndicator />
      {!isStandalone && (
        <>
          <Header
            onCreateContact={() => setShowContactForm(true)}
            onCreateLead={() => setShowLeadForm(true)}
            onCreateMessage={() => setShowMessageForm(true)}
            onCreateServiceRequest={() => setShowServiceRequestForm(true)}
            onCreateTask={() => {
              setShowTaskForm(true);
              setActiveTab('tasks');
            }}
            onCreateJobMedia={() => {
              setShowJobMediaUpload(true);
              setActiveTab('job_photos');
            }}
            onCreateProjectTime={['admin', 'manager', 'service_manager', 'sales_manager'].includes(profile.role) ? () => setShowAddProjectTime(true) : undefined}
            onLeadClick={(leadId) => setSelectedLeadId(leadId)}
            onTaskClick={(taskId) => {
              setOpenTaskId(taskId);
              setActiveTab('tasks');
            }}
            onMessageClick={(threadId) => {
              setOpenThreadId(threadId);
              setActiveTab('messages');
            }}
            onProposalClick={(proposalId) => {
              setOpenProposalId(proposalId);
              setActiveTab('proposals');
            }}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            isAdmin={profile.role === 'admin'}
            onMenuToggle={toggleSidebar}
            onNavigate={(tab, params) => {
              setActiveTab(tab);
              if (params?.workOrderId) setSelectedWorkOrderId(params.workOrderId);
            }}
            onOpenAIAssistant={() => openAIAssistantRef.current?.()}
          />
          <MessageTicker />
        </>
      )}

      {!isStandalone && (
        <DepartmentSidebar
          activeModule={activeTab}
          onModuleChange={setActiveTab}
          isOpen={sidebarOpen}
          onToggle={toggleSidebar}
          isPinned={sidebarPinned}
          onPinToggle={toggleSidebarPin}
        />
      )}

      <div className={`flex-1 overflow-hidden transition-all duration-300 ${!isStandalone && sidebarPinned ? 'sm:pl-64' : ''}`}>
        <main
          className={`h-full overflow-y-auto ${isStandalone ? 'w-full' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8'}`}
          style={{ scrollbarGutter: 'stable' }}
        >
          {!isStandalone && (
            <div className="hidden sm:block mb-6">
              <div className="border-b border-purple-500/30 pb-3">
                <QuickAccessNavigation activeModule={activeTab} onModuleChange={setActiveTab} />
              </div>
            </div>
          )}

        <Suspense fallback={<LoadingFallback />}>
          {activeTab === 'time' && <DailyClock key={activeTab} />}
          {activeTab === 'contacts' && checkModuleAccess('contacts') && (
            <ContactsView
              key={activeTab}
              onNavigateToProposal={(proposalId) => {
                setOpenProposalId(proposalId);
                setActiveTab('proposals');
              }}
              onNavigateToInvoices={(contactId) => {
                setInvoiceContactFilter(contactId);
                setActiveTab('invoices');
              }}
            />
          )}
          {activeTab === 'leads' && checkModuleAccess('leads') && <LeadsHistory key={activeTab} onLeadClick={(leadId) => setSelectedLeadId(leadId)} />}
          {activeTab === 'feed' && checkModuleAccess('feed') && <MasterFeed key={activeTab} onLeadClick={(leadId) => setSelectedLeadId(leadId)} />}
          {activeTab === 'fishbowl' && checkModuleAccess('fishbowl') && <FishbowlView key={activeTab} onLeadClick={(leadId) => setSelectedLeadId(leadId)} />}
          {activeTab === 'connections' && checkModuleAccess('connections') && <ConnectionsView key={activeTab} />}
          {(activeTab === 'proposals' || activeTab === 'sales') && (() => {
            // Show loading while departments are still loading
            if (departmentsLoading) {
              return false;
            }
            return checkModuleAccess('proposals');
          })() && (
            <ProposalsView
              key={activeTab}
              openProposalId={openProposalId}
              onProposalOpened={() => setOpenProposalId(null)}
              aiPrefill={aiProposalPrefill}
              onAiPrefillConsumed={() => setAiProposalPrefill(null)}
              onSelectSalesOrder={(salesOrderId) => {
                setOpenSalesOrderId(salesOrderId);
                setActiveTab('sales_orders');
              }}
              onNavigateToSalesOrders={() => setActiveTab('sales_orders')}
              onNavigateToSalesStats={() => setActiveTab('sales_dashboard')}
            />
          )}
          {activeTab === 'messages' && checkModuleAccess('messages') && (
            <MessagesView
              key={activeTab}
              openThreadId={openThreadId}
              onThreadOpened={() => setOpenThreadId(null)}
            />
          )}
          {activeTab === 'projects' && checkModuleAccess('projects') && <ProjectsView key={activeTab} />}
          {activeTab === 'finance_dashboard' && checkModuleAccess('finance_dashboard') && <FinanceDashboard key={activeTab} />}
          {activeTab === 'invoices' && checkModuleAccess('invoices') && (
            <InvoicesView
              key={activeTab}
              contactIdFilter={invoiceContactFilter ?? undefined}
              onClearContactFilter={() => setInvoiceContactFilter(null)}
              onNavigateToContact={(contactId) => {
                const url = new URL(window.location.href);
                url.searchParams.set('contactId', contactId);
                window.history.replaceState({}, '', url);
                setActiveTab('contacts');
              }}
            />
          )}
          {(activeTab === 'commissions' || activeTab === 'commission_management') && checkModuleAccess('commissions') && <CommissionsPage key="commissions" />}
          {activeTab === 'recur' && checkModuleAccess('recur') && <RecurView key={activeTab} />}
          {activeTab === 'products' && profile.role === 'admin' && <Settings key={activeTab} />}

          {activeTab === 'calendar' && checkModuleAccess('calendar') && <AppointmentsCalendar key={activeTab} />}
          {activeTab === 'products_catalog' && checkModuleAccess('products_catalog') && <ProductsManagement key={activeTab} />}
          {activeTab === 'inventory' && checkModuleAccess('inventory') && <InventoryDashboard key={activeTab} />}
          {activeTab === 'job_photos' && checkModuleAccess('job_photos') && (
            <JobPhotosGallery
              key={activeTab}
              initialShowUpload={showJobMediaUpload}
              onClose={() => setShowJobMediaUpload(false)}
            />
          )}
          {activeTab === 'parts_requests' && checkModuleAccess('parts_requests') && <PartsRequestManagement key={activeTab} />}
          {activeTab === 'service_billing' && checkModuleAccess('service_billing') && <ServiceBillingQueue key={activeTab} />}
          {activeTab === 'tech_map' && checkModuleAccess('tech_map') && <TechMap key={activeTab} />}
          {activeTab === 'tech_status' && checkModuleAccess('tech_status') && <TechStatusDashboard key={activeTab} />}
          {(activeTab === 'travel_bonus' || activeTab === 'travel_bonus_settings') && checkModuleAccess('travel_bonus') && <TravelBonusQueue key="travel_bonus" />}

          {activeTab === 'work_orders' && checkModuleAccess('work_orders') && (
            selectedWorkOrderId
              ? <WorkOrderDetail key={selectedWorkOrderId} workOrderId={selectedWorkOrderId} onBack={() => setSelectedWorkOrderId(null)} />
              : <WorkOrdersList key="work_orders_list" onSelectWorkOrder={setSelectedWorkOrderId} />
          )}
          {activeTab === 'change_orders' && checkModuleAccess('change_orders') && (
            <ChangeOrdersView
              key={activeTab}
              initialCoId={openChangeOrderId}
              onCoOpened={() => setOpenChangeOrderId(null)}
              onCoIdChange={setOpenChangeOrderId}
            />
          )}
          {activeTab === 'materials' && (
            <div key={activeTab} className="text-center text-gray-500 py-12">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Materials Tracking</h3>
              <p className="text-gray-400">Coming soon</p>
            </div>
          )}
          {activeTab === 'tech_center' && checkModuleAccess('tech_center') && <TechnicianWorkCenter key={activeTab} />}
          {activeTab === 'tech_stats' && checkModuleAccess('tech_stats') && <TechStats key={activeTab} onNavigate={setActiveTab} />}

          {activeTab === 'sales_dashboard' && checkModuleAccess('sales_dashboard') && (
            <SalesDashboard
              key={activeTab}
              onProposalClick={(proposalId) => {
                setOpenProposalId(proposalId);
                setActiveTab('proposals');
              }}
              onRepContextChange={setSalesRepAIContext}
            />
          )}
          {activeTab === 'sales_orders' && checkModuleAccess('sales_orders') && (
            <SalesOrdersView
              key={activeTab}
              openOrderId={openSalesOrderId}
              onOrderOpened={() => setOpenSalesOrderId(null)}
              onRevertToProposal={(proposalId) => {
                setOpenProposalId(proposalId);
                setActiveTab('proposals');
              }}
            />
          )}
          {activeTab === 'sales_performance' && checkModuleAccess('sales_performance') && <SalesPerformance key={activeTab} />}
          {activeTab === 'sales_activity' && checkModuleAccess('sales_activity') && <SalesActivity key={activeTab} />}
          {activeTab === 'pipeline_board' && checkModuleAccess('pipeline_board') && <PipelineBoard key={activeTab} />}
          {activeTab === 'prospects' && checkModuleAccess('prospects') && <ProspectsPage key={activeTab} />}
          {activeTab === 'reviews' && checkModuleAccess('reviews') && <ReviewsView key={activeTab} />}
          {activeTab === 'sales_service_requests' && checkModuleAccess('service_requests') && <SalesServiceRequestsView key={activeTab} />}
          {activeTab === 'sales_billing' && checkModuleAccess('sales_billing') && <SalesBillingDashboard key={activeTab} />}
          {activeTab === 'sticky-notes' && checkModuleAccess('sticky-notes') && <StickyNotes key={activeTab} />}
          {activeTab === 'design_queue' && checkModuleAccess('design_queue') && (
            <DesignQueue
              key={activeTab}
              onNavigateToProposal={(proposalId) => {
                setOpenProposalId(proposalId);
                setActiveTab('proposals');
              }}
              onNewBrief={() => setShowDesignBriefModal(true)}
            />
          )}
          {activeTab === 'report_templates' && checkModuleAccess('report_templates') && <ProposalTemplateManager key={activeTab} />}

          {activeTab === 'individual_dashboard' && checkModuleAccess('individual_dashboard') && <IndividualDashboard key={activeTab} onNavigate={setActiveTab} />}
          {activeTab === 'team_leaderboard' && checkModuleAccess('team_leaderboard') && <TeamLeaderboard key={activeTab} />}

          {activeTab === 'dispatch_dashboard' && checkModuleAccess('dispatch_dashboard') && <DispatchDashboard key={activeTab} onNavigate={setActiveTab} />}
          {activeTab === 'service_requests' && checkModuleAccess('service_requests') && <ServiceRequestQueue key={activeTab} />}
          {activeTab === 'service_request_analytics' && checkModuleAccess('service_request_analytics') && <ServiceRequestAnalytics key={activeTab} />}
          {activeTab === 'project_work_orders' && checkModuleAccess('work_orders') && <ProjectWorkOrdersQueue key={activeTab} />}
          {activeTab === 'job_status' && checkModuleAccess('dispatch_dashboard') && <JobStatusPanel key={activeTab} />}
          {activeTab === 'job_acceptance' && checkModuleAccess('dispatch_dashboard') && <JobAcceptanceQueue key={activeTab} />}
          {activeTab === 'customer_comms' && checkModuleAccess('dispatch_dashboard') && <DispatchCustomerComms key={activeTab} />}
          {activeTab === 'tech_skills' && checkModuleAccess('dispatch_dashboard') && <TechSkillsFilter key={activeTab} onTechnicianSelect={(techId) => console.log('Selected tech:', techId)} />}
          {activeTab === 'daily_clock' && checkModuleAccess('daily_clock') && <TimeClockHistory key={activeTab} onNavigate={setActiveTab} />}
          {activeTab === 'daily_clock_sessions' && checkModuleAccess('daily_clock') && <TimeClockHistory key={activeTab} onNavigate={setActiveTab} initialTab="sessions" />}

          {activeTab === 'production_dashboard' && checkModuleAccess('production_dashboard') && <ProductionManagerDashboard key={activeTab} />}
          {activeTab === 'production_manager' && checkModuleAccess('production_dashboard') && <ProductionManagerDashboard key={activeTab} />}
          {activeTab === 'punchlist' && checkModuleAccess('punchlist') && (
            <PunchlistAdminDashboard
              key={activeTab}
              onOpenSalesOrder={(id) => { setOpenSalesOrderId(id); setActiveTab('sales_orders'); }}
            />
          )}
          {activeTab === 'test_tune' && checkModuleAccess('test_tune') && <TestTunePerformanceDashboard key={activeTab} />}

          {activeTab === 'vip-plans' && checkModuleAccess('vip-plans') && <VIPPlanManagement key={activeTab} />}
          {activeTab === 'contract_management' && checkModuleAccess('contract_management') && <ContractManagement key={activeTab} />}
          {activeTab === 'security_onboarding' && checkModuleAccess('security_onboarding') && <SecurityOnboarding key={activeTab} onNavigateToContracts={() => setActiveTab('contract_management')} canAccessContractManagement={checkModuleAccess('contract_management')} />}
          {activeTab === 'tax_reports' && checkModuleAccess('tax_reports') && <SalesTaxReports key={activeTab} onNavigateToGuide={checkModuleAccess('tax_filing_guide') ? () => setActiveTab('tax_filing_guide') : undefined} />}
          {activeTab === 'tax_filing_guide' && checkModuleAccess('tax_filing_guide') && <SalesTaxInstructions key={activeTab} />}
          {activeTab === 'bonus_approvals' && checkModuleAccess('bonus_approvals') && <BonusApprovalDashboard key={activeTab} />}

          {activeTab === 'portal_punchlist' && checkModuleAccess('punchlist') && <PortalPunchlist key={activeTab} />}

          {activeTab === 'tasks' && checkModuleAccess('tasks') && (
            <TasksView
              key={activeTab}
              initialShowForm={showTaskForm}
              onFormClose={() => setShowTaskForm(false)}
              openTaskId={openTaskId}
              onTaskOpened={() => setOpenTaskId(null)}
            />
          )}
          {activeTab === 'mycard' && <MyCardView key={activeTab} />}
          {activeTab === 'help' && <HowItWorks key={activeTab} />}
          {activeTab === 'improvements' && <ImprovementsView key={activeTab} />}

          {activeTab === 'feature_suggestions' && <ImprovementsView key={activeTab} />}

          {activeTab === 'time_clock_management' && profile.role === 'admin' && <TimeClockManagement key={activeTab} />}

          {activeTab === 'preferences' && (
            <div key={activeTab} className="max-w-4xl mx-auto">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <UserPreferences />
              </div>
            </div>
          )}

          {(activeTab === 'settings' || activeTab.startsWith('settings_')) && profile.role === 'admin' && (
            <Settings
              key={activeTab}
              initialTab={activeTab.startsWith('settings_') ? activeTab.slice('settings_'.length) : undefined}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === 'test_tune_settings' && checkModuleAccess('test_tune_settings') && <TestTuneSettings key={activeTab} />}

          {activeTab === 'department_access' && profile.role === 'admin' && <DepartmentManager key={activeTab} />}

          {activeTab === 'points_rewards' && profile.role === 'admin' && <PointsAndRewards key={activeTab} />}

          {activeTab === 'rewards_dashboard' && checkModuleAccess('rewards_dashboard') && <RewardsDashboard key={activeTab} />}

          {activeTab === 'time_clock_management' && profile.role === 'admin' && <TimeClockManagement key={activeTab} />}

          {activeTab === 'proposal_messages_admin' && profile.role === 'admin' && <ProposalMessagesAdmin key={activeTab} />}

          {activeTab === 'vehicle-tracking' && (profile.role === 'admin' || profile.role === 'manager') && <VehicleManagement key={activeTab} />}

          {activeTab === 'my_mileage' && <MileageEntryForm key={activeTab} />}

          {activeTab === 'pto_management' && profile.role === 'admin' && <PTOManagement key={activeTab} />}

          {activeTab === 'bug_management' && checkModuleAccess('bug_management') && <BugManagement key={activeTab} />}

          {activeTab === 'gps_diagnostics' && profile.role === 'admin' && <GPSDiagnostics key={activeTab} />}

          {activeTab === 'contact_import' && profile.role === 'admin' && <ContactCSVImport key={activeTab} />}

          {activeTab === 'historical_sales_import' && profile.role === 'admin' && <HistoricalSalesImport key={activeTab} />}

          {activeTab === 'my_time_off' && <MyTimeOff key={activeTab} />}
        </Suspense>

        {/* MyJobView removed - features available in department modules */}
        {/* Recur removed - available in Pipeline > Recurring Revenue */}
        </main>
      </div>

      {!isStandalone && (
        <footer className="bg-gray-900/50 border-t border-purple-500/30 mt-8 sm:mt-12 py-4 sm:py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
            <div className="flex-shrink-0">
              {footerLogoUrl ? (
                <img
                  src={footerLogoUrl}
                  alt="Company Logo"
                  className="h-7 sm:h-8 object-contain"
                />
              ) : (
                <p className="text-gray-400 text-xs sm:text-sm text-center sm:text-left">
                  MyJobView
                </p>
              )}
            </div>
            {/* Legal links */}
            <div className="flex items-center gap-3 text-xs text-gray-600">
              <a
                href="/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gray-400 transition-colors"
              >
                Privacy Policy
              </a>
              <span className="text-gray-700">·</span>
              <a
                href="/eula"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gray-400 transition-colors"
              >
                Terms of Service
              </a>
            </div>

            <div className="flex flex-wrap gap-2 sm:gap-3 justify-center items-center">
              {footerDepartments.map((dept) => {
                const modules = getUserModules(dept.id);
                // Only show sort_order = 1 in footer (Feature Suggestions)
                return modules.filter(m => m.sort_order === 1).map((module) => (
                  <button
                    key={module.module_key}
                    onClick={() => setActiveTab(module.module_key)}
                    className="inline-flex items-center gap-2 px-4 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors justify-center"
                  >
                    {renderIcon(module.icon, "w-4 h-4 flex-shrink-0")}
                    <span className="text-sm whitespace-nowrap">{module.display_name}</span>
                  </button>
                ));
              })}
              <button
                onClick={() => setShowBugReportModal(true)}
                className="p-2 text-green-500 hover:text-green-400 hover:bg-gray-800 rounded-lg transition-colors"
                title="Report a bug"
              >
                <Bug className="w-5 h-5" />
              </button>
              <button
                onClick={signOut}
                className="inline-flex items-center gap-2 px-4 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors justify-center"
                title="Sign out"
              >
                <LogOut className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm whitespace-nowrap">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </footer>
      )}

      {showAddProjectTime && (
        <Suspense fallback={null}>
          <AddProjectTimeModal
            onClose={() => setShowAddProjectTime(false)}
            onSave={() => setShowAddProjectTime(false)}
          />
        </Suspense>
      )}

      {showContactForm && (
        <Suspense fallback={null}>
          <ContactForm
            onClose={() => setShowContactForm(false)}
            onSuccess={() => {
              setShowContactForm(false);
              setActiveTab('contacts');
            }}
          />
        </Suspense>
      )}

      {showLeadForm && (
        <Suspense fallback={null}>
          <LeadForm
            onClose={() => setShowLeadForm(false)}
            onSuccess={() => {
              setShowLeadForm(false);
              setActiveTab('feed');
            }}
          />
        </Suspense>
      )}

      {showServiceRequestForm && (
        <Suspense fallback={null}>
          <ServiceRequestForm
            onClose={() => { setShowServiceRequestForm(false); setAiServiceRequestPrefill(null); }}
            onSuccess={() => {
              setShowServiceRequestForm(false);
              setAiServiceRequestPrefill(null);
              setActiveTab('dispatch_dashboard');
            }}
            aiPrefill={aiServiceRequestPrefill}
          />
        </Suspense>
      )}

      {showAiTaskForm && (
        <Suspense fallback={null}>
          <TaskForm
            onClose={() => { setShowAiTaskForm(false); setAiTaskPrefill(null); }}
            onSuccess={() => { setShowAiTaskForm(false); setAiTaskPrefill(null); }}
            aiPrefill={aiTaskPrefill}
          />
        </Suspense>
      )}

      {showMessageForm && (
        <QuickActionModal
          title="New Message"
          subtitle="Send a message to your team or a customer"
          icon={<MessageSquare className="w-5 h-5 text-white" />}
          accentColor="from-teal-600 to-cyan-700"
          onClose={() => setShowMessageForm(false)}
          maxWidth="sm:max-w-md"
        >
          <div className="p-4 sm:p-6 space-y-5">
            <p className="text-gray-400 text-sm leading-relaxed">
              You will be taken to the Messages module where you can compose and send your message to team members or customers.
            </p>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-teal-950/40 border border-teal-700/50">
              <MessageSquare className="w-5 h-5 text-teal-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-teal-300 text-sm font-medium">Full Messaging Available</p>
                <p className="text-teal-400/70 text-xs mt-0.5">Start threads, attach files, and manage conversations all in one place.</p>
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowMessageForm(false)}
                className="flex-1 px-4 py-2.5 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowMessageForm(false);
                  setActiveTab('messages');
                }}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-teal-600 to-cyan-700 text-white rounded-lg hover:from-teal-500 hover:to-cyan-600 transition-all text-sm font-medium shadow-lg shadow-teal-900/30"
              >
                Go to Messages
              </button>
            </div>
          </div>
        </QuickActionModal>
      )}

      {selectedLeadId && (
        <Suspense fallback={null}>
          <LeadDetail
            leadId={selectedLeadId}
            onClose={() => setSelectedLeadId(null)}
          />
        </Suspense>
      )}

      <BugReportModal
        isOpen={showBugReportModal}
        onClose={() => setShowBugReportModal(false)}
      />

      {showDesignBriefModal && (
        <Suspense fallback={<LoadingFallback />}>
          <DesignBriefModal
            onClose={() => setShowDesignBriefModal(false)}
            onProposalCreated={(proposalId) => {
              setShowDesignBriefModal(false);
              setOpenProposalId(proposalId);
              setActiveTab('proposals');
            }}
          />
        </Suspense>
      )}

      {showAiSecurityContractModal && (
        <Suspense fallback={<LoadingFallback />}>
          <CreateSecurityContractModal
            prefill={aiSecurityContractPrefill ?? undefined}
            onClose={() => { setShowAiSecurityContractModal(false); setAiSecurityContractPrefill(null); }}
            onSuccess={() => { setShowAiSecurityContractModal(false); setAiSecurityContractPrefill(null); setActiveTab('security_onboarding'); }}
          />
        </Suspense>
      )}

      {!isStandalone && (
        <AIAssistant
          activeTab={activeTab}
          salesRepContext={activeTab === 'sales_dashboard' ? salesRepAIContext : null}
          onRegisterOpen={(fn) => { openAIAssistantRef.current = fn; }}
          onAction={(action) => {
            if (action.type === 'CREATE_CONTACT') {
              setShowContactForm(true);
            } else if (action.type === 'CREATE_LEAD') {
              setShowLeadForm(true);
            } else if (action.type === 'CREATE_TASK') {
              if (action.prefill) setAiTaskPrefill(action.prefill as { title?: string; description?: string; priority?: string; dueDate?: string });
              setShowAiTaskForm(true);
            } else if (action.type === 'CREATE_SERVICE_REQUEST') {
              if (action.prefill) setAiServiceRequestPrefill(action.prefill as ServiceRequestPrefill);
              setShowServiceRequestForm(true);
            } else if (action.type === 'CREATE_MESSAGE') {
              setShowMessageForm(true);
            } else if (action.type === 'CREATE_PROPOSAL') {
              if (action.prefill) setAiProposalPrefill(action.prefill as ProposalPrefill);
              setActiveTab('proposals');
            } else if (action.type === 'CREATE_SECURITY_CONTRACT') {
              if (action.prefill) setAiSecurityContractPrefill(action.prefill as SecurityContractPrefill);
              setShowAiSecurityContractModal(true);
            } else if (action.type === 'NAVIGATE_TO' && action.tab) {
              setActiveTab(action.tab);
            } else if (action.type === 'OPEN_PROPOSAL' && action.proposalId) {
              setOpenProposalId(action.proposalId);
              setActiveTab('proposals');
            }
          }}
        />
      )}
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <DepartmentProvider>
            <AppContent />
          </DepartmentProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
