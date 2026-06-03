import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, title?: string, duration?: number) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
  confirm: (message: string, onConfirm: () => void, title?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="w-5 h-5" />,
  error: <XCircle className="w-5 h-5" />,
  warning: <AlertTriangle className="w-5 h-5" />,
  info: <Info className="w-5 h-5" />,
};

const colors: Record<ToastType, { bar: string; icon: string; bg: string; border: string; title: string }> = {
  success: {
    bar: 'bg-emerald-500',
    icon: 'text-emerald-500',
    bg: 'bg-white dark:bg-gray-800',
    border: 'border-emerald-100 dark:border-emerald-900/40',
    title: 'text-emerald-700 dark:text-emerald-400',
  },
  error: {
    bar: 'bg-red-500',
    icon: 'text-red-500',
    bg: 'bg-white dark:bg-gray-800',
    border: 'border-red-100 dark:border-red-900/40',
    title: 'text-red-700 dark:text-red-400',
  },
  warning: {
    bar: 'bg-amber-500',
    icon: 'text-amber-500',
    bg: 'bg-white dark:bg-gray-800',
    border: 'border-amber-100 dark:border-amber-900/40',
    title: 'text-amber-700 dark:text-amber-400',
  },
  info: {
    bar: 'bg-blue-500',
    icon: 'text-blue-500',
    bg: 'bg-white dark:bg-gray-800',
    border: 'border-blue-100 dark:border-blue-900/40',
    title: 'text-blue-700 dark:text-blue-400',
  },
};

interface ConfirmDialog {
  id: string;
  message: string;
  title?: string;
  onConfirm: () => void;
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const c = colors[toast.type];
  const duration = toast.duration ?? 4000;

  useEffect(() => {
    const enterTimer = setTimeout(() => setVisible(true), 10);
    timerRef.current = setTimeout(() => dismiss(), duration);
    return () => {
      clearTimeout(enterTimer);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function dismiss() {
    setLeaving(true);
    setTimeout(() => onRemove(toast.id), 350);
  }

  return (
    <div
      className={`
        relative flex items-start gap-3 rounded-xl border shadow-xl px-4 py-3 min-w-[300px] max-w-[420px] w-full
        ${c.bg} ${c.border}
        transition-all duration-300 ease-out
        ${visible && !leaving ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'}
      `}
      style={{ willChange: 'transform, opacity' }}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${c.bar}`} />
      <div className={`mt-0.5 flex-shrink-0 ${c.icon}`}>{icons[toast.type]}</div>
      <div className="flex-1 min-w-0 pr-2">
        {toast.title && (
          <p className={`text-sm font-semibold leading-tight ${c.title}`}>{toast.title}</p>
        )}
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug mt-0.5">{toast.message}</p>
      </div>
      <button
        onClick={dismiss}
        className="flex-shrink-0 -mt-0.5 p-0.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
      <div
        className={`absolute bottom-0 left-1 right-0 h-0.5 rounded-b-xl ${c.bar} opacity-20`}
        style={{
          animation: `shrink ${duration}ms linear forwards`,
        }}
      />
    </div>
  );
}

function ConfirmDialogItem({ dialog, onClose }: { dialog: ConfirmDialog; onClose: (id: string) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  function handleConfirm() {
    dialog.onConfirm();
    close();
  }

  function close() {
    setVisible(false);
    setTimeout(() => onClose(dialog.id), 300);
  }

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      <div
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={close}
      />
      <div
        className={`relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 max-w-sm w-full transition-all duration-300 ${visible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4'}`}
      >
        <div className="flex items-start gap-4 mb-5">
          <div className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            {dialog.title && (
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">{dialog.title}</h3>
            )}
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{dialog.message}</p>
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={close}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors shadow-sm"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirms, setConfirms] = useState<ConfirmDialog[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const removeConfirm = useCallback((id: string) => {
    setConfirms(prev => prev.filter(c => c.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info', title?: string, duration?: number) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, type, message, title, duration }]);
  }, []);

  const success = useCallback((message: string, title?: string) => showToast(message, 'success', title), [showToast]);
  const error = useCallback((message: string, title?: string) => showToast(message, 'error', title), [showToast]);
  const warning = useCallback((message: string, title?: string) => showToast(message, 'warning', title), [showToast]);
  const info = useCallback((message: string, title?: string) => showToast(message, 'info', title), [showToast]);

  const confirm = useCallback((message: string, onConfirm: () => void, title?: string) => {
    const id = `confirm-${Date.now()}-${Math.random()}`;
    setConfirms(prev => [...prev, { id, message, title, onConfirm }]);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info, confirm }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[9998] flex flex-col gap-2.5 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onRemove={removeToast} />
          </div>
        ))}
      </div>
      {confirms.map(d => (
        <ConfirmDialogItem key={d.id} dialog={d} onClose={removeConfirm} />
      ))}
      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
