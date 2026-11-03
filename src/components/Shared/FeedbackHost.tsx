import { CSSProperties, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, MessageSquare, X, XCircle } from 'lucide-react';
import { feedbackAccents, feedbackStore, type FeedbackRequest, type Notice } from '../../lib/feedback';
import './feedback.css';

function NoticeCard({ notice }: { notice: Notice }) {
  const [leaving, setLeaving] = useState(false);
  const noticeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const card = noticeRef.current;
    return () => {
      if (previous?.isConnected && !previous.closest('[inert]')
          && (document.activeElement === document.body || card?.contains(document.activeElement))) previous.focus({ preventScroll: true });
    };
  }, []);
  const [paused, setPaused] = useState(false);
  const tone = notice.tone || 'info';
  const Icon = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info }[tone];
  const dismiss = () => setLeaving(true);
  useEffect(() => {
    if (paused || tone === 'error') return;
    const timer = window.setTimeout(() => setLeaving(true), 6500);
    return () => window.clearTimeout(timer);
  }, [paused, tone]);
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => feedbackStore.dismiss(notice.id), 180);
    return () => window.clearTimeout(timer);
  }, [leaving, notice.id]);
  const accent = tone === 'error' ? '#ef4444' : tone === 'warning' ? '#f59e0b' : (notice.accent || feedbackAccents[notice.theme || 'blue']);
  return <div ref={noticeRef} className={`feedback-notice ${leaving ? 'feedback-leaving' : ''}`} style={{ '--feedback-accent': accent } as CSSProperties}
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
    <Icon className="feedback-notice-icon" aria-hidden="true" />
    <div role={tone === 'error' ? 'alert' : 'status'} className="min-w-0 flex-1">
      <p className="font-semibold text-primary">{notice.title || { success: 'Done', error: 'Something needs attention', warning: 'Please check', info: 'Heads up' }[tone]}</p>
      <p className="mt-1 text-sm text-secondary whitespace-pre-wrap break-words">{notice.message}</p>
    </div>
    <button type="button" onClick={dismiss} aria-label="Dismiss notification" className="feedback-close"><X className="h-4 w-4" /></button>
  </div>;
}

function RequestDialog({ request }: { request: FeedbackRequest }) {
  const [value, setValue] = useState(request.defaultValue);
  const [viewport, setViewport] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const visible = window.visualViewport;
    if (!visible) return;
    const update = () => setViewport({ top: visible.offsetTop, height: visible.height });
    update(); visible.addEventListener('resize', update); visible.addEventListener('scroll', update);
    return () => { visible.removeEventListener('resize', update); visible.removeEventListener('scroll', update); };
  }, []);
  const titleId = useId(); const descriptionId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const isPrompt = request.kind === 'prompt';
  const destructive = /delete|discard|revoke|remove|decline|reject|cancel/i.test(request.message);
  const finish = (result: string | boolean | null) => feedbackStore.settle(request.id, result);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const siblings = Array.from(document.body.children).filter((node): node is HTMLElement => node instanceof HTMLElement && !node.classList.contains('app-feedback'));
    const prior = siblings.map(node => ({ node, inert: node.inert }));
    siblings.forEach(node => { node.inert = true; });
    (isPrompt ? input.current : cancel.current)?.focus();
    const keepFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target)) (isPrompt ? input.current : cancel.current)?.focus();
    };
    document.addEventListener('focusin', keepFocus);
    return () => {
      document.removeEventListener('focusin', keepFocus);
      prior.forEach(({ node, inert }) => { node.inert = inert; });
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [isPrompt]);
  const title = request.title || (isPrompt ? 'Add details' : destructive ? 'Confirm this action' : 'Ready to continue?');
  const Icon = isPrompt ? MessageSquare : destructive ? AlertTriangle : CheckCircle2;
  return <div className="feedback-backdrop" style={viewport ? { top: viewport.top, height: viewport.height, bottom: 'auto' } : undefined} onMouseDown={event => { if (event.target === event.currentTarget) finish(isPrompt ? null : false); }}>
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}
      className="feedback-dialog" style={{ '--feedback-accent': request.accent || feedbackAccents[request.theme || 'blue'] } as CSSProperties}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(isPrompt ? null : false); }
        if (event.key !== 'Tab') return;
        const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),[tabindex="0"]') || []);
        const first = controls[0]; const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <div className="feedback-dialog-accent" />
      <form onSubmit={event => { event.preventDefault(); finish(isPrompt ? value : true); }}>
        <div className="flex items-start gap-3 p-5 pb-3">
          <span className="feedback-dialog-icon"><Icon className="h-6 w-6" /></span>
          <div className="flex-1 min-w-0"><h2 id={titleId} className="text-lg font-bold text-primary">{title}</h2>
            <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-secondary whitespace-pre-wrap break-words">{request.message}</p></div>
          <button type="button" className="feedback-close" aria-label="Close dialog" onClick={() => finish(isPrompt ? null : false)}><X className="h-4 w-4" /></button>
        </div>
        {isPrompt && <div className="px-5 pb-3"><label className="block text-sm font-medium text-primary" htmlFor={`${titleId}-input`}>{request.inputType === 'date' ? 'Date' : 'Your response'}</label>
          <input ref={input} id={`${titleId}-input`} type={request.inputType || 'text'} value={value} onChange={event => setValue(event.target.value)} className="feedback-input" autoComplete="off" /></div>}
        <div className="flex justify-end gap-2 p-5 pt-3">
          <button ref={cancel} type="button" className="min-h-11 px-4 rounded-xl border border-subtle text-secondary hover:bg-elevated" onClick={() => finish(isPrompt ? null : false)}>Cancel</button>
          <button type="submit" className={`feedback-confirm ${destructive ? 'feedback-destructive' : ''}`}>{request.confirmLabel || (isPrompt ? 'Continue' : destructive ? 'Confirm action' : 'Continue')}</button>
        </div>
      </form>
    </div>
  </div>;
}

/** Mounted once for employees, public links and portal routes alike. */
export function FeedbackHost() {
  const { notices, requests } = useSyncExternalStore(feedbackStore.subscribe, feedbackStore.snapshot);
  return createPortal(<div className="app-feedback">
    {requests[0] && <RequestDialog key={requests[0].id} request={requests[0]} />}
    <div className="feedback-notices" aria-label="Notifications">{notices.map(notice => <NoticeCard key={notice.id} notice={notice} />)}</div>
  </div>, document.body);
}
