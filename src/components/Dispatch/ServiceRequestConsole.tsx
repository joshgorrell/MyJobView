import { useState, Suspense, lazy } from 'react';
import { ListTodo, BarChart3 } from 'lucide-react';

const ServiceRequestQueue = lazy(() => import('./ServiceRequestQueue').then(m => ({ default: m.ServiceRequestQueue })));
const ServiceRequestAnalytics = lazy(() => import('./ServiceRequestAnalytics').then(m => ({ default: m.ServiceRequestAnalytics })));

type TabKey = 'queue' | 'analytics';

const TABS = [
  { key: 'queue' as TabKey, label: 'Queue', icon: ListTodo },
  { key: 'analytics' as TabKey, label: 'Analytics', icon: BarChart3 },
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
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab || 'queue');

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

      <Suspense fallback={<TabFallback />}>
        {activeTab === 'queue' && <ServiceRequestQueue />}
        {activeTab === 'analytics' && <ServiceRequestAnalytics />}
      </Suspense>
    </div>
  );
}
