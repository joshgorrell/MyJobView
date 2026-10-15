import { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, Trash2, Info, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  variant?: 'danger' | 'warning' | 'neutral';
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  variant = 'danger',
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const titleId = useId();
  const messageId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!isOpen) return;
    setError('');
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancel.current?.focus();
    return () => { document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [isOpen]);
  async function confirm() {
    if (busy.current) return;
    busy.current = true; setPending(true); setError('');
    try { await onConfirm(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to complete this action. Please try again.'); }
    finally { busy.current = false; setPending(false); }
  }
  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      icon: Trash2,
      iconClass: 'text-danger',
      iconBg: 'bg-red-500/10',
      confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
      defaultLabel: 'Delete',
    },
    warning: {
      icon: AlertTriangle,
      iconClass: 'text-warning',
      iconBg: 'bg-amber-500/10',
      confirmClass: 'bg-amber-700 hover:bg-amber-800 text-white',
      defaultLabel: 'Confirm',
    },
    neutral: {
      icon: Info,
      iconClass: 'text-info',
      iconBg: 'bg-blue-500/10',
      confirmClass: 'bg-blue-600 hover:bg-blue-700 text-white',
      defaultLabel: 'Confirm',
    },
  };

  const styles = variantStyles[variant];
  const Icon = styles.icon;
  const label = confirmLabel ?? styles.defaultLabel;

  return (
    <>
      <style>{`
        @keyframes confirmFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes confirmSlideUp {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .confirm-backdrop { animation: confirmFadeIn 0.15s ease-out; }
        .confirm-panel { animation: confirmSlideUp 0.15s ease-out; }
        @media (prefers-reduced-motion: reduce) { .confirm-backdrop, .confirm-panel { animation: none; } }
      `}</style>
      <div
        className="confirm-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
        onClick={(e) => { if (e.target === e.currentTarget && !pending) onCancel(); }}
      >
        <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={messageId} aria-busy={pending}
          onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!pending) onCancel(); }
            if (event.key !== 'Tab') return;
            const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled])') || []);
            const first = controls[0]; const last = controls[controls.length - 1];
            if (!first) { event.preventDefault(); return; }
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
          }} className="confirm-panel bg-surface border border-subtle rounded-xl shadow-2xl w-full max-w-sm">
          <div className="flex items-start justify-between p-5 pb-4">
            <div className="flex items-start gap-3">
              <div className={`flex-shrink-0 p-2 rounded-lg ${styles.iconBg}`}>
                <Icon className={`w-5 h-5 ${styles.iconClass}`} />
              </div>
              <div>
                <h3 id={titleId} className="text-base font-semibold text-primary">{title}</h3>
                <p id={messageId} className="text-sm text-muted mt-1">{message}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onCancel}
              disabled={pending}
              aria-label="Close confirmation"
              className="flex-shrink-0 text-muted hover:text-secondary transition-colors ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {error && <p role="alert" className="px-5 pb-3 text-sm text-danger">{error}</p>}
          <div className="flex gap-2 px-5 pb-5 justify-end">
            <button
              ref={cancel} type="button"
              onClick={onCancel}
              disabled={pending}
              className="min-h-11 px-4 py-2 text-sm font-medium text-secondary bg-elevated hover:bg-elevated rounded-lg transition-colors"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={pending}
              className={`min-h-11 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${styles.confirmClass}`}
            >
              {pending ? 'Working…' : label}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
