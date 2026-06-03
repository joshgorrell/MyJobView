import { useState, useEffect } from 'react';
import { Clock, Briefcase } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { TimeClockModal } from './TimeClockModal';

interface TimeButtonProps {
  onNavigate?: (tab: string, params?: Record<string, string>) => void;
}

interface ClockStatus {
  isClockedIn: boolean;
  clockInTime: string | null;
  isOnBreak: boolean;
  activeJobId: string | null;
  activeJobNumber: string | null;
  activeJobClockIn: string | null;
}

export function TimeButton({ onNavigate }: TimeButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const { profile } = useAuth();
  const [clockStatus, setClockStatus] = useState<ClockStatus>({
    isClockedIn: false,
    clockInTime: null,
    isOnBreak: false,
    activeJobId: null,
    activeJobNumber: null,
    activeJobClockIn: null,
  });
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    if (profile?.requires_daily_clock) {
      checkClockStatus();

      const timer = setInterval(() => {
        setCurrentTime(new Date());
      }, 1000);

      const channel = supabase
        .channel('time-button-status')
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'daily_clock_entries',
          filter: `technician_id=eq.${profile.id}`
        }, checkClockStatus)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'daily_clock_breaks'
        }, checkClockStatus)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'time_entries',
          filter: `technician_id=eq.${profile.id}`
        }, checkClockStatus)
        .subscribe();

      return () => {
        clearInterval(timer);
        channel.unsubscribe();
      };
    }
  }, [profile]);

  async function checkClockStatus() {
    if (!profile) return;
    try {
      const today = new Date().toISOString().split('T')[0];

      const { data: dailyEntry } = await supabase
        .from('daily_clock_entries')
        .select('id, clock_in, clock_out')
        .eq('technician_id', profile.id)
        .eq('entry_date', today)
        .is('clock_out', null)
        .maybeSingle();

      let isOnBreak = false;
      if (dailyEntry) {
        const { data: breakData } = await supabase
          .from('daily_clock_breaks')
          .select('id')
          .eq('daily_clock_entry_id', dailyEntry.id)
          .is('break_end', null)
          .maybeSingle();
        isOnBreak = !!breakData;
      }

      const { data: activeJobEntry } = await supabase
        .from('time_entries')
        .select(`
          id, clock_in,
          work_order:work_orders!time_entries_work_order_id_fkey(id, work_order_number)
        `)
        .eq('technician_id', profile.id)
        .eq('entry_date', today)
        .is('clock_out', null)
        .not('work_order_id', 'is', null)
        .order('clock_in', { ascending: false })
        .limit(1)
        .maybeSingle();

      const wo = activeJobEntry?.work_order as any;

      setClockStatus({
        isClockedIn: !!dailyEntry,
        clockInTime: dailyEntry?.clock_in || null,
        isOnBreak,
        activeJobId: wo?.id || null,
        activeJobNumber: wo?.work_order_number || null,
        activeJobClockIn: activeJobEntry?.clock_in || null,
      });
    } catch (error) {
      console.error('Error checking clock status:', error);
    }
  }

  if (!profile?.requires_daily_clock) return null;

  const getElapsedTime = (startTime: string) => {
    const diffMs = currentTime.getTime() - new Date(startTime).getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const isOnBreak = clockStatus.isOnBreak;
  const hasActiveJob = !!clockStatus.activeJobId;

  const buttonColor = isOnBreak
    ? 'bg-amber-500 hover:bg-amber-600'
    : hasActiveJob
    ? 'bg-blue-600 hover:bg-blue-700'
    : clockStatus.isClockedIn
    ? 'bg-green-600 hover:bg-green-700'
    : 'bg-red-600 hover:bg-red-700';

  const statusLabel = isOnBreak
    ? 'On Break'
    : hasActiveJob
    ? clockStatus.activeJobNumber
    : clockStatus.isClockedIn
    ? 'Clocked In'
    : 'Clocked Out';

  const elapsedLabel = isOnBreak
    ? null
    : hasActiveJob && clockStatus.activeJobClockIn
    ? getElapsedTime(clockStatus.activeJobClockIn)
    : clockStatus.isClockedIn && clockStatus.clockInTime
    ? getElapsedTime(clockStatus.clockInTime)
    : null;

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className={`px-3 py-2 rounded-lg transition-all font-medium flex items-center gap-2 shadow-lg ${buttonColor} text-white`}
        title="Time Clock"
      >
        {hasActiveJob && !isOnBreak ? (
          <Briefcase className="w-4 h-4 flex-shrink-0" />
        ) : (
          <Clock className="w-4 h-4 flex-shrink-0" />
        )}
        <div className="hidden sm:flex flex-col items-start">
          <span className="text-xs leading-none font-semibold truncate max-w-[80px]">{statusLabel}</span>
          {elapsedLabel && (
            <span className="text-xs opacity-75 leading-none">{elapsedLabel}</span>
          )}
        </div>
      </button>

      <TimeClockModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onNavigate={(tab, params) => {
          setShowModal(false);
          if (onNavigate) onNavigate(tab, params);
        }}
      />
    </>
  );
}
