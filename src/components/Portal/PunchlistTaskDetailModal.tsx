import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import {
  X,
  Send,
  CheckCircle2,
  RotateCcw,
  Trash2,
  ExternalLink,
  Camera,
  Calendar,
  Clock,
  AlertTriangle,
  FileText,
  MessageSquare,
  Save,
  User,
  Phone,
  Mail,
  Wrench,
  CheckCheck,
  Info,
  StickyNote
} from 'lucide-react';

interface TaskPhoto {
  id: string;
  task_id: string;
  photo_url: string;
  caption: string | null;
  uploaded_at: string;
}

interface PunchlistTaskDetail {
  id: string;
  title: string;
  details: string | null;
  customer_notes: string | null;
  installer_notes: string | null;
  status: string;
  created_at: string;
  requested_at: string | null;
  completed_at: string | null;
  service_request_id: string | null;
  work_order_id: string | null;
  photos?: TaskPhoto[];
  service_request?: {
    id: string;
    status: string;
    work_order_id: string | null;
    work_order?: {
      id: string;
      work_order_number: string;
    } | null;
  } | null;
  contact?: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
}

interface PunchlistTaskDetailModalProps {
  task: PunchlistTaskDetail;
  isAdmin?: boolean;
  onClose: () => void;
  onTaskUpdated: () => void;
  onRecall?: (task: PunchlistTaskDetail) => void;
  onDelete?: (task: PunchlistTaskDetail) => void;
  onMarkComplete?: (task: PunchlistTaskDetail) => void;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  draft:     { label: 'Draft',     bg: 'bg-gray-100',   text: 'text-gray-700',   border: 'border-gray-300'  },
  requested: { label: 'Requested', bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-300' },
  scheduled: { label: 'Scheduled', bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-blue-300'  },
  completed: { label: 'Completed', bg: 'bg-green-100',  text: 'text-green-700',  border: 'border-green-300' },
};

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

export function PunchlistTaskDetailModal({
  task: initialTask,
  isAdmin = false,
  onClose,
  onTaskUpdated,
  onRecall,
  onDelete,
  onMarkComplete,
}: PunchlistTaskDetailModalProps) {
  const [task, setTask] = useState<PunchlistTaskDetail>(initialTask);
  const [customerNotes, setCustomerNotes] = useState(initialTask.customer_notes ?? '');
  const [installerNotes, setInstallerNotes] = useState(initialTask.installer_notes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<TaskPhoto | null>(null);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const hasWorkOrder = !!(task.service_request?.work_order_id || task.work_order_id);
  const isLocked = hasWorkOrder;
  const canAct = task.status === 'requested' && !isLocked;
  const statusCfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.draft;

  // Sync if parent passes updated task
  useEffect(() => {
    setTask(initialTask);
    setCustomerNotes(initialTask.customer_notes ?? '');
    setInstallerNotes(initialTask.installer_notes ?? '');
  }, [initialTask]);

  async function saveCustomerNotes(value: string) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSavingNotes(true);
      try {
        await supabase
          .from('punchlist_tasks')
          .update({ customer_notes: value || null })
          .eq('id', task.id);
        setNotesSaved(true);
        setTimeout(() => setNotesSaved(false), 2000);
        onTaskUpdated();
      } finally {
        setSavingNotes(false);
      }
    }, 800);
  }

  async function saveInstallerNotes(value: string) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSavingNotes(true);
      try {
        await supabase
          .from('punchlist_tasks')
          .update({ installer_notes: value || null })
          .eq('id', task.id);
        setNotesSaved(true);
        setTimeout(() => setNotesSaved(false), 2000);
        onTaskUpdated();
      } finally {
        setSavingNotes(false);
      }
    }, 800);
  }

  function handleCustomerNotesChange(val: string) {
    setCustomerNotes(val);
    saveCustomerNotes(val);
  }

  function handleInstallerNotesChange(val: string) {
    setInstallerNotes(val);
    saveInstallerNotes(val);
  }

  const workOrder = task.service_request?.work_order;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        {/* Modal panel — full-screen bottom sheet on mobile, centered card on sm+ */}
        <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[85vh] overflow-hidden">

          {/* Header */}
          <div className="flex items-start gap-3 px-4 sm:px-6 pt-5 pb-4 border-b border-gray-200 flex-shrink-0">
            {/* Drag handle on mobile */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 bg-gray-300 rounded-full sm:hidden" />

            <div className="flex-1 min-w-0 mt-1">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
                  {task.status === 'requested' && <Send className="w-3 h-3" />}
                  {task.status === 'scheduled' && <Calendar className="w-3 h-3" />}
                  {task.status === 'completed' && <CheckCircle2 className="w-3 h-3" />}
                  {task.status === 'draft' && <FileText className="w-3 h-3" />}
                  {statusCfg.label}
                </span>
                {isLocked && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-full text-xs">
                    <Wrench className="w-3 h-3" />
                    Work Order Assigned
                  </span>
                )}
              </div>
              <h2 className="text-base sm:text-lg font-bold text-gray-900 leading-snug">{task.title}</h2>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0 mt-1"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-5">

            {/* Locked notice */}
            {isLocked && task.status !== 'completed' && (
              <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-xl p-3">
                <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-800">
                  A work order has been created for this task. To cancel or reschedule, please contact your Service Manager.
                </p>
              </div>
            )}

            {/* Admin — customer info */}
            {isAdmin && task.contact && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  Customer
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                  {(task.contact.first_name || task.contact.last_name) && (
                    <span className="font-medium text-gray-900">
                      {[task.contact.first_name, task.contact.last_name].filter(Boolean).join(' ')}
                    </span>
                  )}
                  {task.contact.email && (
                    <a href={`mailto:${task.contact.email}`} className="flex items-center gap-1 text-blue-600 hover:underline">
                      <Mail className="w-3.5 h-3.5" />
                      {task.contact.email}
                    </a>
                  )}
                  {task.contact.phone && (
                    <a href={`tel:${task.contact.phone}`} className="flex items-center gap-1 text-blue-600 hover:underline">
                      <Phone className="w-3.5 h-3.5" />
                      {task.contact.phone}
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Original description */}
            {task.details && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  Description
                </p>
                <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-lg p-3 border border-gray-200">
                  {task.details}
                </p>
              </div>
            )}

            {/* Photos */}
            {task.photos && task.photos.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5" />
                  Photos ({task.photos.length})
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                  {task.photos.map((photo) => (
                    <button
                      key={photo.id}
                      onClick={() => setSelectedPhoto(photo)}
                      className="flex-shrink-0 w-24 h-24 sm:w-28 sm:h-28 rounded-lg overflow-hidden border border-gray-200 hover:border-blue-400 transition-colors"
                    >
                      <img src={photo.photo_url} alt={photo.caption || 'Task photo'} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Customer Notes */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                  <StickyNote className="w-3.5 h-3.5" />
                  {isAdmin ? 'Customer Notes' : 'Additional Notes'}
                </p>
                {savingNotes && (
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Save className="w-3 h-3 animate-pulse" />
                    Saving…
                  </span>
                )}
                {!savingNotes && notesSaved && (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Saved
                  </span>
                )}
              </div>
              <textarea
                value={customerNotes}
                onChange={(e) => handleCustomerNotesChange(e.target.value)}
                placeholder={isAdmin
                  ? 'No additional notes from customer'
                  : 'Add anything you want our team to know — access codes, timing preferences, specific concerns…'}
                rows={3}
                readOnly={isAdmin}
                className={`w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 resize-none leading-relaxed transition-colors ${
                  isAdmin
                    ? 'bg-gray-50 cursor-default'
                    : 'bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                }`}
              />
              {!isAdmin && (
                <p className="text-xs text-gray-400 mt-1">Auto-saved as you type.</p>
              )}
            </div>

            {/* Admin — Installer Notes */}
            {isAdmin && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" />
                    Installer Notes
                  </p>
                  {savingNotes && (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Save className="w-3 h-3 animate-pulse" />
                      Saving…
                    </span>
                  )}
                  {!savingNotes && notesSaved && (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Saved
                    </span>
                  )}
                </div>
                <textarea
                  value={installerNotes}
                  onChange={(e) => handleInstallerNotesChange(e.target.value)}
                  placeholder="Notes for the technician or installer about this task…"
                  rows={3}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 resize-none leading-relaxed bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                />
                <p className="text-xs text-gray-400 mt-1">Auto-saved as you type.</p>
              </div>
            )}

            {/* Customer view — read-only installer notes */}
            {!isAdmin && task.installer_notes && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5" />
                  Notes from Our Team
                </p>
                <p className="text-sm text-gray-700 leading-relaxed bg-amber-50 rounded-lg p-3 border border-amber-200">
                  {task.installer_notes}
                </p>
              </div>
            )}

            {/* Work order link */}
            {workOrder && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl p-3">
                <Wrench className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <span className="text-sm text-blue-800 flex-1">Work Order #{workOrder.work_order_number} has been created</span>
                <a
                  href={`/work-order/${workOrder.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-blue-600 font-medium hover:underline"
                >
                  View <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}

            {/* Timestamps */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-500">
              <div className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-3 py-2">
                <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                <span><span className="font-medium text-gray-700">Created:</span> {fmt(task.created_at)}</span>
              </div>
              {task.requested_at && (
                <div className="flex items-center gap-1.5 bg-amber-50 rounded-lg px-3 py-2">
                  <Send className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                  <span><span className="font-medium text-amber-700">Requested:</span> {fmt(task.requested_at)}</span>
                </div>
              )}
              {task.completed_at && (
                <div className="flex items-center gap-1.5 bg-green-50 rounded-lg px-3 py-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                  <span><span className="font-medium text-green-700">Completed:</span> {fmt(task.completed_at)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Footer actions */}
          {(onRecall || onDelete || onMarkComplete) && task.status !== 'completed' && (
            <div className="flex-shrink-0 border-t border-gray-200 px-4 sm:px-6 py-4">
              {isLocked ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  A work order is scheduled — contact your Service Manager to cancel or make changes.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 justify-end">
                  {onRecall && canAct && (
                    <button
                      onClick={() => onRecall(task)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Recall Request
                    </button>
                  )}
                  {onDelete && (canAct || task.status === 'draft') && (
                    <button
                      onClick={() => onDelete(task)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-sm font-medium transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  )}
                  {onMarkComplete && (
                    <button
                      onClick={() => onMarkComplete(task)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      <CheckCheck className="w-4 h-4" />
                      Mark Complete
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox for photos */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <button
            onClick={() => setSelectedPhoto(null)}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={selectedPhoto.photo_url}
            alt={selectedPhoto.caption || 'Task photo'}
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {selectedPhoto.caption && (
            <p className="absolute bottom-6 text-white text-sm bg-black/60 px-3 py-1.5 rounded-full">
              {selectedPhoto.caption}
            </p>
          )}
        </div>
      )}
    </>
  );
}
