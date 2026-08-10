import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  CheckCircle, Circle, Clock, FileText, Wrench, Building2, Phone,
  Calendar, AlertCircle, ChevronDown, ChevronRight, DollarSign,
  ClipboardList, RefreshCw, ArrowRight, StickyNote, User,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface RecapWorkOrder {
  id: string;
  work_order_number: string;
  title: string;
  status: string;
  type: string;
  notes: string | null;
  internal_notes: string | null;
  is_billable: boolean;
  is_archived: boolean;
  actual_completion_date: string | null;
  updated_at: string;
  customer_contacted: boolean;
  project_id: string | null;
  project: { name: string; project_number: string } | null;
  contact: { full_name: string; company_name: string } | null;
  assigned_to_profile: { full_name: string } | null;
}

interface RecapAppointment {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  status: string;
  appointment_type: string | null;
  contact: { full_name: string; company_name: string } | null;
}

interface RecapLead {
  id: string;
  company_name: string;
  contact_name: string;
  status: string;
  priority: string;
  estimated_value: string;
  next_follow_up: string | null;
  last_contact_date: string | null;
}

interface RecapScheduledConnection {
  id: string;
  scheduled_date: string;
  notes: string | null;
  contact: { full_name: string; company_name: string } | null;
}

interface RecapTodoItem {
  id: string;
  item_type: 'billing' | 'notes' | 'follow_up' | 'appointment' | 'project';
  record_id: string | null;
  title: string;
  subtitle: string | null;
  is_completed: boolean;
  completed_at: string | null;
}

interface DailyRecapProps {
  repId: string | null;
  isManagerView: boolean;
  onNavigate: (tab: string, recordId?: string) => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getYesterday(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isSameDay(dateStr: string, refDate: Date): boolean {
  const d = new Date(dateStr + 'T00:00:00');
  return d.getTime() === refDate.getTime();
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function daysSince(dateStr: string): number {
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-500/20 text-green-400 border-green-500/30',
  in_progress: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  on_hold: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
  open: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  assigned: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

function getStatusBadge(status: string) {
  const cls = STATUS_COLORS[status] || STATUS_COLORS.open;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function DailyRecap({ repId, isManagerView, onNavigate }: DailyRecapProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [yesterdayWorkOrders, setYesterdayWorkOrders] = useState<RecapWorkOrder[]>([]);
  const [billingWorkOrders, setBillingWorkOrders] = useState<RecapWorkOrder[]>([]);
  const [todayAppointments, setTodayAppointments] = useState<RecapAppointment[]>([]);
  const [followUpLeads, setFollowUpLeads] = useState<RecapLead[]>([]);
  const [scheduledConnections, setScheduledConnections] = useState<RecapScheduledConnection[]>([]);
  const [todoItems, setTodoItems] = useState<RecapTodoItem[]>([]);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  const effectiveRepId = repId || profile?.id || null;
  const today = getToday();
  const yesterday = getYesterday();
  const todayStr = formatDateString(today);
  const yesterdayStr = formatDateString(yesterday);

  const loadRecap = useCallback(async () => {
    if (!effectiveRepId || !profile?.organization_id) return;

    setLoading(true);
    setError(null);
    setRefreshing(true);

    try {
      const yesterdayStart = yesterday.toISOString();
      const yesterdayEnd = new Date(yesterday);
      yesterdayEnd.setHours(23, 59, 59, 999);
      const yesterdayEndStr = yesterdayEnd.toISOString();

      const todayStart = today.toISOString();
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);
      const todayEndStr = todayEnd.toISOString();

      // Fetch work orders for this rep's customers that had activity yesterday
      // or are completed and ready for billing
      const safe = (q: any) => Promise.resolve(q).catch(() => ({ data: null, error: null }));

      const [
        woYesterdayResult,
        woBillingResult,
        apptsTodayResult,
        leadsResult,
        connectionsResult,
        todosResult,
      ] = await Promise.all([
        // Work orders updated yesterday for this rep's customers
        safe(supabase
          .from('work_orders')
          .select(`
            id, work_order_number, title, status, type, notes, internal_notes,
            is_billable, is_archived, actual_completion_date, updated_at,
            customer_contacted, project_id,
            project:projects(name, project_number),
            contact:contacts(full_name, company_name),
            assigned_to_profile:profiles!work_orders_assigned_to_fkey(full_name)
          `)
          .eq('customer_sales_rep_id', effectiveRepId)
          .gte('updated_at', yesterdayStart)
          .lte('updated_at', yesterdayEndStr)
          .order('updated_at', { ascending: false })),

        // Completed, billable, non-archived work orders ready for billing
        safe(supabase
          .from('work_orders')
          .select(`
            id, work_order_number, title, status, type, notes, internal_notes,
            is_billable, is_archived, actual_completion_date, updated_at,
            customer_contacted, project_id,
            project:projects(name, project_number),
            contact:contacts(full_name, company_name),
            assigned_to_profile:profiles!work_orders_assigned_to_fkey(full_name)
          `)
          .eq('customer_sales_rep_id', effectiveRepId)
          .eq('status', 'completed')
          .eq('is_billable', true)
          .eq('is_archived', false)
          .order('actual_completion_date', { ascending: false })),

        // Today's appointments for this rep's customers
        safe(supabase
          .from('appointments')
          .select(`
            id, title, start_time, end_time, status, appointment_type,
            contact:contacts(full_name, company_name)
          `)
          .eq('sales_rep_id', effectiveRepId)
          .gte('start_time', todayStart)
          .lte('start_time', todayEndStr)
          .order('start_time', { ascending: true })),

        // Leads assigned to this rep needing follow-up today
        safe(supabase
          .from('leads')
          .select('id, company_name, contact_name, status, priority, estimated_value, next_follow_up, last_contact_date')
          .eq('assigned_to', effectiveRepId)
          .in('status', ['new', 'contacted', 'qualified', 'proposal', 'negotiation'])
          .or(`next_follow_up.lte.${todayEndStr},next_follow_up.is.null`)
          .order('priority', { ascending: true })
          .limit(10)),

        // Scheduled connections due today
        safe(supabase
          .from('scheduled_connections')
          .select(`
            id, scheduled_date, notes,
            contact:contacts(full_name, company_name)
          `)
          .eq('assigned_to', effectiveRepId)
          .eq('status', 'pending')
          .gte('scheduled_date', todayStart)
          .lte('scheduled_date', todayEndStr)
          .order('scheduled_date', { ascending: true })),

        // Existing todo items for today
        safe(supabase
          .from('daily_recap_todos')
          .select('id, item_type, record_id, title, subtitle, is_completed, completed_at')
          .eq('user_id', effectiveRepId)
          .eq('recap_date', todayStr)),
      ]);

      setYesterdayWorkOrders((woYesterdayResult.data as RecapWorkOrder[]) || []);
      setBillingWorkOrders((woBillingResult.data as RecapWorkOrder[]) || []);
      setTodayAppointments((apptsTodayResult.data as RecapAppointment[]) || []);
      setFollowUpLeads((leadsResult.data as RecapLead[]) || []);
      setScheduledConnections((connectionsResult.data as RecapScheduledConnection[]) || []);
      setTodoItems((todosResult.data as RecapTodoItem[]) || []);
    } catch (err) {
      console.error('Error loading daily recap:', err);
      setError('Failed to load your daily recap. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [effectiveRepId, profile?.organization_id, todayStr, yesterday, today]);

  useEffect(() => {
    loadRecap();
  }, [loadRecap]);

  // ─── Auto-generate todo items from recap data ──────────────────────────────

  const generatedTodos = useMemo(() => {
    const items: Array<{
      item_type: RecapTodoItem['item_type'];
      record_id: string;
      title: string;
      subtitle: string | null;
    }> = [];

    // Billing items from completed work orders
    billingWorkOrders.forEach((wo) => {
      items.push({
        item_type: 'billing',
        record_id: wo.id,
        title: `Bill out ${wo.work_order_number}`,
        subtitle: wo.contact?.full_name || wo.contact?.company_name || wo.title,
      });
    });

    // Notes review items from yesterday's completed work orders
    yesterdayWorkOrders.forEach((wo) => {
      if (wo.notes || wo.internal_notes) {
        items.push({
          item_type: 'notes',
          record_id: wo.id,
          title: `Review notes on ${wo.work_order_number}`,
          subtitle: wo.contact?.full_name || wo.contact?.company_name || wo.title,
        });
      }
      if (!wo.customer_contacted && wo.status === 'completed') {
        items.push({
          item_type: 'follow_up',
          record_id: wo.id,
          title: `Follow up with ${wo.contact?.full_name || 'customer'} about ${wo.work_order_number}`,
          subtitle: 'Customer was not contacted by technician',
        });
      }
    });

    // Follow-up leads
    followUpLeads.forEach((lead) => {
      items.push({
        item_type: 'follow_up',
        record_id: lead.id,
        title: `Follow up with ${lead.contact_name || lead.company_name}`,
        subtitle: `Status: ${lead.status}`,
      });
    });

    // Scheduled connections
    scheduledConnections.forEach((conn) => {
      items.push({
        item_type: 'follow_up',
        record_id: conn.id,
        title: `Connect with ${conn.contact?.full_name || conn.contact?.company_name || 'contact'}`,
        subtitle: conn.notes || undefined,
      });
    });

    // Today's appointments
    todayAppointments.forEach((appt) => {
      items.push({
        item_type: 'appointment',
        record_id: appt.id,
        title: `Appointment: ${appt.title}`,
        subtitle: appt.contact?.full_name || appt.contact?.company_name || undefined,
      });
    });

    // Deduplicate by (item_type, record_id)
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = `${item.item_type}:${item.record_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [billingWorkOrders, yesterdayWorkOrders, followUpLeads, scheduledConnections, todayAppointments]);

  // Sync generated todos to DB (insert new ones that don't exist yet)
  useEffect(() => {
    if (!effectiveRepId || !profile?.organization_id || generatedTodos.length === 0) return;

    const existingKeys = new Set(
      todoItems.map((t) => `${t.item_type}:${t.record_id}`)
    );

    const newItems = generatedTodos.filter(
      (item) => !existingKeys.has(`${item.item_type}:${item.record_id}`)
    );

    if (newItems.length === 0) return;

    const inserts = newItems.map((item) => ({
      organization_id: profile.organization_id,
      user_id: effectiveRepId,
      recap_date: todayStr,
      item_type: item.item_type,
      record_id: item.record_id,
      title: item.title,
      subtitle: item.subtitle || null,
      is_completed: false,
    }));

    supabase
      .from('daily_recap_todos')
      .insert(inserts)
      .then(({ error: insertError }) => {
        if (insertError) {
          // Unique constraint violation = items already exist, safe to ignore
          if (insertError.code !== '23505') {
            console.error('Error creating recap todos:', insertError);
          }
        } else {
          // Reload todos to show the newly created items
          loadRecap();
        }
      });
  }, [generatedTodos, effectiveRepId, profile?.organization_id, todayStr, todoItems]);

  // ─── Toggle todo completion ───────────────────────────────────────────────

  const toggleTodo = useCallback(async (todoId: string, currentCompleted: boolean) => {
    // Optimistic update
    setTodoItems((prev) =>
      prev.map((t) =>
        t.id === todoId
          ? {
              ...t,
              is_completed: !currentCompleted,
              completed_at: !currentCompleted ? new Date().toISOString() : null,
            }
          : t
      )
    );

    const { error: updateError } = await supabase
      .from('daily_recap_todos')
      .update({
        is_completed: !currentCompleted,
        completed_at: !currentCompleted ? new Date().toISOString() : null,
      })
      .eq('id', todoId);

    if (updateError) {
      // Revert on error
      setTodoItems((prev) =>
        prev.map((t) =>
          t.id === todoId
            ? { ...t, is_completed: currentCompleted, completed_at: currentCompleted ? t.completed_at : null }
            : t
        )
      );
      console.error('Error updating todo:', updateError);
    }
  }, []);

  // ─── Derived data ─────────────────────────────────────────────────────────

  const incompleteTodos = todoItems.filter((t) => !t.is_completed);
  const completeTodos = todoItems.filter((t) => t.is_completed);

  const summary = {
    completedYesterday: yesterdayWorkOrders.filter((w) => w.status === 'completed').length,
    readyToBill: billingWorkOrders.length,
    notesToReview: yesterdayWorkOrders.filter((w) => w.notes || w.internal_notes).length,
    followUpsDue: followUpLeads.length + scheduledConnections.length,
    appointmentsToday: todayAppointments.length,
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-5 h-5 text-gray-400 animate-spin mr-2" />
        <span className="text-gray-400">Loading your daily recap...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-900/20 p-6 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-red-300">Failed to load recap</p>
          <p className="text-xs text-red-400 mt-1">{error}</p>
          <button
            onClick={loadRecap}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <SummaryCard
          icon={<CheckCircle className="w-4 h-4" />}
          label="Completed Yesterday"
          value={summary.completedYesterday}
          color="text-green-400"
          bg="bg-green-500/10 border-green-500/20"
        />
        <SummaryCard
          icon={<DollarSign className="w-4 h-4" />}
          label="Ready to Bill"
          value={summary.readyToBill}
          color="text-amber-400"
          bg="bg-amber-500/10 border-amber-500/20"
        />
        <SummaryCard
          icon={<StickyNote className="w-4 h-4" />}
          label="Notes to Review"
          value={summary.notesToReview}
          color="text-blue-400"
          bg="bg-blue-500/10 border-blue-500/20"
        />
        <SummaryCard
          icon={<Phone className="w-4 h-4" />}
          label="Follow-ups Due"
          value={summary.followUpsDue}
          color="text-orange-400"
          bg="bg-orange-500/10 border-orange-500/20"
        />
        <SummaryCard
          icon={<Calendar className="w-4 h-4" />}
          label="Appointments Today"
          value={summary.appointmentsToday}
          color="text-cyan-400"
          bg="bg-cyan-500/10 border-cyan-500/20"
        />
      </div>

      {/* Daily Checklist */}
      <RecapSection
        title="Today's Checklist"
        icon={<ClipboardList className="w-5 h-5 text-blue-400" />}
        count={incompleteTodos.length}
      >
        {incompleteTodos.length === 0 && completeTodos.length === 0 ? (
          <EmptyState message="You're all caught up. Nothing needs your attention right now." />
        ) : (
          <div className="space-y-2">
            {incompleteTodos.map((todo) => (
              <TodoRow
                key={todo.id}
                todo={todo}
                onToggle={() => toggleTodo(todo.id, todo.is_completed)}
                onNavigate={onNavigate}
              />
            ))}
            {completeTodos.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-400 flex items-center gap-1.5 select-none">
                  <ChevronRight className="w-3.5 h-3.5" />
                  Completed ({{ completeTodos }.completeTodos.length})
                </summary>
                <div className="mt-2 space-y-2 opacity-60">
                  {completeTodos.map((todo) => (
                    <TodoRow
                      key={todo.id}
                      todo={todo}
                      onToggle={() => toggleTodo(todo.id, todo.is_completed)}
                      onNavigate={onNavigate}
                    />
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </RecapSection>

      {/* Needs Billing */}
      <RecapSection
        title="Needs Billing"
        icon={<DollarSign className="w-5 h-5 text-amber-400" />}
        count={billingWorkOrders.length}
        defaultOpen={billingWorkOrders.length > 0}
      >
        {billingWorkOrders.length === 0 ? (
          <EmptyState message="No completed work orders are waiting to be billed." />
        ) : (
          <div className="space-y-2">
            {billingWorkOrders.map((wo) => (
              <WorkOrderBillingRow
                key={wo.id}
                wo={wo}
                onBill={() => onNavigate('work_orders', wo.id)}
                onArchive={() => onNavigate('work_orders', wo.id)}
              />
            ))}
          </div>
        )}
      </RecapSection>

      {/* Yesterday's Work */}
      <RecapSection
        title="Yesterday's Work"
        icon={<Wrench className="w-5 h-5 text-green-400" />}
        count={yesterdayWorkOrders.length}
        defaultOpen={yesterdayWorkOrders.length > 0}
      >
        {yesterdayWorkOrders.length === 0 ? (
          <EmptyState message="No work order activity for your customers yesterday." />
        ) : (
          <div className="space-y-2">
            {yesterdayWorkOrders.map((wo) => (
              <WorkOrderRow
                key={wo.id}
                wo={wo}
                expanded={expandedNotes.has(wo.id)}
                onToggleNotes={() =>
                  setExpandedNotes((prev) => {
                    const next = new Set(prev);
                    if (next.has(wo.id)) next.delete(wo.id);
                    else next.add(wo.id);
                    return next;
                  })
                }
                onNavigate={() => onNavigate('work_orders', wo.id)}
              />
            ))}
          </div>
        )}
      </RecapSection>

      {/* Today's Schedule */}
      <RecapSection
        title="Today's Schedule"
        icon={<Calendar className="w-5 h-5 text-cyan-400" />}
        count={todayAppointments.length}
        defaultOpen={todayAppointments.length > 0}
      >
        {todayAppointments.length === 0 ? (
          <EmptyState message="No appointments scheduled for today." />
        ) : (
          <div className="space-y-2">
            {todayAppointments.map((appt) => (
              <div
                key={appt.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-gray-900/60 border border-gray-700/50 hover:border-gray-600 transition-colors cursor-pointer"
                onClick={() => onNavigate('calendar')}
              >
                <div className="flex-shrink-0 w-16 text-center">
                  <div className="text-sm font-semibold text-cyan-400">
                    {formatTime(appt.start_time)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatTime(appt.end_time)}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">
                    {appt.title}
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    {appt.contact?.full_name || appt.contact?.company_name || 'No contact'}
                  </div>
                </div>
                {appt.appointment_type && (
                  <span className="text-xs text-gray-500 hidden sm:inline">
                    {appt.appointment_type.replace(/_/g, ' ')}
                  </span>
                )}
                <ArrowRight className="w-4 h-4 text-gray-600 flex-shrink-0" />
              </div>
            ))}
          </div>
        )}
      </RecapSection>

      {/* Follow-ups */}
      {(followUpLeads.length > 0 || scheduledConnections.length > 0) && (
        <RecapSection
          title="Follow-ups Due Today"
          icon={<Phone className="w-5 h-5 text-orange-400" />}
          count={followUpLeads.length + scheduledConnections.length}
          defaultOpen
        >
          <div className="space-y-2">
            {scheduledConnections.map((conn) => (
              <div
                key={conn.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-gray-900/60 border border-gray-700/50 hover:border-gray-600 transition-colors cursor-pointer"
                onClick={() => onNavigate('connections')}
              >
                <Phone className="w-4 h-4 text-orange-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">
                    {conn.contact?.full_name || conn.contact?.company_name || 'Connection'}
                  </div>
                  {conn.notes && (
                    <div className="text-xs text-gray-400 truncate">{conn.notes}</div>
                  )}
                </div>
                <span className="text-xs text-gray-500">
                  {formatTime(conn.scheduled_date)}
                </span>
              </div>
            ))}
            {followUpLeads.map((lead) => (
              <div
                key={lead.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-gray-900/60 border border-gray-700/50 hover:border-gray-600 transition-colors cursor-pointer"
                onClick={() => onNavigate('pipeline_board', lead.id)}
              >
                <User className="w-4 h-4 text-orange-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">
                    {lead.contact_name || lead.company_name}
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    {lead.status} · {lead.priority} priority
                  </div>
                </div>
                {lead.estimated_value && parseFloat(lead.estimated_value) > 0 && (
                  <span className="text-xs text-gray-500">
                    ${parseFloat(lead.estimated_value).toLocaleString()}
                  </span>
                )}
                <ArrowRight className="w-4 h-4 text-gray-600 flex-shrink-0" />
              </div>
            ))}
          </div>
        </RecapSection>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function SummaryCard({
  icon,
  label,
  value,
  color,
  bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  bg: string;
}) {
  return (
    <div className={`rounded-lg border p-3 ${bg}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={color}>{icon}</span>
        <span className="text-xs text-gray-400 font-medium">{label}</span>
      </div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function RecapSection({
  title,
  icon,
  count,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-750 transition-colors"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
        )}
        <span className="flex-shrink-0">{icon}</span>
        <h3 className="text-sm font-semibold text-white flex-1 text-left">{title}</h3>
        {count > 0 && (
          <span className="text-xs font-medium text-gray-400 bg-gray-700 px-2 py-0.5 rounded-full">
            {count}
          </span>
        )}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-6 text-center">
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  );
}

function TodoRow({
  todo,
  onToggle,
  onNavigate,
}: {
  todo: RecapTodoItem;
  onToggle: () => void;
  onNavigate: (tab: string, recordId?: string) => void;
}) {
  const iconMap: Record<string, React.ReactNode> = {
    billing: <DollarSign className="w-4 h-4 text-amber-400" />,
    notes: <StickyNote className="w-4 h-4 text-blue-400" />,
    follow_up: <Phone className="w-4 h-4 text-orange-400" />,
    appointment: <Calendar className="w-4 h-4 text-cyan-400" />,
    project: <Building2 className="w-4 h-4 text-green-400" />,
  };

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
        todo.is_completed
          ? 'bg-gray-900/40 border-gray-700/30'
          : 'bg-gray-900/60 border-gray-700/50 hover:border-gray-600'
      }`}
    >
      <button
        onClick={onToggle}
        className="flex-shrink-0 text-gray-400 hover:text-white transition-colors"
      >
        {todo.is_completed ? (
          <CheckCircle className="w-5 h-5 text-green-400" />
        ) : (
          <Circle className="w-5 h-5" />
        )}
      </button>
      <span className="flex-shrink-0">{iconMap[todo.item_type]}</span>
      <div
        className="flex-1 min-w-0 cursor-pointer"
        onClick={() => {
          if (todo.item_type === 'billing' || todo.item_type === 'notes') {
            onNavigate('work_orders', todo.record_id || undefined);
          } else if (todo.item_type === 'follow_up') {
            onNavigate('pipeline_board', todo.record_id || undefined);
          } else if (todo.item_type === 'appointment') {
            onNavigate('calendar');
          }
        }}
      >
        <div
          className={`text-sm font-medium truncate ${
            todo.is_completed ? 'text-gray-500 line-through' : 'text-white'
          }`}
        >
          {todo.title}
        </div>
        {todo.subtitle && (
          <div className="text-xs text-gray-400 truncate">{todo.subtitle}</div>
        )}
      </div>
      <ArrowRight className="w-4 h-4 text-gray-600 flex-shrink-0" />
    </div>
  );
}

function WorkOrderBillingRow({
  wo,
  onBill,
  onArchive,
}: {
  wo: RecapWorkOrder;
  onBill: () => void;
  onArchive: () => void;
}) {
  const completionDate = wo.actual_completion_date || wo.updated_at;
  const daysOld = daysSince(completionDate);

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-900/60 border border-gray-700/50 hover:border-gray-600 transition-colors">
      <div className="flex-shrink-0">
        <div className="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center">
          <DollarSign className="w-4 h-4 text-amber-400" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white truncate">
          {wo.work_order_number} — {wo.contact?.full_name || wo.contact?.company_name || wo.title}
        </div>
        <div className="text-xs text-gray-400 mt-0.5">
          Completed {daysOld} day{daysOld !== 1 ? 's' : ''} ago
          {wo.project && ` · ${wo.project.name}`}
        </div>
      </div>
      <button
        onClick={onBill}
        className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 transition-colors"
      >
        <FileText className="w-3.5 h-3.5" />
        Create Invoice
      </button>
    </div>
  );
}

function WorkOrderRow({
  wo,
  expanded,
  onToggleNotes,
  onNavigate,
}: {
  wo: RecapWorkOrder;
  expanded: boolean;
  onToggleNotes: () => void;
  onNavigate: () => void;
}) {
  const hasNotes = wo.notes || wo.internal_notes;

  return (
    <div className="rounded-lg bg-gray-900/60 border border-gray-700/50 hover:border-gray-600 transition-colors">
      <div
        className="flex items-center gap-3 p-3 cursor-pointer"
        onClick={onNavigate}
      >
        <div className="flex-shrink-0">
          {wo.project_id ? (
            <Building2 className="w-4 h-4 text-green-400" />
          ) : (
            <Wrench className="w-4 h-4 text-blue-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white truncate">
            {wo.work_order_number} — {wo.contact?.full_name || wo.contact?.company_name || wo.title}
          </div>
          <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
            {getStatusBadge(wo.status)}
            {wo.assigned_to_profile?.full_name && (
              <span>Tech: {wo.assigned_to_profile.full_name}</span>
            )}
            {wo.project && <span>· {wo.project.name}</span>}
            {!wo.customer_contacted && wo.status === 'completed' && (
              <span className="text-orange-400 font-medium">· Customer not contacted</span>
            )}
          </div>
        </div>
        {hasNotes && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleNotes();
            }}
            className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-blue-400 hover:bg-blue-500/10 transition-colors"
          >
            <StickyNote className="w-3.5 h-3.5" />
            Notes
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        )}
        <ArrowRight className="w-4 h-4 text-gray-600 flex-shrink-0" />
      </div>

      {expanded && hasNotes && (
        <div className="px-3 pb-3 space-y-2">
          {wo.notes && (
            <div className="rounded-lg bg-gray-800/80 p-3 border border-gray-700/50">
              <div className="text-xs font-medium text-blue-400 mb-1">Job Notes</div>
              <p className="text-sm text-gray-300 whitespace-pre-wrap">{wo.notes}</p>
            </div>
          )}
          {wo.internal_notes && (
            <div className="rounded-lg bg-gray-800/80 p-3 border border-gray-700/50">
              <div className="text-xs font-medium text-orange-400 mb-1">Internal Notes</div>
              <p className="text-sm text-gray-300 whitespace-pre-wrap">{wo.internal_notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
