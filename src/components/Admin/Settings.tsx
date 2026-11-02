import { WorkOrderSettings } from './WorkOrderSettings';
import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Settings as SettingsIcon, Users, Building2, CreditCard, Plug, Lightbulb, Package, Award, Flag, Mail, Shield, Lock, Receipt, Layers, FileText, Clock, Wrench, Tags, AlertCircle, Activity, Megaphone, MapPin, Target, Monitor, Upload } from 'lucide-react';
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

export function Settings({ initialTab, onNavigate }: { initialTab?: string; onNavigate?: (tab: string) => void } = {}) {
  const { companySettings, profile } = useAuth();
  const jobModuleEnabled = companySettings?.job_module_enabled ?? false;
  const isAdminOrManager = profile?.role === 'admin' || profile?.role === 'manager';
  type SettingsTab = 'messages' | 'users' | 'sessions' | 'permissions' | 'roles' | 'cards' | 'company' | 'departments' | 'integrations' | 'salestax' | 'salestargets' | 'suggestions' | 'products' | 'catalog' | 'rewards' | 'priorities' | 'emails' | 'travel' | 'contracts' | 'timeclock' | 'proposals' | 'labor' | 'classes' | 'orphaned' | 'kiosk' | 'contact_import' | 'work_orders';
  const validTabs: SettingsTab[] = ['messages', 'users', 'sessions', 'permissions', 'roles', 'cards', 'company', 'departments', 'integrations', 'salestax', 'salestargets', 'suggestions', 'products', 'catalog', 'rewards', 'priorities', 'emails', 'travel', 'contracts', 'timeclock', 'proposals', 'labor', 'classes', 'orphaned', 'kiosk', 'contact_import', 'work_orders'];
  const adminGroups = [
    { id: 'company', label: 'Company & Branding', description: 'Identity, offices, portal' },
    { id: 'people', label: 'People & Access', description: 'Team, roles, security' },
    { id: 'sales', label: 'Sales & Finance', description: 'Proposals, tax, targets' },
    { id: 'operations', label: 'Operations', description: 'Jobs, labor, time' },
    { id: 'communications', label: 'Communications', description: 'Email, messages, feedback' },
    { id: 'system', label: 'System & Tools', description: 'Integrations, catalogs' },
  ] as const;
  const adminItems: { id: SettingsTab; label: string; group: typeof adminGroups[number]['id']; visible?: boolean }[] = [
    { id: 'company', label: 'Company Settings', group: 'company' },
    { id: 'cards', label: 'Business Cards', group: 'company' },
    { id: 'users', label: 'Users', group: 'people' },
    { id: 'sessions', label: 'Sessions', group: 'people' },
    { id: 'roles', label: 'Roles', group: 'people' },
    { id: 'permissions', label: 'Permissions', group: 'people' },
    { id: 'departments', label: 'Departments', group: 'people' },
    { id: 'rewards', label: 'Points & Rewards', group: 'people' },
    { id: 'kiosk', label: 'Kiosk', group: 'people', visible: isAdminOrManager },
    { id: 'proposals', label: 'Proposal Templates', group: 'sales' },
    { id: 'salestax', label: 'Sales Tax', group: 'sales' },
    { id: 'salestargets', label: 'Sales Targets', group: 'sales' },
    { id: 'contracts', label: 'Contracts', group: 'sales' },
    { id: 'work_orders', label: 'Work Orders', group: 'operations', visible: profile?.role === 'admin' },
    { id: 'labor', label: 'Labor Phases', group: 'operations' },
    { id: 'timeclock', label: 'Time Clock', group: 'operations' },
    { id: 'travel', label: 'Travel Bonus', group: 'operations' },
    { id: 'priorities', label: 'Priorities', group: 'operations' },
    { id: 'emails', label: 'Email Templates', group: 'communications' },
    { id: 'messages', label: 'Company Messages', group: 'communications' },
    { id: 'suggestions', label: 'Suggestions', group: 'communications' },
    { id: 'integrations', label: 'Integrations', group: 'system' },
    { id: 'products', label: 'Products', group: 'system', visible: jobModuleEnabled },
    { id: 'catalog', label: 'Catalog', group: 'system' },
    { id: 'classes', label: 'Classes', group: 'system' },
    { id: 'contact_import', label: 'Contact Import', group: 'system', visible: profile?.role === 'admin' },
    { id: 'orphaned', label: 'Orphaned Records', group: 'system' },
  ];
  const getTabFromUrl = (): SettingsTab => {
    const tab = new URLSearchParams(window.location.search).get('settingsTab') as SettingsTab | null;
    return tab && validTabs.includes(tab) ? tab : ((initialTab as SettingsTab) || 'users');
  };
  const [activeTab, setActiveTabState] = useState<SettingsTab>(getTabFromUrl);
  const groupForTab = (tab: SettingsTab) => adminItems.find(item => item.id === tab)?.group || 'people';
  const [selectedGroup, setSelectedGroup] = useState<typeof adminGroups[number]['id']>(() => groupForTab(getTabFromUrl()));
  const [settingsSearch, setSettingsSearch] = useState('');
  const visibleSettings = adminItems.filter(item => item.visible !== false && (settingsSearch.trim()
    ? `${item.label} ${adminGroups.find(group => group.id === item.group)?.label || ''}`.toLowerCase().includes(settingsSearch.trim().toLowerCase())
    : item.group === selectedGroup));
  const setActiveTab = useCallback((tab: SettingsTab) => {
    setActiveTabState(tab);
    setSelectedGroup(groupForTab(tab));
    const url = new URL(window.location.href);
    if (tab === 'users') url.searchParams.delete('settingsTab');
    else url.searchParams.set('settingsTab', tab);
    window.history.pushState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  useEffect(() => {
    const handlePopState = () => { const tab = getTabFromUrl(); setActiveTabState(tab); setSelectedGroup(groupForTab(tab)); };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [initialTab]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-primary mb-1 flex items-center gap-2">
          <SettingsIcon className="w-6 h-6" />
          Settings
        </h2>
        <p className="text-muted">Manage users, business cards, and company information</p>
      </div>

      <div className="bg-canvas rounded-lg shadow-sm border-2 border-subtle">
        <div className="border-b border-subtle bg-canvas p-3 sm:p-5 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="block w-full sm:max-w-sm">
              <span className="sr-only">Search admin settings</span>
              <input type="search" value={settingsSearch} onChange={e => setSettingsSearch(e.target.value)}
                placeholder="Search admin settings…" className="w-full rounded-lg border border-subtle bg-canvas px-3 py-2 text-primary" />
            </label>
            <span className="text-xs text-muted">Choose a category, then a setting</span>
          </div>
          <nav aria-label="Admin categories" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {adminGroups.map(group => (
              <button key={group.id} type="button" onClick={() => { setSelectedGroup(group.id); setSettingsSearch(''); }}
                aria-pressed={selectedGroup === group.id}
                className={`rounded-xl border px-3 py-3 text-left transition-colors ${selectedGroup === group.id ? 'border-blue-500 bg-blue-500/10 text-primary' : 'border-subtle text-secondary hover:bg-surface-secondary hover:text-primary'}`}>
                <span className="block text-sm font-semibold">{group.label}</span>
                <span className="mt-1 block text-xs opacity-75">{group.description}</span>
              </button>
            ))}
          </nav>
          <nav aria-label="Admin settings" className="flex flex-wrap gap-2">
            {visibleSettings.map(item => (
              <button key={item.id} type="button" onClick={() => setActiveTab(item.id)}
                aria-current={activeTab === item.id ? 'page' : undefined}
                className={`rounded-lg border px-3 py-2 text-sm transition-colors ${activeTab === item.id ? 'border-blue-500 bg-blue-500/10 font-semibold text-primary' : 'border-subtle text-secondary hover:text-primary'}`}>
                {item.label}
              </button>
            ))}
            {visibleSettings.length === 0 && <p className="py-2 text-sm text-muted">No settings match your search.</p>}
          </nav>
        </div>

        <div className="p-4 sm:p-6 bg-canvas">
          <Suspense fallback={<SettingsLoadingFallback />}>
            {activeTab === 'work_orders' && <WorkOrderSettings />}
            {activeTab === 'users' && <UserManagement onNavigate={onNavigate} />}
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
