import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { ProposalActivityPanel } from './ProposalActivityPanel';

export function ProposalActivityDialog({ proposalId, onClose }: { proposalId: string; onClose: () => void }) {
  const closeAction = useRef(onClose);
  closeAction.current = onClose;
  const close = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    close.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAction.current();
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),[tabindex="0"]') || []);
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, []);
  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/60 sm:items-center sm:p-4">
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="proposal-activity-title" className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface shadow-2xl sm:max-w-4xl sm:rounded-xl">
        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-subtle px-4 py-3">
          <h2 id="proposal-activity-title" className="font-bold text-primary">Activity</h2>
          <button ref={close} onClick={onClose} aria-label="Close Activity" className="rounded-lg p-2 text-muted hover:bg-elevated"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5"><ProposalActivityPanel proposalId={proposalId} /></div>
      </div>
    </div>
  );
}
