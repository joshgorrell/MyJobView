import { useState, useEffect, Suspense, lazy } from 'react';
import {
  LayoutDashboard,
  MapPin,
  Users,
  ClipboardList,
  CheckSquare,
  Award,
  BarChart3,
  Briefcase,
  TrendingUp,
} from 'lucide-react';

const DispatchDashboard = lazy(() => import('./DispatchDashboard').then(m => ({ default: m.DispatchDashboard })));
const TechMap = lazy(() => import('./TechMap').then(m => ({ default: m.TechMap })));
const TechStatusDashboard = lazy(() => import('./TechStatusDashboard').then(m => ({ default: m.TechStatusDashboard })));
const JobStatusPanel = lazy(() => import('./JobStatusPanel').then(m => ({ default: m.JobStatusPanel })));
const JobAcceptanceQueue = lazy(() => import('./JobAcceptanceQueue').then(m => ({ default: m.JobAcceptanceQueue })));
const TechSkillsFilter = lazy(() => import('./TechSkillsFilter').then(m => ({ default: m.TechSkillsFilter })));
const TechStats = lazy(() => import('../Production/TechStats').then(m => ({ default: m.TechStats })));

type TabKey = 'overview' | 'map' | 'tech_status' | 'job_status' | 'job_acceptance' | 'tech_skills' | 'tech_stats';

interface TabDef {
  key: TabKey;
  label: string;
  icon: typeof LayoutDashboard;
}

const TABS: TabDef[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'map', label: 'Live Map', icon: MapPin },
  { key: 'tech_status', label: 'Tech Status', icon: Users },
  { key: 'job_status', label: 'Job Status', icon: ClipboardList },
  { key: 'job_acceptance', label: 'Acceptance Queue', icon: CheckSquare },
  { key: 'tech_skills', label: 'Tech Skills', icon: Award },
  { key: 'tech_stats', label: 'Tech Stats', icon: BarChart3 },
];

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
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab || 'overview');

  useEffect(() => {
    const stored = localStorage.getItem('dispatch_console_tab') as TabKey | null;
    if (stored && TABS.some(t => t.key === stored)) {
      setActiveTab(stored);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('dispatch_console_tab', activeTab);
  }, [activeTab]);

  return (
    <div className="space-y-4">
      {/* Tab Bar */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <Suspense fallback={<TabFallback />}>
        {activeTab === 'overview' && <DispatchDashboard onNavigate={onNavigate} />}
        {activeTab === 'map' && <TechMap />}
        {activeTab === 'tech_status' && <TechStatusDashboard />}
        {activeTab === 'job_status' && <JobStatusPanel />}
        {activeTab === 'job_acceptance' && <JobAcceptanceQueue />}
        {activeTab === 'tech_skills' && <TechSkillsFilter onTechnicianSelect={() => {}} />}
        {activeTab === 'tech_stats' && <TechStats onNavigate={onNavigate} />}
      </Suspense>
    </div>
  );
}
