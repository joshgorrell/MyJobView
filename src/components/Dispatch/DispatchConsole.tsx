import { DispatchCustomerComms } from './DispatchCustomerComms';
import { WorkOrdersAttention, WorkOrdersAttentionBanner } from './WorkOrdersAttention';
import { useState, useEffect, Suspense, lazy } from 'react';
import {
  LayoutDashboard,
  MapPin,
  BarChart3,
  CalendarDays,
} from 'lucide-react';

const DispatchDashboard = lazy(() => import('./DispatchDashboard').then(m => ({ default: m.DispatchDashboard })));
const TechMap = lazy(() => import('./TechMap').then(m => ({ default: m.TechMap })));
const TechStatusDashboard = lazy(() => import('./TechStatusDashboard').then(m => ({ default: m.TechStatusDashboard })));
const JobStatusPanel = lazy(() => import('./JobStatusPanel').then(m => ({ default: m.JobStatusPanel })));
const JobAcceptanceQueue = lazy(() => import('./JobAcceptanceQueue').then(m => ({ default: m.JobAcceptanceQueue })));
const TechSkillsFilter = lazy(() => import('./TechSkillsFilter').then(m => ({ default: m.TechSkillsFilter })));
const TechStats = lazy(() => import('../Production/TechStats').then(m => ({ default: m.TechStats })));
const ResourceDayView = lazy(() => import('./ResourceDayView').then(m => ({ default: m.ResourceDayView })));

type TabKey = 'communications' | 'attention' | 'overview' | 'schedule' | 'map' | 'tech_status' | 'job_status' | 'job_acceptance' | 'tech_skills' | 'tech_stats';

interface TabDef {
  key: TabKey;
  label: string;
  icon: typeof LayoutDashboard;
}

const TABS: TabDef[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'schedule', label: 'Schedule', icon: CalendarDays },
  { key: 'map', label: 'Live Map', icon: MapPin },
  { key: 'tech_stats', label: 'Tech Stats', icon: BarChart3 },
];

const PRIMARY_TABS: TabKey[] = TABS.map(tab => tab.key);
const normalizeTab = (tab: TabKey): TabKey => {
  if (tab === 'tech_status') return 'map';
  if (tab === 'attention' || tab === 'job_status' || tab === 'job_acceptance' || tab === 'tech_skills' || tab === 'communications') return 'overview';
  return tab;
};

function TabFallback() {
  return (
    <div className="flex items-center justify-center min-h-[300px]">
      <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" />
    </div>
  );
}

interface DispatchConsoleProps {
  onNavigate?: (tab: string) => void;
  initialTab?: TabKey;
}

export function DispatchConsole({ onNavigate, initialTab }: DispatchConsoleProps) {
  const [activeTab, setActiveTab] = useState<TabKey>(normalizeTab(initialTab || 'overview'));
  const [showOperations, setShowOperations] = useState(false);
  const [operationTab, setOperationTab] = useState<TabKey>('attention');

  useEffect(() => {
    if (initialTab) { setActiveTab(normalizeTab(initialTab)); if (!PRIMARY_TABS.includes(initialTab)) { setOperationTab(initialTab); setShowOperations(true); } return; }
    const stored = localStorage.getItem('dispatch_console_tab') as TabKey | null;
    if (!initialTab && stored) {
      setActiveTab(normalizeTab(stored));
    }
  }, [initialTab]);

  useEffect(() => {
    localStorage.setItem('dispatch_console_tab', activeTab);
  }, [activeTab]);

  return (
    <div className="space-y-4">
      {/* Tab Bar */}
      <div className="flex flex-wrap items-center gap-1 pb-1" aria-label="Dispatch sections">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-surface text-muted hover:bg-elevated hover:text-primary'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Core operational views remain distinct; secondary queues are accessible on demand. */}
      <Suspense fallback={<TabFallback />}>
        {activeTab === 'overview' && (
          <div className="space-y-3">
            <WorkOrdersAttentionBanner onOpen={() => { setOperationTab('attention'); setShowOperations(true); }} />
            <DispatchDashboard onNavigate={onNavigate} />
            <div className="rounded-lg border border-subtle bg-surface p-3">
              <button type="button" className="text-sm font-medium text-primary hover:underline" aria-expanded={showOperations} onClick={() => setShowOperations(!showOperations)}>
                {showOperations ? 'Hide additional operations' : 'Additional operations and queues'}
              </button>
              {showOperations && (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {([
                      ['attention', 'Needs Attention'],
                      ['job_status', 'Job Status'],
                      ['job_acceptance', 'Acceptance Queue'],
                      ['tech_skills', 'Tech Skills'],
                      ['communications', 'Customer Communications'],
                    ] as const).map(([key, label]) => (
                      <button key={key} type="button" onClick={() => setOperationTab(key)}
                        aria-pressed={operationTab === key}
                        className={`rounded-md px-3 py-1.5 text-sm ${operationTab === key ? 'bg-blue-600 text-white' : 'bg-elevated text-primary'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {operationTab === 'attention' && <WorkOrdersAttention />}
                  {operationTab === 'job_status' && <JobStatusPanel />}
                  {operationTab === 'job_acceptance' && <JobAcceptanceQueue />}
                  {operationTab === 'tech_skills' && <TechSkillsFilter onTechnicianSelect={() => {}} />}
                  {operationTab === 'communications' && <DispatchCustomerComms />}
                </div>
              )}
            </div>
          </div>
        )}
        {activeTab === 'schedule' && <ResourceDayView onNavigate={onNavigate} />}
        {activeTab === 'map' && (
          <div className="space-y-3">
            <TechMap />
            <details className="rounded-lg border border-subtle bg-surface p-3">
              <summary className="cursor-pointer text-sm font-medium">Off duty & approved leave</summary>
              <div className="mt-3"><TechStatusDashboard inactiveOnly /></div>
            </details>
          </div>
        )}
        {activeTab === 'tech_stats' && <TechStats onNavigate={onNavigate} />}
      </Suspense>
    </div>
  );
}
