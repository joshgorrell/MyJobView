import { CalendarCheck, CheckCircle2, CreditCard, Copy, Send } from 'lucide-react';
import { QuickActionModal } from './QuickActionModal';
import type { FeedbackTheme } from '../../lib/feedback';

const gradients: Record<FeedbackTheme, string> = {
  blue: 'from-blue-600 to-blue-700', cyan: 'from-cyan-600 to-blue-700', violet: 'from-violet-600 to-purple-700',
  emerald: 'from-emerald-600 to-teal-700', amber: 'from-amber-600 to-orange-700', rose: 'from-rose-600 to-pink-700',
};
export function CompletionDialog({ title, theme = 'blue', kind = 'check', onContinue }: {
  title: string; theme?: FeedbackTheme; kind?: 'check' | 'calendar' | 'payment' | 'copy' | 'send'; onContinue: () => void;
}) {
  const Icon = { check: CheckCircle2, calendar: CalendarCheck, payment: CreditCard, copy: Copy, send: Send }[kind];
  return <QuickActionModal title={title} icon={<Icon className="h-5 w-5" />} accentColor={gradients[theme]}
    onClose={onContinue} showSuccess successMessage={title} successIcon={<Icon className="h-20 w-20" strokeWidth={1.5} />}>
    <div className="min-h-[260px]" />
  </QuickActionModal>;
}
