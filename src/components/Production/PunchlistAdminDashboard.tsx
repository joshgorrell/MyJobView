import { useEffect, useState } from 'react';
import { ClipboardList, Users, ArrowUpRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useDepartments } from '../../contexts/DepartmentContext';
import { markPunchlistSeen } from '../../hooks/usePunchlistUnseenCount';
import { TestTuneProjectAdjustments } from './TestTuneProjectAdjustments';
import { PunchlistInviteManager } from './PunchlistInviteManager';

type WorkspaceView = 'feed' | 'access';

export function PunchlistAdminDashboard({ onOpenSalesOrder }: { onOpenSalesOrder?: (id: string) => void }) {
  const { profile } = useAuth();
  const { hasModuleAccess } = useDepartments();
  const [view, setView] = useState<WorkspaceView>('feed');

  useEffect(() => { if (profile?.id) void markPunchlistSeen(profile.id); }, [profile?.id]);

  const tabs: Array<{ id: WorkspaceView; label: string; description: string; icon: typeof ClipboardList }> = [
    { id: 'feed', label: 'Tasks & Adjustments', description: 'Review and coordinate 90-day requests', icon: ClipboardList },
    { id: 'access', label: 'Customers & Access', description: 'Manage invitations and customer access', icon: Users },
  ];

  return (
    <section className="min-w-0 w-full max-w-full space-y-5 pb-6">
      <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-secondary">Production · Customer Care</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-primary sm:text-3xl">Test &amp; Tune</h1>
          <p className="mt-1 max-w-2xl text-sm text-secondary">
            Track post-completion adjustments, coordinate follow-up work, and manage customer access.
          </p>
        </div>
        {hasModuleAccess('service_requests') && (
          <a
            href="/service-requests"
            className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-subtle bg-surface px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-surface-hover sm:w-auto"
          >
            Service Requests <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </a>
        )}
      </header>

      <nav aria-label="Test and Tune views" className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
        {tabs.map(({ id, label, description, icon: Icon }) => {
          const active = view === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-16 min-w-0 items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${active ? 'border-blue-500 bg-blue-500/10 text-primary' : 'border-subtle bg-surface text-secondary hover:bg-surface-hover'}`}
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-blue-500/15 text-blue-600' : 'bg-surface text-secondary'}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{label}</span>
                <span className="mt-0.5 block text-xs opacity-80">{description}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="min-w-0 max-w-full">
        {view === 'feed'
          ? <TestTuneProjectAdjustments canViewServiceRequests={hasModuleAccess('service_requests')} />
          : <PunchlistInviteManager onOpenSalesOrder={onOpenSalesOrder} onViewCustomerTasks={(contactId, _name, status) => {
              const params = new URLSearchParams({ contactId, history: '1', tuneStatus: status });
              window.location.assign(`/test-and-tune?${params}`);
            }} />}
      </div>
    </section>
  );
}
