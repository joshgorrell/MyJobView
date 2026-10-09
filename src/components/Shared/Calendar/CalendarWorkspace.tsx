import { useEffect, useRef, useState, type ReactNode, type MouseEventHandler } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import './calendar.css';

// Expands the actual calendar workspace, preserving its state and interactions.
export function CalendarWorkspace({ children, tabHref, className = '', onClick, loading = false, embedded = false }: { children: ReactNode; tabHref?: string; className?: string; onClick?: MouseEventHandler<HTMLDivElement>; loading?: boolean; embedded?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    const changed = () => setExpanded(Boolean(root.current && document.fullscreenElement === root.current));
    document.addEventListener('fullscreenchange', changed);
    return () => { document.removeEventListener('fullscreenchange', changed); };
  }, []);
  useEffect(() => {
    if (!fallback) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setFallback(false); };
    document.addEventListener('keydown', escape);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', escape); };
  }, [fallback]);
  async function toggle() {
    if (fallback) { setFallback(false); return; }
    if (expanded) { await document.exitFullscreen(); return; }
    try { if (!root.current?.requestFullscreen) throw new Error('Fullscreen unavailable'); await root.current.requestFullscreen(); }
    catch { setFallback(true); }
  }
  if (embedded) return <div className={'min-w-0 ' + className}>{children}</div>;
  return <div ref={root} className={'calendar-workspace relative min-w-0 ' + (fallback ? 'calendar-expanded ' : '') + className} aria-busy={loading} data-calendar-workspace onClick={onClick}>
    <div className="relative z-30 flex flex-wrap items-center justify-end gap-2 pb-2">
      <button type="button" onClick={() => { void toggle(); }} aria-label={expanded || fallback ? 'Exit full screen calendar' : 'Full screen calendar'} className="min-h-11 inline-flex items-center gap-2 px-3 text-sm bg-white text-gray-900 border border-gray-200 rounded-lg hover:bg-blue-50">{expanded || fallback ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}{expanded || fallback ? 'Exit full screen' : 'Full screen'}</button>
      {tabHref && <a href={tabHref} target="_blank" rel="noopener noreferrer" aria-label="Pop out calendar" title="Pop out calendar" className="min-h-11 min-w-11 inline-flex items-center justify-center p-2 bg-elevated hover:bg-strong/25 text-primary rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-blue-500"><Maximize2 size={16} aria-hidden="true" /></a>}
    </div>
    {children}
    {loading && <div className="absolute inset-x-0 bottom-0 top-14 z-20 bg-white/80 flex items-start justify-center pt-16" role="status"><p className="rounded-lg bg-white px-4 py-3 text-sm text-gray-700">Loading calendar…</p></div>}
  </div>;
}
