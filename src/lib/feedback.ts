/** App feedback stays scoped to the workflow; never replace window's native APIs. */
export type FeedbackTheme = 'blue' | 'cyan' | 'violet' | 'emerald' | 'amber' | 'rose';
export type FeedbackTone = 'success' | 'error' | 'warning' | 'info';
export const feedbackAccents: Record<FeedbackTheme, string> = {
  blue: '#3b82f6', cyan: '#06b6d4', violet: '#8b5cf6', emerald: '#10b981', amber: '#f59e0b', rose: '#f43f5e',
};
export interface FeedbackOptions {
  theme?: FeedbackTheme;
  accent?: string;
  title?: string;
  tone?: FeedbackTone;
  confirmLabel?: string;
  inputType?: 'text' | 'date';
}
export interface Notice extends FeedbackOptions { id: number; message: string }
export interface FeedbackRequest extends FeedbackOptions {
  id: number;
  message: string;
  kind: 'confirm' | 'prompt';
  defaultValue: string;
  resolve: (value: string | boolean | null) => void;
}
// A modal's own gradient takes priority over the section fallback palette.
function contextualOptions(options: FeedbackOptions): FeedbackOptions {
  if (options.accent || typeof document === 'undefined') return options;
  const active = document.activeElement;
  const panel = active instanceof Element ? active.closest('.qam-sheet, [role="dialog"], .responsive-modal-panel, .fixed.inset-0') : null;
  const header = panel?.querySelector('[class*="bg-gradient-"]');
  const gradient = header && getComputedStyle(header).backgroundImage;
  const accent = gradient && gradient.match(/rgba?\([^)]+\)/)?.[0];
  if (accent) return { ...options, accent };
  const button = active instanceof Element ? active.closest('button') : null;
  const background = button && getComputedStyle(button).backgroundColor;
  const channels = background?.match(/\d+(?:\.\d+)?/g)?.map(Number);
  // Ignore neutral/transparent controls; inherit an actual colored action button.
  if (background && channels && channels.length >= 3 && (channels.length < 4 || channels[3] >= .8)
      && Math.max(...channels.slice(0, 3)) - Math.min(...channels.slice(0, 3)) > 35) return { ...options, accent: background };
  return options;
}
let sequence = 0;
let state: { notices: Notice[]; requests: FeedbackRequest[] } = { notices: [], requests: [] };
const listeners = new Set<() => void>();
const publish = () => listeners.forEach(listener => listener());
export const feedbackStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  snapshot: () => state,
  dismiss(id: number) { state = { ...state, notices: state.notices.filter(notice => notice.id !== id) }; publish(); },
  settle(id: number, value: string | boolean | null) {
    const request = state.requests.find(item => item.id === id);
    if (!request) return;
    state = { ...state, requests: state.requests.filter(item => item.id !== id) };
    publish(); request.resolve(value);
  },
};
export function notify(message: unknown, options: FeedbackOptions = {}) {
  state = { ...state, notices: [...state.notices, { ...contextualOptions(options), id: ++sequence, message: String(message) }] };
  publish();
}
function request(kind: FeedbackRequest['kind'], message: string, defaultValue: string, options: FeedbackOptions) {
  return new Promise<string | boolean | null>(resolve => {
    state = { ...state, requests: [...state.requests, { ...contextualOptions(options), id: ++sequence, kind, message, defaultValue, resolve }] };
    publish();
  });
}
export async function requestConfirmation(message: string, options: FeedbackOptions = {}): Promise<boolean> {
  return (await request('confirm', message, '', options)) === true;
}
export async function requestText(message: string, defaultValue = '', options: FeedbackOptions = {}): Promise<string | null> {
  const value = await request('prompt', message, defaultValue, options);
  return typeof value === 'string' ? value : null;
}
