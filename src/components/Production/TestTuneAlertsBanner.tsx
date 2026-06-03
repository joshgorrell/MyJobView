import { useState } from 'react';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  TrendingDown,
  X,
  Bell,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import type { TestTuneProject } from '../../lib/testTunePermissions';
import type { TestTunePermissions } from '../../lib/testTunePermissions';

interface PendingBonus {
  id: string;
  contact_name: string;
  order_number: string;
  total_bonus_amount: number;
}

interface TestTuneAlertsBannerProps {
  projects: TestTuneProject[];
  permissions: TestTunePermissions;
  pendingBonuses?: PendingBonus[];
  onProjectClick?: (projectId: string) => void;
}

type AlertType = 'expiring_soon' | 'over_budget' | 'pending_bonus';

interface Alert {
  id: string;
  type: AlertType;
  title: string;
  description: string;
  projectId?: string;
  severity: 'critical' | 'warning' | 'info';
}

export function TestTuneAlertsBanner({
  projects,
  permissions,
  pendingBonuses = [],
  onProjectClick
}: TestTuneAlertsBannerProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(true);

  const alerts: Alert[] = [];

  // Expiring in 7 days or fewer
  const expiringSoon = projects.filter(p => p.days_remaining > 0 && p.days_remaining <= 7);
  expiringSoon.forEach(p => {
    const alertId = `expiring_${p.id}`;
    if (!dismissed.has(alertId)) {
      alerts.push({
        id: alertId,
        type: 'expiring_soon',
        title: `${p.days_remaining} day${p.days_remaining === 1 ? '' : 's'} left — ${p.contact_name}`,
        description: `Order #${p.order_number} ends soon. ${
          p.hours_remaining > 0
            ? `${p.hours_remaining.toFixed(1)}h below target — bonus eligible!`
            : p.hours_remaining < 0
            ? `${Math.abs(p.hours_remaining).toFixed(1)}h over target.`
            : 'Exactly on target.'
        }`,
        projectId: p.id,
        severity: p.days_remaining <= 3 ? 'critical' : 'warning'
      });
    }
  });

  // Over budget projects
  const overBudget = projects.filter(p => p.status_indicator === 'over' && p.days_remaining > 0);
  overBudget.forEach(p => {
    const alertId = `over_${p.id}`;
    if (!dismissed.has(alertId)) {
      alerts.push({
        id: alertId,
        type: 'over_budget',
        title: `Over budget — ${p.contact_name}`,
        description: `Order #${p.order_number} is at ${p.percentage_of_target.toFixed(0)}% of labor target. ${Math.abs(p.hours_remaining).toFixed(1)}h over.`,
        projectId: p.id,
        severity: 'critical'
      });
    }
  });

  // Pending bonus approvals (managers/admins)
  if (permissions.can_approve_bonuses && pendingBonuses.length > 0) {
    const alertId = 'pending_bonuses';
    if (!dismissed.has(alertId)) {
      alerts.push({
        id: alertId,
        type: 'pending_bonus',
        title: `${pendingBonuses.length} bonus${pendingBonuses.length !== 1 ? 'es' : ''} awaiting your approval`,
        description: `Total pending: $${pendingBonuses.reduce((s, b) => s + b.total_bonus_amount, 0).toLocaleString()}. Review and approve in Test & Tune Settings.`,
        severity: 'info'
      });
    }
  }

  const visibleAlerts = alerts.filter(a => !dismissed.has(a.id));

  if (visibleAlerts.length === 0) return null;

  const criticalCount = visibleAlerts.filter(a => a.severity === 'critical').length;
  const warningCount = visibleAlerts.filter(a => a.severity === 'warning').length;

  const getAlertStyle = (severity: Alert['severity']) => {
    switch (severity) {
      case 'critical': return {
        border: 'border-l-4 border-l-red-500 bg-red-50',
        icon: <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />,
        title: 'text-red-900',
        desc: 'text-red-700'
      };
      case 'warning': return {
        border: 'border-l-4 border-l-amber-400 bg-amber-50',
        icon: <Clock className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />,
        title: 'text-amber-900',
        desc: 'text-amber-700'
      };
      case 'info': return {
        border: 'border-l-4 border-l-blue-400 bg-blue-50',
        icon: <CheckCircle2 className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />,
        title: 'text-blue-900',
        desc: 'text-blue-700'
      };
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-gray-600" />
          <span className="text-sm font-semibold text-gray-900">Alerts &amp; Action Items</span>
          <div className="flex items-center gap-1.5">
            {criticalCount > 0 && (
              <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full">
                {criticalCount} critical
              </span>
            )}
            {warningCount > 0 && (
              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-bold rounded-full">
                {warningCount} warning
              </span>
            )}
            {visibleAlerts.filter(a => a.severity === 'info').length > 0 && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
                {visibleAlerts.filter(a => a.severity === 'info').length} info
              </span>
            )}
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-gray-100 divide-y divide-gray-100">
          {visibleAlerts.map(alert => {
            const style = getAlertStyle(alert.severity);
            return (
              <div
                key={alert.id}
                className={`flex items-start gap-3 px-4 py-3 ${style.border} ${
                  alert.projectId && onProjectClick ? 'cursor-pointer hover:brightness-95' : ''
                }`}
                onClick={() => alert.projectId && onProjectClick?.(alert.projectId)}
              >
                {style.icon}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${style.title}`}>{alert.title}</p>
                  <p className={`text-xs mt-0.5 ${style.desc}`}>{alert.description}</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDismissed(prev => new Set([...prev, alert.id]));
                  }}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded flex-shrink-0"
                  title="Dismiss"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
