import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  Clock,
  ChevronDown,
  ChevronRight,
  StickyNote,
  Lock,
  Wrench,
  User,
  Trash2,
  Send,
  AlertCircle,
  Timer,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface ProjectHistoryProps {
  projectId: string;
}

interface WorkOrderEntry {
  id: string;
  work_order_number: string;
  title: string;
  status: string;
  type: string;
  labor_phase?: { name: string } | null;
  assigned_to_profile?: { full_name: string } | null;
  created_at: string;
  notes?: string | null;
  internal_notes?: string | null;
  time_entries: TimeEntry[];
}

interface TimeEntry {
  id: string;
  entry_date: string;
  clock_in_time: string | null;
  clock_out_time: string | null;
  total_hours: number | null;
  notes: string | null;
  technician?: { full_name: string } | null;
}

interface ProjectNote {
  id: string;
  body: string;
  is_internal: boolean;
  created_at: string;
  author?: { full_name: string } | null;
}

type FeedItem =
  | { kind: 'wo'; ts: string; data: WorkOrderEntry }
  | { kind: 'note'; ts: string; data: ProjectNote };

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-900/50 text-yellow-300 border border-yellow-700',
  scheduled: 'bg-blue-900/50 text-blue-300 border border-blue-700',
  in_progress: 'bg-cyan-900/50 text-cyan-300 border border-cyan-700',
  completed: 'bg-green-900/50 text-green-300 border border-green-700',
  cancelled: 'bg-red-900/50 text-red-300 border border-red-700',
};

function fmtDate(ts: string) {
  try {
    return format(parseISO(ts), 'MMM d, yyyy');
  } catch {
    return ts;
  }
}

function fmtTime(t: string | null) {
  if (!t) return '—';
  try {
    const [h, m] = t.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
  } catch {
    return t;
  }
}

function fmtHours(h: number | null) {
  if (h == null) return '—';
  return `${h.toFixed(2)} hrs`;
}

export default function ProjectHistory({ projectId }: ProjectHistoryProps) {
  const { profile } = useAuth();
  const [workOrders, setWorkOrders] = useState<WorkOrderEntry[]>([]);
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedWOs, setExpandedWOs] = useState<Set<string>>(new Set());
  const [noteBody, setNoteBody] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isElevated = ['admin', 'manager', 'service_manager', 'production_manager'].includes(profile?.role || '');
  const isAdmin = ['admin', 'manager'].includes(profile?.role || '');

  useEffect(() => {
    loadHistory();
  }, [projectId]);

  async function loadHistory() {
    setLoading(true);
    try {
      const [woResult, notesResult] = await Promise.all([
        supabase
          .from('work_orders')
          .select(`
            id,
            work_order_number,
            title,
            status,
            type,
            created_at,
            notes,
            internal_notes,
            labor_phase:labor_phases!work_orders_labor_phase_id_fkey(name),
            assigned_to_profile:profiles!work_orders_assigned_to_fkey(full_name)
          `)
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),

        supabase
          .from('project_notes')
          .select(`
            id,
            body,
            is_internal,
            created_at,
            author:profiles!project_notes_author_id_fkey(full_name)
          `)
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
      ]);

      if (woResult.error) throw woResult.error;
      if (notesResult.error) throw notesResult.error;

      const wos = woResult.data || [];
      const notesData = notesResult.data || [];

      // Load time entries for all work orders in one query
      const woIds = wos.map((w: any) => w.id);
      let timeEntriesMap: Record<string, TimeEntry[]> = {};

      if (woIds.length > 0) {
        const { data: teData } = await supabase
          .from('time_entries')
          .select(`
            id,
            work_order_id,
            entry_date,
            clock_in_time,
            clock_out_time,
            total_hours,
            notes,
            technician:profiles!technician_id(full_name)
          `)
          .in('work_order_id', woIds)
          .order('entry_date', { ascending: false });

        (teData || []).forEach((te: any) => {
          if (!timeEntriesMap[te.work_order_id]) {
            timeEntriesMap[te.work_order_id] = [];
          }
          timeEntriesMap[te.work_order_id].push(te);
        });
      }

      const enrichedWOs: WorkOrderEntry[] = wos.map((w: any) => ({
        ...w,
        time_entries: timeEntriesMap[w.id] || [],
      }));

      setWorkOrders(enrichedWOs);
      setNotes(notesData);
    } catch (err) {
      console.error('Error loading project history:', err);
    } finally {
      setLoading(false);
    }
  }

  function toggleWO(id: string) {
    setExpandedWOs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function submitNote() {
    if (!noteBody.trim() || !profile) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('project_notes').insert({
        project_id: projectId,
        organization_id: (profile as any).organization_id,
        author_id: profile.id,
        body: noteBody.trim(),
        is_internal: isInternal,
      });
      if (error) throw error;
      setNoteBody('');
      setIsInternal(false);
      await loadHistory();
    } catch (err) {
      console.error('Error adding note:', err);
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteNote(noteId: string) {
    setDeletingNoteId(noteId);
    try {
      const { error } = await supabase.from('project_notes').delete().eq('id', noteId);
      if (error) throw error;
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch (err) {
      console.error('Error deleting note:', err);
    } finally {
      setDeletingNoteId(null);
    }
  }

  // Merge and sort feed items
  const feed: FeedItem[] = [
    ...workOrders.map((w): FeedItem => ({ kind: 'wo', ts: w.created_at, data: w })),
    ...notes.map((n): FeedItem => ({ kind: 'note', ts: n.created_at, data: n })),
  ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  const totalHours = workOrders.reduce((sum, wo) => {
    return (
      sum + wo.time_entries.reduce((s, te) => s + (te.total_hours || 0), 0)
    );
  }, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-gray-400 text-sm">Loading history...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Summary Bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Work Orders</div>
          <div className="text-2xl font-bold text-white">{workOrders.length}</div>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Hours Logged</div>
          <div className="text-2xl font-bold text-white">{totalHours.toFixed(2)}</div>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Notes</div>
          <div className="text-2xl font-bold text-white">{notes.length}</div>
        </div>
      </div>

      {/* Add Note */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
        <div className="flex items-center gap-2 mb-3">
          <StickyNote size={16} className="text-gray-400" />
          <span className="text-sm font-medium text-gray-200">Add Note</span>
        </div>
        <textarea
          ref={textareaRef}
          value={noteBody}
          onChange={(e) => setNoteBody(e.target.value)}
          placeholder="Add a note to this project's history..."
          rows={3}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              submitNote();
            }
          }}
        />
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-3">
            {isElevated && (
              <button
                onClick={() => setIsInternal((v) => !v)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${
                  isInternal
                    ? 'bg-amber-900/50 text-amber-300 border border-amber-700'
                    : 'bg-gray-700 text-gray-400 hover:text-gray-200'
                }`}
              >
                <Lock size={12} />
                {isInternal ? 'Internal' : 'Mark Internal'}
              </button>
            )}
          </div>
          <button
            onClick={submitNote}
            disabled={!noteBody.trim() || submitting}
            className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={14} />
            {submitting ? 'Posting...' : 'Post Note'}
          </button>
        </div>
      </div>

      {/* Feed */}
      {feed.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Clock size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No history yet for this project.</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[23px] top-4 bottom-4 w-px bg-gray-700" />

          <div className="space-y-4">
            {feed.map((item) =>
              item.kind === 'note' ? (
                <NoteCard
                  key={`note-${item.data.id}`}
                  note={item.data as ProjectNote}
                  isAdmin={isAdmin}
                  currentUserId={profile?.id || ''}
                  onDelete={deleteNote}
                  deleting={deletingNoteId === item.data.id}
                />
              ) : (
                <WorkOrderCard
                  key={`wo-${item.data.id}`}
                  wo={item.data as WorkOrderEntry}
                  expanded={expandedWOs.has(item.data.id)}
                  onToggle={() => toggleWO(item.data.id)}
                  isElevated={isElevated}
                />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NoteCard({
  note,
  isAdmin,
  currentUserId,
  onDelete,
  deleting,
}: {
  note: ProjectNote;
  isAdmin: boolean;
  currentUserId: string;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  const canDelete = isAdmin || note.author?.full_name === undefined || (note as any).author_id === currentUserId;

  return (
    <div className="relative flex gap-4 pl-2">
      {/* Timeline dot */}
      <div
        className={`relative z-10 flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center border-2 ${
          note.is_internal
            ? 'bg-amber-900 border-amber-600'
            : 'bg-gray-700 border-gray-600'
        }`}
      >
        {note.is_internal ? (
          <Lock size={14} className="text-amber-400" />
        ) : (
          <StickyNote size={14} className="text-gray-300" />
        )}
      </div>

      <div
        className={`flex-1 rounded-xl p-4 border ${
          note.is_internal
            ? 'bg-amber-950/30 border-amber-800/50'
            : 'bg-gray-800 border-gray-700'
        }`}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-white">
              {note.author?.full_name || 'Staff'}
            </span>
            {note.is_internal && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-900/60 text-amber-300 border border-amber-700 flex items-center gap-1">
                <Lock size={10} />
                Internal
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-gray-500">{fmtDate(note.created_at)}</span>
            {(canDelete) && (
              <button
                onClick={() => onDelete(note.id)}
                disabled={deleting}
                className="text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
        <p className={`text-sm leading-relaxed whitespace-pre-wrap ${note.is_internal ? 'text-amber-100' : 'text-gray-300'}`}>
          {note.body}
        </p>
      </div>
    </div>
  );
}

function WorkOrderCard({
  wo,
  expanded,
  onToggle,
  isElevated,
}: {
  wo: WorkOrderEntry;
  expanded: boolean;
  onToggle: () => void;
  isElevated: boolean;
}) {
  const woHours = wo.time_entries.reduce((s, te) => s + (te.total_hours || 0), 0);

  return (
    <div className="relative flex gap-4 pl-2">
      {/* Timeline dot */}
      <div className="relative z-10 flex-shrink-0 w-9 h-9 rounded-full bg-blue-900 border-2 border-blue-600 flex items-center justify-center">
        <Wrench size={14} className="text-blue-300" />
      </div>

      <div className="flex-1 bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        {/* Card header */}
        <button
          onClick={onToggle}
          className="w-full text-left p-4 hover:bg-gray-750 transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-xs text-gray-500 font-mono">
                  {wo.work_order_number}
                </span>
                {wo.labor_phase && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/50 text-blue-300 border border-blue-700">
                    {wo.labor_phase.name}
                  </span>
                )}
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    STATUS_COLORS[wo.status] || 'bg-gray-700 text-gray-300'
                  }`}
                >
                  {wo.status.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="text-sm font-medium text-white truncate">{wo.title || 'Work Order'}</div>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                {wo.assigned_to_profile && (
                  <span className="flex items-center gap-1">
                    <User size={11} />
                    {wo.assigned_to_profile.full_name}
                  </span>
                )}
                {woHours > 0 && (
                  <span className="flex items-center gap-1">
                    <Timer size={11} />
                    {woHours.toFixed(2)} hrs logged
                  </span>
                )}
                <span>{fmtDate(wo.created_at)}</span>
              </div>
            </div>
            <div className="flex-shrink-0 text-gray-500">
              {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </div>
          </div>
        </button>

        {/* Expanded content */}
        {expanded && (
          <div className="border-t border-gray-700 divide-y divide-gray-700">
            {/* Notes */}
            {(wo.notes || (isElevated && wo.internal_notes)) && (
              <div className="p-4 space-y-3">
                {wo.notes && (
                  <div>
                    <div className="text-xs text-gray-400 font-medium mb-1 uppercase tracking-wide">Notes</div>
                    <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{wo.notes}</p>
                  </div>
                )}
                {isElevated && wo.internal_notes && (
                  <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-800/50">
                    <div className="text-xs text-amber-400 font-medium mb-1 flex items-center gap-1 uppercase tracking-wide">
                      <Lock size={10} />
                      Internal Notes
                    </div>
                    <p className="text-sm text-amber-100 leading-relaxed whitespace-pre-wrap">{wo.internal_notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* Time Entries */}
            {wo.time_entries.length > 0 ? (
              <div className="p-4">
                <div className="text-xs text-gray-400 font-medium mb-3 uppercase tracking-wide flex items-center gap-1.5">
                  <Clock size={12} />
                  Time Entries ({wo.time_entries.length})
                </div>
                <div className="space-y-2">
                  {wo.time_entries.map((te) => (
                    <div
                      key={te.id}
                      className="flex items-center justify-between gap-3 bg-gray-900 rounded-lg px-3 py-2.5"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                          <User size={13} className="text-gray-400" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-white truncate">
                            {te.technician?.full_name || 'Unknown'}
                          </div>
                          <div className="text-xs text-gray-400">
                            {fmtDate(te.entry_date)}
                            {(te.clock_in_time || te.clock_out_time) && (
                              <span className="ml-2">
                                {fmtTime(te.clock_in_time)} — {fmtTime(te.clock_out_time)}
                              </span>
                            )}
                          </div>
                          {te.notes && (
                            <div className="text-xs text-gray-500 mt-0.5 truncate">{te.notes}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-sm font-semibold text-blue-300 tabular-nums">
                        {fmtHours(te.total_hours)}
                      </div>
                    </div>
                  ))}
                </div>
                {woHours > 0 && (
                  <div className="flex justify-end mt-3 pt-2 border-t border-gray-700">
                    <span className="text-xs text-gray-400">
                      Total:{' '}
                      <span className="text-white font-semibold">{woHours.toFixed(2)} hrs</span>
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 flex items-center gap-2 text-xs text-gray-500">
                <AlertCircle size={13} />
                No time entries logged yet
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
