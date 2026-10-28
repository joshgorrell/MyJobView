import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useDepartments } from '../../contexts/DepartmentContext';
import { markPunchlistSeen } from '../../hooks/usePunchlistUnseenCount';
import { TestTuneProjectAdjustments } from './TestTuneProjectAdjustments';
import { PunchlistInviteManager } from './PunchlistInviteManager';

export function PunchlistAdminDashboard({ onOpenSalesOrder }: { onOpenSalesOrder?: (id: string) => void }) {
  const { profile } = useAuth();
  const { hasModuleAccess } = useDepartments();
  const [view, setView] = useState('feed');
  useEffect(() => { if (profile?.id) void markPunchlistSeen(profile.id); }, [profile?.id]);
  return <div className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-lg font-semibold text-primary">Test &amp; Tune</h1>
      {hasModuleAccess('service_requests') && <a href="/service-requests" className="min-h-11 inline-flex items-center px-3 text-sm text-info">Service Requests →</a>}
    </div>
    <select aria-label="Test and Tune view" value={view} onChange={e => setView(e.target.value)} className="min-h-11 rounded-lg border border-subtle bg-surface px-3 text-primary">
      <option value="feed">Punchlist Feed</option><option value="access">Customers &amp; Access</option>
    </select>
    {view === 'feed' ? <TestTuneProjectAdjustments canViewServiceRequests={hasModuleAccess('service_requests')} /> : <PunchlistInviteManager onOpenSalesOrder={onOpenSalesOrder} onViewCustomerTasks={(contactId, _name, status) => {
      const params = new URLSearchParams({ contactId, history: '1', tuneStatus: status });
      window.location.assign(`/test-and-tune?${params}`);
    }} />}
  </div>;
}
