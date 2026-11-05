import { Timer } from 'lucide-react';
import { EmployeeTimeClock } from '../Technician/EmployeeTimeClock';
import { QuickActionModal } from '../Shared/QuickActionModal';

/**
 * The header Time Clock is a window into the canonical employee clock.
 * Keep the Daily Clock / Job Clock / My Time workflows in EmployeeTimeClock
 * rather than maintaining a second set of timers, requests, and history.
 */
export function DailyLaunchpad({ onClose, onNavigate }: {
  onClose: () => void;
  onNavigate?: (tab: string, params?: Record<string, string>) => void;
}) {
  const navigate = (page: string, params?: Record<string, string>) => {
    onClose();
    onNavigate?.(page, params);
  };

  return (
    <QuickActionModal
      title="Time Clock"
      subtitle="Daily Clock, Job Clock & My Time"
      icon={<Timer className="h-5 w-5" />}
      accentColor="from-cyan-700 to-blue-800"
      onClose={onClose}
    >
      <div className="max-h-[calc(90svh-7rem)] overflow-y-auto overscroll-contain p-3 sm:p-4">
        <EmployeeTimeClock
          onNavigate={page => navigate(page)}
          onOpenWorkOrder={workOrderId => navigate('work_orders', { workOrderId })}
        />
      </div>
    </QuickActionModal>
  );
}

export function DailyLaunchpadButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button onClick={onOpen} aria-label="Open Time Clock" title="Time Clock"
      className="w-11 h-11 md:w-9 md:h-9 flex shrink-0 items-center justify-center rounded-lg text-secondary hover:bg-elevated">
      <Timer className="w-5 h-5" />
    </button>
  );
}
