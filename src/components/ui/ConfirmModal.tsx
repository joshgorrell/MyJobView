import React from 'react';
import { AlertTriangle, Trash2, Info, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  variant?: 'danger' | 'warning' | 'neutral';
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
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
  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      icon: Trash2,
      iconClass: 'text-red-400',
      iconBg: 'bg-red-500/10',
      confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
      defaultLabel: 'Delete',
    },
    warning: {
      icon: AlertTriangle,
      iconClass: 'text-amber-400',
      iconBg: 'bg-amber-500/10',
      confirmClass: 'bg-amber-600 hover:bg-amber-700 text-white',
      defaultLabel: 'Confirm',
    },
    neutral: {
      icon: Info,
      iconClass: 'text-blue-400',
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
      `}</style>
      <div
        className="confirm-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
        onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      >
        <div className="confirm-panel bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm">
          <div className="flex items-start justify-between p-5 pb-4">
            <div className="flex items-start gap-3">
              <div className={`flex-shrink-0 p-2 rounded-lg ${styles.iconBg}`}>
                <Icon className={`w-5 h-5 ${styles.iconClass}`} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">{title}</h3>
                <p className="text-sm text-gray-400 mt-1">{message}</p>
              </div>
            </div>
            <button
              onClick={onCancel}
              className="flex-shrink-0 text-gray-500 hover:text-gray-300 transition-colors ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-2 px-5 pb-5 justify-end">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${styles.confirmClass}`}
            >
              {label}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
