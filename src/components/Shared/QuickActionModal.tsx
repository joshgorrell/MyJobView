import { ReactNode, useEffect, useRef, useState, useId } from 'react';
import { X, CheckCircle2 } from 'lucide-react';

interface QuickActionModalProps {
  stableHeight?: boolean;
  scrollBody?: boolean;
  title: string;
  subtitle?: string;
  icon: ReactNode;
  accentColor?: string;
  onClose: () => void;
  children: ReactNode;
  showSuccess?: boolean;
  successMessage?: string;
}

export function QuickActionModal({
  stableHeight = false,
  scrollBody = true,
  title,
  subtitle,
  icon,
  accentColor = 'from-blue-600 to-blue-700',
  onClose,
  children,
  showSuccess = false,
  successMessage = 'Created!',
}: QuickActionModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const subtitleId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<{ top: number; height: number } | null>(null);

  useEffect(() => {
    if (!window.visualViewport) return;
    const visibleViewport = window.visualViewport;
    const update = () => setViewport({ top: visibleViewport.offsetTop, height: visibleViewport.height });
    update();
    visibleViewport.addEventListener('resize', update);
    visibleViewport.addEventListener('scroll', update);
    return () => {
      visibleViewport.removeEventListener('resize', update);
      visibleViewport.removeEventListener('scroll', update);
    };
  }, []);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus({ preventScroll: true });
    return () => { if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); };
  }, []);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    const originalTop = document.body.style.top;
    const originalWidth = document.body.style.width;
    const scrollY = window.scrollY;

    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.position = originalPosition;
      document.body.style.top = originalTop;
      document.body.style.width = originalWidth;
      window.scrollTo(0, scrollY);
    };
  }, []);

  return (
    <>
      <style>{`
        @keyframes qamSlideUp {
          from { transform: translateY(100%); opacity: 0.6; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes qamFadeIn {
          from { opacity: 0; transform: scale(0.97) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
        @keyframes qamSuccessBounce {
          0%   { opacity: 0; transform: scale(0.3); }
          50%  { opacity: 1; transform: scale(1.15); }
          70%  { transform: scale(0.95); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes qamSuccessFadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes qamSuccessParticle {
          0%   { opacity: 1; transform: rotate(var(--r,0deg)) translateY(-20px) scale(1); }
          100% { opacity: 0; transform: rotate(var(--r,0deg)) translateY(-80px) scale(0.3); }
        }
        @keyframes qamBackdrop {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .qam-sheet {
          --qam-max-height: 92svh;
          animation: qamSlideUp 0.32s cubic-bezier(0.32, 0.72, 0, 1) both;
        }
        @media (min-width: 640px) {
          .qam-sheet {
            --qam-max-height: 90svh;
            animation: qamFadeIn 0.22s ease-out both;
          }
        }
        .qam-scroll {
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
        }
        /* iOS safe-area-aware padding for home indicator */
        .qam-safe-bottom {
          padding-bottom: max(env(safe-area-inset-bottom), 0px);
        }
        /* Prevent iOS Safari auto-zoom on focus (requires font-size >= 16px) */
        .qam-body input,
        .qam-body select,
        .qam-body textarea {
          min-width: 0;
          max-width: 100%;
          font-size: max(16px, 1em) !important;
        }
        .qam-header-icon svg { color: rgb(var(--text-primary)); }
        @media (max-width: 639px) {
          .qam-body button { min-height: 44px; }
          .qam-body input:not([type="checkbox"]):not([type="radio"]):not([type="file"]),
          .qam-body select { min-height: 44px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .qam-sheet { animation: none; }
        }
      `}</style>

      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-[60]"
        style={{ animation: 'qamBackdrop 0.2s ease-out both' }}
        onClick={onClose}
      />

      {/* Sheet / Dialog */}
      <div
        className={`
          fixed bottom-0 left-0 right-0 z-[61]
          flex items-end
          sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-4
        `}
        style={viewport ? { top: viewport.top, height: viewport.height, bottom: 'auto' } : undefined}
      >
        <div
          className={`
            qam-sheet min-w-0 outline-none bg-canvas text-primary w-full sm:max-w-2xl
            rounded-t-2xl sm:rounded-xl
            shadow-2xl border-t sm:border border-subtle
            flex flex-col
            ${stableHeight ? 'h-[92svh] sm:h-[90svh]' : 'max-h-[92svh] sm:max-h-[90svh]'}
            relative
          `}
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={subtitle ? subtitleId : undefined}
          tabIndex={-1}
          style={{ maxHeight: 'min(var(--qam-max-height), 100%)' }}
          onKeyDown={event => {
            if (event.defaultPrevented) return;
            if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
            if (event.key !== 'Tab') return;
            const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]') || [])
              .filter(control => control.getClientRects().length > 0);
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (!first) { event.preventDefault(); return; }
            if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first.focus(); }
          }}
          onClick={(e) => e.stopPropagation()}
        >

          {/* Drag handle — visible on mobile only */}
          <div className="flex justify-center pt-2.5 pb-0 sm:hidden flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-strong" />
          </div>

          {/* Success overlay */}
          {showSuccess && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-t-2xl sm:rounded-xl overflow-hidden">
              <div className="absolute inset-0 bg-gray-900/95 backdrop-blur-sm" />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-32 h-32 rounded-full border-2 border-blue-400/60 animate-ping" style={{ animationDuration: '0.7s' }} />
                <div className="absolute w-48 h-48 rounded-full border border-blue-400/30 animate-ping" style={{ animationDuration: '0.9s', animationDelay: '0.1s' }} />
                <div className="absolute w-64 h-64 rounded-full border border-blue-400/15 animate-ping" style={{ animationDuration: '1.1s', animationDelay: '0.2s' }} />
              </div>
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className="absolute w-2 h-2 rounded-full bg-blue-400"
                  style={{
                    top: '50%',
                    left: '50%',
                    transform: `rotate(${i * 45}deg) translateY(-60px)`,
                    animation: 'qamSuccessParticle 0.8s ease-out forwards',
                    animationDelay: `${i * 0.04}s`,
                    opacity: 0,
                  }}
                />
              ))}
              <div className="relative z-10 flex flex-col items-center gap-3">
                <div className="text-blue-400" style={{ animation: 'qamSuccessBounce 0.6s cubic-bezier(0.36, 0.07, 0.19, 0.97) forwards' }}>
                  <CheckCircle2 className="w-20 h-20" strokeWidth={1.5} />
                </div>
                <p className="text-white text-lg font-semibold tracking-wide" style={{ animation: 'qamSuccessFadeUp 0.5s ease-out 0.3s both' }}>
                  {successMessage}
                </p>
              </div>
            </div>
          )}

          {/* Header */}
          <div className={`flex items-center justify-between px-4 py-3.5 sm:px-6 sm:py-4 flex-shrink-0 bg-gradient-to-r ${accentColor} rounded-t-2xl sm:rounded-t-xl`}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="qam-header-icon w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
                {icon}
              </div>
              <div className="min-w-0">
                <h2 id={titleId} className="text-base sm:text-lg font-bold text-white leading-tight truncate">{title}</h2>
                {subtitle && <p id={subtitleId} className="text-white/70 text-xs mt-0.5 truncate">{subtitle}</p>}
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="h-11 w-11 flex items-center justify-center p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors flex-shrink-0 ml-2 touch-manipulation"
              type="button"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable body — ref for future touch drag if needed */}
          <div
            ref={scrollRef}
            className={`qam-body qam-safe-bottom flex flex-col flex-1 min-h-0 min-w-0 ${scrollBody ? 'qam-scroll overflow-y-auto' : 'overflow-hidden'}`}
          >
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
