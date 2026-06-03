import { useState, lazy, Suspense } from 'react';
import { Settings as SettingsIcon, Users, Building2, CreditCard, Plug, Lightbulb, Package, Award, Flag, Mail, Shield, Menu, Lock, Receipt, Layers, FileText, Clock, Wrench, Tags, AlertCircle, Activity, Megaphone, MapPin, Target, Monitor, Upload } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const UserManagement = lazy(() => import('./UserManagement').then(m => ({ default: m.UserManagement })));
const UserSessionsViewerEnhanced = lazy(() => import('./UserSessionsViewerEnhanced').then(m => ({ default: m.UserSessionsViewerEnhanced })));
const CompanySettings = lazy(() => import('./CompanySettings').then(m => ({ default: m.CompanySettings })));
const BusinessCardManager = lazy(() => import('../BusinessCard/BusinessCardManager').then(m => ({ default: m.BusinessCardManager })));
const IntegrationsSettings = lazy(() => import('./IntegrationsSettings').then(m => ({ default: m.IntegrationsSettings })));
const SuggestionManagement = lazy(() => import('./SuggestionManagement').then(m => ({ default: m.SuggestionManagement })));
const ProductsManagement = lazy(() => import('../Products/ProductsManagement'));
const PointsAndRewards = lazy(() => import('./PointsAndRewards').then(m => ({ default: m.PointsAndRewards })));
const PriorityManagement = lazy(() => import('./PriorityManagement').then(m => ({ default: m.PriorityManagement })));
const EmailTemplates = lazy(() => import('./EmailTemplates').then(m => ({ default: m.EmailTemplates })));
const CompanyMessagesManagement = lazy(() => import('./CompanyMessagesManagement').then(m => ({ default: m.CompanyMessagesManagement })));
const PermissionsManagement = lazy(() => import('./PermissionsManagement').then(m => ({ default: m.PermissionsManagement })));
const RolePermissionManagement = lazy(() => import('./RolePermissionManagement').then(m => ({ default: m.RolePermissionManagement })));
const DepartmentManager = lazy(() => import('./DepartmentManager').then(m => ({ default: m.DepartmentManager })));
const SalesTaxManagement = lazy(() => import('./SalesTaxManagement'));
const TravelBonusSettings = lazy(() => import('./TravelBonusSettings').then(m => ({ default: m.TravelBonusSettings })));
const ContractManagement = lazy(() => import('./ContractManagement'));
const TimeClockManagement = lazy(() => import('./TimeClockManagement').then(m => ({ default: m.TimeClockManagement })));
const ProposalTemplateSettings = lazy(() => import('./ProposalTemplateSettings').then(m => ({ default: m.ProposalTemplateSettings })));
const LaborPhaseManagement = lazy(() => import('./LaborPhaseManagement').then(m => ({ default: m.LaborPhaseManagement })));
const ClassManager = lazy(() => import('../Proposals/ClassManager'));
const OrphanedRecordsManager = lazy(() => import('./OrphanedRecordsManager'));
const CatalogManagement = lazy(() => import('./CatalogManagement'));
const SalesTargetManagement = lazy(() => import('./SalesTargetManagement').then(m => ({ default: m.SalesTargetManagement })));
const KioskSettings = lazy(() => import('./KioskSettings').then(m => ({ default: m.KioskSettings })));
const ContactCSVImport = lazy(() => import('./ContactCSVImport').then(m => ({ default: m.ContactCSVImport })));

function SettingsLoadingFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
    </div>
  );
}

export function Settings() {
  const { jobModuleEnabled, profile } = useAuth();
  const isAdminOrManager = profile?.role === 'admin' || profile?.role === 'manager';
  const [activeTab, setActiveTab] = useState<'users' | 'sessions' | 'permissions' | 'roles' | 'cards' | 'company' | 'departments' | 'integrations' | 'salestax' | 'salestargets' | 'suggestions' | 'products' | 'catalog' | 'rewards' | 'priorities' | 'emails' | 'travel' | 'contracts' | 'timeclock' | 'proposals' | 'labor' | 'classes' | 'orphaned' | 'kiosk' | 'contact_import'>('users');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-1 flex items-center gap-2">
          <SettingsIcon className="w-6 h-6" />
          Settings
        </h2>
        <p className="text-gray-300">Manage users, business cards, and company information</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border-2 border-gray-200">
        <div className="border-b border-gray-200 bg-white">
          <nav className="flex gap-2 sm:gap-4 px-4 sm:px-6 overflow-x-auto">
            <button
              onClick={() => setActiveTab('users')}
              className={`px-3 sm:px-4 py-3 sm:py-4 font-medium transition-all relative whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'users'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-1 sm:gap-2">
                <Users className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Users</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('sessions')}
              className={`px-3 sm:px-4 py-3 sm:py-4 font-medium transition-all relative whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'sessions'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-1 sm:gap-2">
                <Activity className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Sessions</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('roles')}
              className={`px-3 sm:px-4 py-3 sm:py-4 font-medium transition-all relative whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'roles'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-1 sm:gap-2">
                <Shield className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Roles</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('permissions')}
              className={`px-3 sm:px-4 py-3 sm:py-4 font-medium transition-all relative whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'permissions'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-1 sm:gap-2">
                <Lock className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Permissions</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('cards')}
              className={`px-3 sm:px-4 py-3 sm:py-4 font-medium transition-all relative whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'cards'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Business Cards</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('company')}
              className={`px-3 sm:px-4 py-3 sm:py-4 font-medium transition-all relative whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'company'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Company</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('departments')}
              className={`px-3 sm:px-4 py-3 sm:py-4 font-medium transition-all relative whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'departments'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Departments</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('integrations')}
              className={`px-3 sm:px-4 py-3 sm:py-4 font-medium transition-all relative whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'integrations'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Plug className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Integrations</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('salestax')}
              className={`px-3 sm:px-4 py-3 sm:py-4 font-medium transition-all relative whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'salestax'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Sales Tax</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('salestargets')}
              className={`px-3 sm:px-4 py-3 sm:py-4 font-medium transition-all relative whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'salestargets'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Sales Targets</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('suggestions')}
              className={`px-3 sm:px-4 py-3 sm:py-4 font-medium transition-all relative whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'suggestions'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Suggestions</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('contracts')}
              className={`px-3 sm:px-4 py-3 sm:py-4 font-medium transition-all relative whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'contracts'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Contracts</span>
              </div>
            </button>
            {jobModuleEnabled && (
              <button
                onClick={() => setActiveTab('products')}
                className={`px-3 sm:px-4 py-3 sm:py-4 font-medium transition-all relative whitespace-nowrap text-sm sm:text-base ${
                  activeTab === 'products'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <div className="flex items-center gap-1 sm:gap-2">
                  <Package className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span>Products</span>
                </div>
              </button>
            )}
            <button
              onClick={() => setActiveTab('catalog')}
              className={`px-3 sm:px-4 py-3 sm:py-4 font-medium transition-all relative whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'catalog'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-1 sm:gap-2">
                <Tags className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Catalog</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('rewards')}
              className={`px-3 sm:px-4 py-3 sm:py-4 font-medium transition-all relative whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'rewards'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Points & Rewards</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('priorities')}
              className={`px-3 sm:px-4 py-3 sm:py-4 font-medium transition-all relative whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'priorities'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Flag className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Priorities</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('emails')}
              className={`px-3 sm:px-4 py-3 sm:py-4 font-medium transition-all relative whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'emails'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Email Templates</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('messages')}
              className={`px-3 sm:px-4 py-3 sm:py-4 font-medium transition-all relative whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'messages'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Megaphone className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Company Messages</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('travel')}
              className={`px-3 sm:px-4 py-3 sm:py-4 font-medium transition-all relative whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'travel'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Travel Bonus</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('timeclock')}
              className={`px-3 sm:px-4 py-3 sm:py-4 font-medium transition-all relative whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'timeclock'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Time Clock</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('proposals')}
              className={`px-3 sm:px-4 py-3 sm:py-4 font-medium transition-all relative whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'proposals'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Proposals</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('labor')}
              className={`px-3 sm:px-4 py-3 sm:py-4 font-medium transition-all relative whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'labor'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Labor Phases</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('classes')}
              className={`px-3 sm:px-4 py-3 sm:py-4 font-medium transition-all relative whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'classes'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Tags className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Classes</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('orphaned')}
              className={`px-3 sm:px-4 py-3 sm:py-4 font-medium transition-all relative whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'orphaned'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Orphaned Records</span>
              </div>
            </button>
            {isAdminOrManager && (
              <button
                onClick={() => setActiveTab('kiosk')}
                className={`px-3 sm:px-4 py-3 sm:py-4 font-medium transition-all relative whitespace-nowrap text-sm sm:text-base ${
                  activeTab === 'kiosk'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Monitor className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span>Kiosk</span>
                </div>
              </button>
            )}
            {profile?.role === 'admin' && (
              <button
                onClick={() => setActiveTab('contact_import')}
                className={`px-3 sm:px-4 py-3 sm:py-4 font-medium transition-all relative whitespace-nowrap text-sm sm:text-base ${
                  activeTab === 'contact_import'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span>Import Customers</span>
                </div>
              </button>
            )}
          </nav>
        </div>

        <div className="p-4 sm:p-6 bg-white">
          <Suspense fallback={<SettingsLoadingFallback />}>
            {activeTab === 'users' && <UserManagement />}
            {activeTab === 'sessions' && <UserSessionsViewerEnhanced />}
            {activeTab === 'roles' && <RolePermissionManagement />}
            {activeTab === 'permissions' && <PermissionsManagement />}
            {activeTab === 'cards' && <BusinessCardManager />}
            {activeTab === 'company' && <CompanySettings />}
            {activeTab === 'departments' && <DepartmentManager />}
            {activeTab === 'integrations' && <IntegrationsSettings />}
            {activeTab === 'salestax' && <SalesTaxManagement />}
            {activeTab === 'salestargets' && <SalesTargetManagement />}
            {activeTab === 'suggestions' && <SuggestionManagement />}
            {activeTab === 'contracts' && <ContractManagement />}
            {activeTab === 'products' && jobModuleEnabled && <ProductsManagement />}
            {activeTab === 'catalog' && <CatalogManagement />}
            {activeTab === 'rewards' && <PointsAndRewards />}
            {activeTab === 'priorities' && <PriorityManagement />}
            {activeTab === 'emails' && <EmailTemplates />}
            {activeTab === 'messages' && <CompanyMessagesManagement />}
            {activeTab === 'travel' && <TravelBonusSettings />}
            {activeTab === 'timeclock' && <TimeClockManagement />}
            {activeTab === 'proposals' && <ProposalTemplateSettings />}
            {activeTab === 'labor' && <LaborPhaseManagement />}
            {activeTab === 'classes' && <ClassManager />}
            {activeTab === 'orphaned' && <OrphanedRecordsManager />}
            {activeTab === 'kiosk' && isAdminOrManager && <KioskSettings />}
            {activeTab === 'contact_import' && profile?.role === 'admin' && <ContactCSVImport />}
          </Suspense>
        </div>
      </div>
    </div>
  );
}
