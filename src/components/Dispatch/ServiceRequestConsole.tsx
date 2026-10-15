import { useState, Suspense, lazy } from 'react';
import { ListTodo, BarChart3, Inbox, Plus } from 'lucide-react';

const ServiceRequestQueue = lazy(() => import('./ServiceRequestQueue').then(m => ({ default: m.ServiceRequestQueue })));
const ManualIntake = lazy(() => import('./ManualIntake').then(m => ({ default: m.ManualIntake })));
const SmartIntakeHistory = lazy(() => import('./SmartIntakeHistory').then(m => ({ default: m.SmartIntakeHistory })));
const ServiceRequestAnalytics = lazy(() => import('./ServiceRequestAnalytics').then(m => ({ default: m.ServiceRequestAnalytics })));

type TabKey = 'queue' | 'analytics' | 'intake';

const TABS = [
  { key: 'queue' as TabKey, label: 'Queue', icon: ListTodo },
  { key: 'analytics' as TabKey, label: 'Analytics', icon: BarChart3 },
  ...(import.meta.env.VITE_SMART_INTAKE_UI_ENABLED === 'true' ? [{ key: 'intake' as TabKey, label: 'Smart Intake', icon: Inbox }] : []),
];

function TabFallback() {
  return (
    <div className="flex items-center justify-center min-h-[300px]">
      <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" />
    </div>
  );
}

interface ServiceRequestConsoleProps {
  initialTab?: TabKey;
}

export function ServiceRequestConsole({ initialTab }: ServiceRequestConsoleProps) {
  const [manualOpen, setManualOpen] = useState(false);
  const [queueRevision, setQueueRevision] = useState(0);
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab && TABS.some(tab => tab.key === initialTab) ? initialTab : 'queue');

  return (
    <div className="w-full max-w-full min-w-0 space-y-2 sm:space-y-4">
      <div className="flex items-center gap-1 min-w-0 max-w-full pb-1">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 min-h-11 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
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

      {activeTab === 'intake' && <button type="button" onClick={() => setManualOpen(value => !value)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500"><Plus className="h-4 w-4" /> New Intake</button>}
      <Suspense fallback={<TabFallback />}>
        {activeTab === 'intake' && manualOpen && <ManualIntake onClose={() => setManualOpen(false)} onCreated={() => { setManualOpen(false); setQueueRevision(value => value + 1); setActiveTab('queue'); }} />}
        {activeTab === 'queue' && <ServiceRequestQueue key={queueRevision} />}
        {activeTab === 'analytics' && <ServiceRequestAnalytics />}
        {activeTab === 'intake' && <SmartIntakeHistory />}
      </Suspense>
    </div>
  );
}
