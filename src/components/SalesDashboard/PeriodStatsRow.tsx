import { Users, Phone, FileText, AlertCircle, XCircle } from 'lucide-react';
import type { PeriodStats } from '../../lib/salesDashboardTypes';

interface PeriodStatsRowProps {
  stats: PeriodStats;
}

export function PeriodStatsRow({ stats }: PeriodStatsRowProps) {
  const items = [
    { label: 'Contacts Added', value: stats.contactsAdded, icon: Users, color: 'text-blue-600 bg-blue-50' },
    { label: 'Connections Logged', value: stats.connectionsLogged, icon: Phone, color: 'text-teal-600 bg-teal-50' },
    { label: 'Proposals Created', value: stats.proposalsCreated, icon: FileText, color: 'text-green-600 bg-green-50' },
    { label: 'Expired', value: stats.proposalsExpired, icon: AlertCircle, color: 'text-amber-600 bg-amber-50' },
    { label: 'Declined', value: stats.proposalsDeclined, icon: XCircle, color: 'text-red-600 bg-red-50' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${item.color} mb-2`}>
              <Icon className="w-4 h-4" />
            </div>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">{item.value}</p>
            <p className="text-xs text-gray-500">{item.label}</p>
          </div>
        );
      })}
    </div>
  );
}
