import { useEffect } from 'react';
import { CheckCircle2, Clock3, Star } from 'lucide-react';
import type { AttendanceResult } from './AttendanceBadge';

export type DailyClockFlashState = {
  id: string;
  action: 'in' | 'out';
  pending?: boolean;
  attendance?: AttendanceResult;
};

export function DailyClockFlash({ value, onExpire }: { value: DailyClockFlashState | null; onExpire: (id: string) => void }) {
  useEffect(() => {
    if (!value) return;
    const timer = window.setTimeout(() => onExpire(value.id), 2800);
    return () => window.clearTimeout(timer);
  }, [value?.id, onExpire]);
  if (!value) return null;
  const { action, pending, attendance } = value;
  const points = !pending && action === 'in' ? attendance?.points_awarded : undefined;
  return (
    <div className="pointer-events-none fixed inset-x-4 top-20 z-[10000] flex justify-center" role="status" aria-live="polite" aria-atomic="true">
      <div className="w-full max-w-sm rounded-2xl border border-white/20 bg-gradient-to-br from-slate-900 via-blue-950 to-cyan-900 px-6 py-5 text-center text-white shadow-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95">
        {pending ? <Clock3 className="mx-auto mb-2 h-9 w-9 text-amber-300" aria-hidden="true" /> : <CheckCircle2 className="mx-auto mb-2 h-9 w-9 text-emerald-300" aria-hidden="true" />}
        <p className="text-xl font-extrabold tracking-wide">{pending ? 'CLOCK SAVED' : action === 'in' ? "YOU'RE IN!" : "YOU'RE OFF!"}</p>
        <p className="mt-1 text-sm text-blue-100">{pending ? 'Pending sync — points will be confirmed later.' : action === 'in' ? 'Have a great day!' : 'Enjoy the rest of your day!'}</p>
        {points !== undefined && (
          <p className="mt-3 flex items-center justify-center gap-1 text-sm font-semibold text-amber-200">
            <Star className="h-4 w-4" aria-hidden="true" /> {points > 0 ? '+' : ''}{points} {Math.abs(points) === 1 ? 'point' : 'points'} {points < 0 ? 'deducted' : 'earned'}
          </p>
        )}
      </div>
    </div>
  );
}
