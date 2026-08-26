import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FolderKanban,
  ShieldAlert,
  Target,
  Timer,
  Users,
  Wifi,
  WifiOff,
  Wrench,
} from 'lucide-react';

interface TechOnDuty {
  id: string;
  name: string;
  clockInTime: string;
  status: 'available' | 'on_job' | 'traveling';
  currentJob: string | null;
  jobTitle: string | null;
}

interface WorkOrderItem {
  id: string;
  work_order_number: string;
  title: string;
  status: string;
  priority: string;
  assigned_to_name: string | null;
  needs_info: boolean;
  blocked_reason: string | null;
}

interface ServiceRequestItem {
  id: string;
  service_request_number: string;
  description: string;
  status: string;
  created_at: string;
  contact_name: string | null;
}

interface PunchlistItem {
  id: string;
  description: string;
  status: string;
  created_at: string;
  project_name: string | null;
}

interface ProjectItem {
  id: string;
  name: string;
  status: string;
  target_completion_date: string | null;
  contact_name: string | null;
}

interface DashboardMetrics {
  activeWorkOrders: number;
  openServiceRequests: number;
  agingServiceRequests: number;
  openPunchlist: number;
  agingPunchlist: number;
  activeProjects: number;
  atRiskProjects: number;
  blockedWorkOrders: number;
  todayTotal: number;
  todayCompleted: number;
  todayOnSite: number;
  todayTraveling: number;
  todayScheduled: number;
}

interface AttentionItem {
  id: string;
  title: string;
  detail: string;
  meta: string;
  severity: 'critical' | 'warning';
}

const EMPTY_METRICS: DashboardMetrics = {
  activeWorkOrders: 0,
  openServiceRequests: 0,
  agingServiceRequests: 0,
  openPunchlist: 0,
  agingPunchlist: 0,
  activeProjects: 0,
  atRiskProjects: 0,
  blockedWorkOrders: 0,
  todayTotal: 0,
  todayCompleted: 0,
  todayOnSite: 0,
  todayTraveling: 0,
  todayScheduled: 0,
};

const OPEN_WORK_ORDER_FILTER = '("completed","cancelled","archived")';
const OPEN_PROJECT_FILTER = '("completed","cancelled")';
const SERVICE_STATUSES = ['pending', 'in_progress', 'dispatched'];
const PUNCHLIST_STATUSES = ['pending', 'submitted', 'in_progress'];

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeStatus(status: string | null | undefined) {
  return (status || '').toLowerCase().replace(/\s+/g, '_');
}

function timeAgo(dateStr: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

function formatClockDuration(clockIn: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(clockIn).getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours > 0 ? `${hours}h ${remainder}m` : `${remainder}m`;
}

export default function TVDashboard() {
  const [techs, setTechs] = useState<TechOnDuty[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrderItem[]>([]);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequestItem[]>([]);
  const [punchlistItems, setPunchlistItems] = useState<PunchlistItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics>(EMPTY_METRICS);
  const [orgName, setOrgName] = useState('');
  const [orgLogo, setOrgLogo] = useState('');
  const [isConnected, setIsConnected] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const loadOrg = useCallback(async () => {
    const { data, error } = await supabase
      .from('organizations')
      .select('name, logo_url')
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      setOrgName(data.name || '');
      setOrgLogo(data.logo_url || '');
    }
  }, []);

  const loadTechs = useCallback(async () => {
    const { data: clockData, error: clockError } = await supabase
      .from('daily_clock_entries')
      .select(`
        technician_id,
        clock_in,
        profiles:technician_id (
          id,
          first_name,
          last_name
        )
      `)
      .is('clock_out', null)
      .order('clock_in', { ascending: false });

    if (clockError) throw clockError;

    const { data: activeWOs, error: woError } = await supabase
      .from('work_orders')
      .select('id, work_order_number, title, assigned_to, status')
      .in('status', ['in_progress', 'traveling', 'on_site']);

    if (woError) throw woError;

    const techMap = new Map<string, TechOnDuty>();
    (clockData || []).forEach((entry: any) => {
      if (!entry.profiles || !entry.technician_id || techMap.has(entry.technician_id)) return;

      const name = `${entry.profiles.first_name || ''} ${entry.profiles.last_name || ''}`.trim();
      if (!name) return;

      const wo = activeWOs?.find((item: any) => item.assigned_to === entry.technician_id);
      const status = normalizeStatus(wo?.status);

      techMap.set(entry.technician_id, {
        id: entry.technician_id,
        name,
        clockInTime: entry.clock_in,
        status: !wo ? 'available' : status === 'traveling' ? 'traveling' : 'on_job',
        currentJob: wo?.work_order_number || null,
        jobTitle: wo?.title || null,
      });
    });

    setTechs(Array.from(techMap.values()));
  }, []);

  const loadWorkOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from('work_orders')
      .select('id, work_order_number, title, status, priority, assigned_to_name, needs_info, blocked_reason')
      .not('status', 'in', OPEN_WORK_ORDER_FILTER)
      .order('start_date', { ascending: true })
      .limit(24);

    if (error) throw error;
    setWorkOrders((data || []) as WorkOrderItem[]);
  }, []);

  const loadServiceRequests = useCallback(async () => {
    const { data, error } = await supabase
      .from('service_requests')
      .select('id, service_request_number, description, status, created_at, contacts(full_name)')
      .in('status', SERVICE_STATUSES)
      .order('created_at', { ascending: true })
      .limit(20);

    if (error) throw error;
    setServiceRequests((data || []).map((item: any) => ({
      id: item.id,
      service_request_number: item.service_request_number,
      description: item.description,
      status: item.status,
      created_at: item.created_at,
      contact_name: item.contacts?.full_name || null,
    })));
  }, []);

  const loadPunchlist = useCallback(async () => {
    const { data, error } = await supabase
      .from('punchlist_tasks')
      .select('id, description, status, created_at, projects(name)')
      .in('status', PUNCHLIST_STATUSES)
      .order('created_at', { ascending: true })
      .limit(20);

    if (error) throw error;
    setPunchlistItems((data || []).map((item: any) => ({
      id: item.id,
      description: item.description,
      status: item.status,
      created_at: item.created_at,
      project_name: item.projects?.name || null,
    })));
  }, []);

  const loadProjects = useCallback(async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, status, target_completion_date, contacts(full_name)')
      .not('status', 'in', OPEN_PROJECT_FILTER)
      .order('target_completion_date', { ascending: true, nullsFirst: false })
      .limit(20);

    if (error) throw error;
    setProjects((data || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      status: item.status,
      target_completion_date: item.target_completion_date,
      contact_name: item.contacts?.full_name || null,
    })));
  }, []);

  const loadMetrics = useCallback(async () => {
    const today = localDateKey();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
      activeWoResult,
      openServiceResult,
      agingServiceResult,
      openPunchlistResult,
      agingPunchlistResult,
      activeProjectsResult,
      atRiskProjectsResult,
      blockedWoResult,
      todayWorkOrdersResult,
    ] = await Promise.all([
      supabase.from('work_orders').select('id', { count: 'exact', head: true }).not('status', 'in', OPEN_WORK_ORDER_FILTER),
      supabase.from('service_requests').select('id', { count: 'exact', head: true }).in('status', SERVICE_STATUSES),
      supabase.from('service_requests').select('id', { count: 'exact', head: true }).in('status', SERVICE_STATUSES).lt('created_at', oneDayAgo),
      supabase.from('punchlist_tasks').select('id', { count: 'exact', head: true }).in('status', PUNCHLIST_STATUSES),
      supabase.from('punchlist_tasks').select('id', { count: 'exact', head: true }).in('status', PUNCHLIST_STATUSES).lt('created_at', sevenDaysAgo),
      supabase.from('projects').select('id', { count: 'exact', head: true }).not('status', 'in', OPEN_PROJECT_FILTER),
      supabase.from('projects').select('id', { count: 'exact', head: true }).not('status', 'in', OPEN_PROJECT_FILTER).lt('target_completion_date', today),
      supabase.from('work_orders').select('id', { count: 'exact', head: true }).not('status', 'in', OPEN_WORK_ORDER_FILTER).or('needs_info.eq.true,status.eq.blocked'),
      supabase.from('work_orders').select('id, status').eq('start_date', today).not('status', 'in', '("cancelled","archived")'),
    ]);

    const results = [
      activeWoResult,
      openServiceResult,
      agingServiceResult,
      openPunchlistResult,
      agingPunchlistResult,
      activeProjectsResult,
      atRiskProjectsResult,
      blockedWoResult,
      todayWorkOrdersResult,
    ];
    const firstError = results.find(result => result.error)?.error;
    if (firstError) throw firstError;

    const todayRows = todayWorkOrdersResult.data || [];
    const completed = todayRows.filter((item: any) => ['completed', 'complete', 'closed'].includes(normalizeStatus(item.status))).length;
    const onSite = todayRows.filter((item: any) => normalizeStatus(item.status) === 'on_site').length;
    const traveling = todayRows.filter((item: any) => normalizeStatus(item.status) === 'traveling').length;
    const scheduled = Math.max(0, todayRows.length - completed - onSite - traveling);

    setMetrics({
      activeWorkOrders: activeWoResult.count || 0,
      openServiceRequests: openServiceResult.count || 0,
      agingServiceRequests: agingServiceResult.count || 0,
      openPunchlist: openPunchlistResult.count || 0,
      agingPunchlist: agingPunchlistResult.count || 0,
      activeProjects: activeProjectsResult.count || 0,
      atRiskProjects: atRiskProjectsResult.count || 0,
      blockedWorkOrders: blockedWoResult.count || 0,
      todayTotal: todayRows.length,
      todayCompleted: completed,
      todayOnSite: onSite,
      todayTraveling: traveling,
      todayScheduled: scheduled,
    });
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      await Promise.all([
        loadOrg(),
        loadTechs(),
        loadWorkOrders(),
        loadServiceRequests(),
        loadPunchlist(),
        loadProjects(),
        loadMetrics(),
      ]);
      setIsConnected(true);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('TV dashboard refresh failed:', error);
      setIsConnected(false);
    }
  }, [loadMetrics, loadOrg, loadProjects, loadPunchlist, loadServiceRequests, loadTechs, loadWorkOrders]);

  const refreshProduction = useCallback(async (...loaders: Array<() => Promise<void>>) => {
    try {
      await Promise.all([...loaders.map(loader => loader()), loadMetrics()]);
      setIsConnected(true);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('TV dashboard realtime refresh failed:', error);
      setIsConnected(false);
    }
  }, [loadMetrics]);

  useEffect(() => {
    refreshAll();
    const fallback = window.setInterval(refreshAll, 30000);

    const channels = [
      supabase.channel('tv-kpi-clock').on('postgres_changes', { event: '*', schema: 'public', table: 'daily_clock_entries' }, () => refreshProduction(loadTechs)).subscribe(),
      supabase.channel('tv-kpi-wo').on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => refreshProduction(loadWorkOrders, loadTechs)).subscribe(),
      supabase.channel('tv-kpi-service').on('postgres_changes', { event: '*', schema: 'public', table: 'service_requests' }, () => refreshProduction(loadServiceRequests)).subscribe(),
      supabase.channel('tv-kpi-punch').on('postgres_changes', { event: '*', schema: 'public', table: 'punchlist_tasks' }, () => refreshProduction(loadPunchlist)).subscribe(),
      supabase.channel('tv-kpi-projects').on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => refreshProduction(loadProjects)).subscribe(),
    ];

    return () => {
      window.clearInterval(fallback);
      channels.forEach(channel => supabase.removeChannel(channel));
    };
  }, [loadProjects, loadPunchlist, loadServiceRequests, loadTechs, loadWorkOrders, refreshAll, refreshProduction]);

  const productiveTechs = techs.filter(tech => tech.status !== 'available').length;
  const utilization = techs.length > 0 ? Math.round((productiveTechs / techs.length) * 100) : 0;
  const todayPace = metrics.todayTotal > 0 ? Math.round((metrics.todayCompleted / metrics.todayTotal) * 100) : 0;

  const attentionItems = useMemo<AttentionItem[]>(() => {
    const today = localDateKey();
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const sevenDaysMs = 7 * oneDayMs;
    const items: AttentionItem[] = [];

    workOrders
      .filter(wo => wo.needs_info || normalizeStatus(wo.status) === 'blocked')
      .forEach(wo => items.push({
        id: `wo-${wo.id}`,
        title: `WO ${wo.work_order_number} needs attention`,
        detail: wo.blocked_reason || wo.title || 'Blocked or waiting on information',
        meta: wo.assigned_to_name || 'Unassigned',
        severity: 'critical',
      }));

    serviceRequests
      .filter(sr => now - new Date(sr.created_at).getTime() >= oneDayMs)
      .forEach(sr => items.push({
        id: `sr-${sr.id}`,
        title: `Service ${sr.service_request_number} is aging`,
        detail: sr.contact_name || sr.description || 'Open service request',
        meta: `Open ${timeAgo(sr.created_at)}`,
        severity: now - new Date(sr.created_at).getTime() >= 3 * oneDayMs ? 'critical' : 'warning',
      }));

    projects
      .filter(project => project.target_completion_date && project.target_completion_date < today)
      .forEach(project => items.push({
        id: `project-${project.id}`,
        title: `${project.name} is past target`,
        detail: project.contact_name || 'Active project',
        meta: `Due ${new Date(`${project.target_completion_date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        severity: 'critical',
      }));

    punchlistItems
      .filter(item => now - new Date(item.created_at).getTime() >= sevenDaysMs)
      .forEach(item => items.push({
        id: `punch-${item.id}`,
        title: 'Punchlist item is aging',
        detail: item.project_name || item.description,
        meta: `Open ${timeAgo(item.created_at)}`,
        severity: 'warning',
      }));

    return items
      .sort((a, b) => Number(b.severity === 'critical') - Number(a.severity === 'critical'))
      .slice(0, 6);
  }, [projects, punchlistItems, serviceRequests, workOrders]);

  const kpis = [
    {
      label: 'Clocked In',
      value: techs.length.toString(),
      detail: `${productiveTechs} active in field`,
      icon: <Users className="h-6 w-6" />,
      tone: 'green' as const,
    },
    {
      label: 'Tech Utilization',
      value: `${utilization}%`,
      detail: `${productiveTechs} of ${techs.length} productive`,
      icon: <Activity className="h-6 w-6" />,
      tone: utilization >= 75 ? 'green' as const : utilization >= 50 ? 'amber' as const : 'red' as const,
    },
    {
      label: "Today's Jobs",
      value: `${metrics.todayCompleted}/${metrics.todayTotal}`,
      detail: `${todayPace}% complete`,
      icon: <CheckCircle2 className="h-6 w-6" />,
      tone: todayPace >= 75 ? 'green' as const : 'blue' as const,
    },
    {
      label: 'Open Service',
      value: metrics.openServiceRequests.toString(),
      detail: metrics.agingServiceRequests > 0 ? `${metrics.agingServiceRequests} over 24h` : 'No aging requests',
      icon: <ShieldAlert className="h-6 w-6" />,
      tone: metrics.agingServiceRequests > 0 ? 'amber' as const : 'green' as const,
    },
    {
      label: 'Blocked Jobs',
      value: metrics.blockedWorkOrders.toString(),
      detail: metrics.blockedWorkOrders > 0 ? 'Need management action' : 'No blockers',
      icon: <AlertTriangle className="h-6 w-6" />,
      tone: metrics.blockedWorkOrders > 0 ? 'red' as const : 'green' as const,
    },
    {
      label: 'Punchlist',
      value: metrics.openPunchlist.toString(),
      detail: metrics.agingPunchlist > 0 ? `${metrics.agingPunchlist} over 7 days` : 'No aging items',
      icon: <Wrench className="h-6 w-6" />,
      tone: metrics.agingPunchlist > 0 ? 'amber' as const : 'green' as const,
    },
    {
      label: 'Active Projects',
      value: metrics.activeProjects.toString(),
      detail: metrics.atRiskProjects > 0 ? `${metrics.atRiskProjects} past target` : 'All within target',
      icon: <FolderKanban className="h-6 w-6" />,
      tone: metrics.atRiskProjects > 0 ? 'amber' as const : 'green' as const,
    },
    {
      label: 'Active Work Orders',
      value: metrics.activeWorkOrders.toString(),
      detail: `${metrics.todayTotal} scheduled today`,
      icon: <Target className="h-6 w-6" />,
      tone: 'blue' as const,
    },
  ];

  return (
    <div className="fixed inset-0 overflow-hidden bg-slate-950 text-white">
      <div className="flex h-full flex-col">
        <header className="flex h-24 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950 px-8">
          <div className="flex items-center gap-5">
            {orgLogo ? <img src={orgLogo} alt="" className="h-12 max-w-[180px] object-contain" /> : null}
            <div>
              <div className="text-sm font-bold uppercase tracking-[0.22em] text-slate-500">{orgName || 'MyJobView'}</div>
              <h1 className="text-3xl font-black tracking-tight">Operations Scoreboard</h1>
            </div>
          </div>

          <div className="flex items-center gap-8">
            <div className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold ${
              isConnected
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-red-500/30 bg-red-500/10 text-red-300'
            }`}>
              {isConnected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              {isConnected ? 'LIVE' : 'OFFLINE'}
              <span className="font-medium text-slate-500">· updated {timeAgo(lastUpdate.toISOString())}</span>
            </div>
            <div className="text-right">
              <div className="font-mono text-3xl font-black tabular-nums">
                {currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </div>
              <div className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </div>
            </div>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col gap-5 p-6">
          <section className="grid shrink-0 grid-cols-4 gap-4">
            {kpis.map(kpi => <KpiCard key={kpi.label} {...kpi} />)}
          </section>

          <section className="grid min-h-0 flex-1 grid-cols-12 gap-5">
            <div className="col-span-5 min-h-0">
              <TodayPanel metrics={metrics} pace={todayPace} />
            </div>

            <div className="col-span-4 min-h-0">
              <AttentionPanel items={attentionItems} totalAttention={
                metrics.blockedWorkOrders + metrics.agingServiceRequests + metrics.agingPunchlist + metrics.atRiskProjects
              } />
            </div>

            <div className="col-span-3 min-h-0">
              <FieldStatusPanel techs={techs} />
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone: 'green' | 'amber' | 'red' | 'blue';
}) {
  const tones = {
    green: 'border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-300',
    amber: 'border-amber-500/30 bg-amber-500/[0.08] text-amber-300',
    red: 'border-red-500/35 bg-red-500/[0.09] text-red-300',
    blue: 'border-sky-500/25 bg-sky-500/[0.07] text-sky-300',
  };

  return (
    <div className={`rounded-2xl border p-5 ${tones[tone]}`}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-black uppercase tracking-[0.13em] text-slate-400">{label}</span>
        <div className="opacity-90">{icon}</div>
      </div>
      <div className="text-4xl font-black leading-none tracking-tight text-white">{value}</div>
      <div className={`mt-2 text-sm font-bold ${tone === 'red' ? 'text-red-300' : tone === 'amber' ? 'text-amber-300' : 'text-slate-400'}`}>
        {detail}
      </div>
    </div>
  );
}

function TodayPanel({ metrics, pace }: { metrics: DashboardMetrics; pace: number }) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <div className="text-sm font-black uppercase tracking-[0.15em] text-slate-500">Today</div>
          <h2 className="mt-1 text-2xl font-black">Schedule Progress</h2>
        </div>
        <div className="text-right">
          <div className="text-5xl font-black tracking-tight">{pace}%</div>
          <div className="text-sm font-bold text-slate-500">complete</div>
        </div>
      </div>

      <div className="mb-7 h-4 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${Math.min(100, pace)}%` }} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <ScheduleStat label="Complete" value={metrics.todayCompleted} tone="green" />
        <ScheduleStat label="On Site" value={metrics.todayOnSite} tone="blue" />
        <ScheduleStat label="Traveling" value={metrics.todayTraveling} tone="blue" />
        <ScheduleStat label="Scheduled / Other" value={metrics.todayScheduled} tone="neutral" />
      </div>

      <div className="mt-auto border-t border-slate-800 pt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-slate-400">
            <Clock3 className="h-5 w-5" />
            <span className="text-base font-bold">Jobs on today's schedule</span>
          </div>
          <span className="text-3xl font-black">{metrics.todayTotal}</span>
        </div>
      </div>
    </div>
  );
}

function ScheduleStat({ label, value, tone }: { label: string; value: number; tone: 'green' | 'blue' | 'neutral' }) {
  const valueClass = tone === 'green' ? 'text-emerald-300' : tone === 'blue' ? 'text-sky-300' : 'text-white';
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <div className={`text-4xl font-black ${valueClass}`}>{value}</div>
      <div className="mt-1 text-sm font-bold uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function AttentionPanel({ items, totalAttention }: { items: AttentionItem[]; totalAttention: number }) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="text-sm font-black uppercase tracking-[0.15em] text-slate-500">Exceptions</div>
          <h2 className="mt-1 text-2xl font-black">Needs Attention</h2>
        </div>
        <div className={`rounded-xl px-3 py-2 text-2xl font-black ${
          totalAttention > 0 ? 'bg-red-500/15 text-red-300' : 'bg-emerald-500/15 text-emerald-300'
        }`}>
          {totalAttention}
        </div>
      </div>

      {items.length > 0 ? (
        <div className="min-h-0 flex-1 space-y-2 overflow-hidden">
          {items.map(item => (
            <div key={item.id} className={`rounded-xl border p-3 ${
              item.severity === 'critical'
                ? 'border-red-500/25 bg-red-500/[0.07]'
                : 'border-amber-500/25 bg-amber-500/[0.06]'
            }`}>
              <div className="flex items-start gap-3">
                <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${item.severity === 'critical' ? 'text-red-300' : 'text-amber-300'}`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-black text-white">{item.title}</div>
                  <div className="mt-0.5 truncate text-xs font-semibold text-slate-400">{item.detail}</div>
                  <div className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">{item.meta}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="mb-4 rounded-full bg-emerald-500/10 p-5 text-emerald-300">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <div className="text-xl font-black">Nothing needs attention</div>
          <div className="mt-1 text-sm font-semibold text-slate-500">No blocked or aging production items</div>
        </div>
      )}
    </div>
  );
}

function FieldStatusPanel({ techs }: { techs: TechOnDuty[] }) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="mb-4">
        <div className="text-sm font-black uppercase tracking-[0.15em] text-slate-500">Live Team</div>
        <h2 className="mt-1 text-2xl font-black">Field Status</h2>
      </div>

      {techs.length > 0 ? (
        <div className="min-h-0 flex-1 space-y-3 overflow-hidden">
          {techs.map(tech => {
            const statusLabel = tech.status === 'on_job' ? 'ON JOB' : tech.status === 'traveling' ? 'TRAVELING' : 'READY';
            const statusClass = tech.status === 'on_job'
              ? 'bg-sky-500/15 text-sky-300'
              : tech.status === 'traveling'
                ? 'bg-indigo-500/15 text-indigo-300'
                : 'bg-emerald-500/15 text-emerald-300';

            return (
              <div key={tech.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-black text-white">{tech.name}</div>
                    <div className="mt-1 flex items-center gap-2 text-xs font-semibold text-slate-500">
                      <Timer className="h-3.5 w-3.5" />
                      {formatClockDuration(tech.clockInTime)}
                      {tech.currentJob ? <span className="font-black text-sky-400">· WO {tech.currentJob}</span> : null}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-black tracking-wide ${statusClass}`}>
                    {statusLabel}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center text-center text-slate-500">
          <Users className="mb-3 h-9 w-9" />
          <div className="text-base font-bold">No technicians clocked in</div>
        </div>
      )}
    </div>
  );
}
