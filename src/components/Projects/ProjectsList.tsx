import React from 'react';
import { Calendar, Briefcase, Wrench, CheckCircle, Clock, FileText } from 'lucide-react';

interface ProjectsListProps {
  projects: any[];
  onSelectProject: (projectId: string) => void;
}

export default function ProjectsList({ projects, onSelectProject }: ProjectsListProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planning': return 'bg-infoSoft text-info border-blue-500/30';
      case 'active': return 'bg-successSoft text-success border-green-500/30';
      case 'complete': return 'bg-successSoft text-success border-teal-500/30';
      case 'closed': return 'bg-elevated text-secondary border-gray-500/30';
      default: return 'bg-elevated text-secondary border-gray-500/30';
    }
  };

  const getSalesOrderStatusColor = (status: string) => {
    switch (status) {
      case 'pending_deposit': return 'text-warning';
      case 'pending_po': return 'text-attention';
      case 'planning': return 'text-info';
      case 'active': return 'text-success';
      case 'complete': return 'text-success';
      case 'closed': return 'text-muted';
      default: return 'text-muted';
    }
  };

  function getWorkOrderStats(workOrders: any[]) {
    const total = workOrders?.length || 0;
    const completed = workOrders?.filter((wo: any) => wo.status === 'completed').length || 0;
    const inProgress = workOrders?.filter((wo: any) => wo.status === 'in_progress').length || 0;
    return { total, completed, inProgress };
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {projects.map((project) => {
        const woStats = getWorkOrderStats(project.work_orders);
        const customerName = project.contacts?.full_name || project.contacts?.contact_name || project.contacts?.company_name || 'Unknown Customer';
        const soOrderNumber = project.sales_orders?.order_number;
        const soContractTotal = project.sales_orders?.contract_total;
        const soStatus = project.sales_orders?.status;

        return (
          <button
            key={project.id}
            onClick={() => onSelectProject(project.id)}
            className="bg-surface border border-subtle rounded-xl p-5 text-left hover:border-strong hover:bg-surface/80 transition-all group"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0 pr-2">
                <div className="font-semibold text-primary text-base mb-0.5 group-hover:text-info transition-colors leading-snug">
                  {project.name}
                </div>
                <div className="text-xs text-muted font-mono">{project.project_number}</div>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border shrink-0 ${getStatusColor(project.status)}`}>
                {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
              </span>
            </div>

            {/* Customer */}
            <div className="flex items-center gap-2 text-sm text-secondary mb-2">
              <Briefcase size={14} className="text-muted shrink-0" />
              <span className="customer-link truncate">{customerName}</span>
            </div>

            {/* Sales Order Link */}
            {soOrderNumber && (
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <FileText size={13} className="text-muted shrink-0" />
                  <span>SO #{soOrderNumber}</span>
                  {soStatus && (
                    <span className={`capitalize text-xs ${getSalesOrderStatusColor(soStatus)}`}>
                      · {soStatus.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
                {soContractTotal && (
                  <span className="text-xs text-secondary font-medium tabular-nums">
                    ${soContractTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                )}
              </div>
            )}

            {/* Work Order Progress */}
            {woStats.total > 0 && (
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs text-muted mb-1.5">
                  <span className="flex items-center gap-1">
                    <Wrench size={12} />
                    Work Orders
                  </span>
                  <span className="tabular-nums">{woStats.completed}/{woStats.total} done</span>
                </div>
                <div className="w-full bg-elevated rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: woStats.total > 0 ? `${Math.round((woStats.completed / woStats.total) * 100)}%` : '0%' }}
                  />
                </div>
                {woStats.inProgress > 0 && (
                  <div className="flex items-center gap-1 text-xs text-info mt-1">
                    <Clock size={11} />
                    <span>{woStats.inProgress} in progress</span>
                  </div>
                )}
              </div>
            )}

            {/* Dates */}
            <div className="flex items-center gap-3 text-xs text-muted border-t border-subtle pt-3">
              {project.start_date && (
                <div className="flex items-center gap-1">
                  <Calendar size={12} />
                  <span>{new Date(project.start_date + 'T00:00:00').toLocaleDateString()}</span>
                </div>
              )}
              {project.target_completion_date && (
                <div className="flex items-center gap-1 ml-auto">
                  {project.status === 'complete' || project.status === 'closed'
                    ? <CheckCircle size={12} className="text-success" />
                    : <Calendar size={12} />
                  }
                  <span>Due {new Date(project.target_completion_date + 'T00:00:00').toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
