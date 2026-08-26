import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { fetchAllRepGoalProgress, fetchTvDashboardData, type RepGoalProgress, type TvDashboardData } from '../../lib/salesKpis';
import { Award, BarChart3, DollarSign, FileCheck2, ReceiptText, Target, TrendingDown, TrendingUp, Wifi, WifiOff, Wrench } from 'lucide-react';

interface RecentSale {
  id: string;
  orderNumber: string;
  customer: string;
  rep: string;
  total: number;
  bookedAt: string;
}

interface BilledService {
  id: string;
  workOrder: string;
  title: string;
  customer: string;
  invoiceNumber: string;
  total: number;
  invoicedAt: string;
}

interface UnbilledService {
  id: string;
  workOrder: string;
  title: string;
  tech: string;
  completedAt: string;
}

const EMPTY: TvDashboardData = {
  averageSale: 0,
  averageMarginPct: 0,
  salesOrderCount: 0,
  monthlyRevenue: 0,
  pipelineValue: 0,
  proposalsOut: 0,
  proposalsCreated: 0,
  winRate: 0,
  conversionRate: 0,
  averageDealSize: 0,
  ytdTotal: 0,
  prevYearSamePeriod: 0,
  prevYearFull: 0,
  yoyPct: null,
  yoyDir: 'flat',
  monthlyTrend: [],
  yearlyBreakdown: [],
};

const money = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v || 0);
const compact = (v: number) => v >= 1000000 ? `$${(v / 1000000).toFixed(2)}M` : v >= 1000 ? `$${Math.round(v / 1000)}K` : money(v);
const pct = (v: number) => `${Math.round(v || 0)}%`;
const age = (s: string) => {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(s).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
};

export default function SalesTVDashboard() {
  const { profile } = useAuth();
  const [data, setData] = useState<TvDashboardData>(EMPTY);
  const [reps, setReps] = useState<RepGoalProgress[]>([]);
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [billedService, setBilledService] = useState<BilledService[]>([]);
  const [unbilledService, setUnbilledService] = useState<UnbilledService[]>([]);
  const [orgName, setOrgName] = useState('');
  const [orgLogo, setOrgLogo] = useState('');
  const [connected, setConnected] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const loadRevenueLists = useCallback(async (orgId: string) => {
    const [salesResult, billedResult, completedBillableResult, billingLinksResult] = await Promise.all([
      supabase
        .from('sales_orders')
        .select('id, order_number, contract_total, created_by_name, booked_at, created_at, contacts(full_name)')
        .eq('organization_id', orgId)
        .not('status', 'in', '("cancelled","voided")')
        .order('booked_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(12),
      supabase
        .from('service_billing_queue')
        .select('id, work_order_id, invoice_id, invoiced_at, completed_at, work_orders(work_order_number,title,assigned_to_name), contacts(full_name), invoices(invoice_number,total,invoice_date,status)')
        .eq('organization_id', orgId)
        .not('invoice_id', 'is', null)
        .order('invoiced_at', { ascending: false, nullsFirst: false })
        .limit(12),
      supabase
        .from('work_orders')
        .select('id, work_order_number, title, assigned_to_name, actual_completion_date, updated_at')
        .eq('organization_id', orgId)
        .eq('is_billable', true)
        .eq('status', 'completed')
        .order('actual_completion_date', { ascending: false, nullsFirst: false })
        .limit(60),
      supabase
        .from('service_billing_queue')
        .select('work_order_id, invoice_id, invoiced_at')
        .eq('organization_id', orgId),
    ]);

    if (salesResult.error) throw salesResult.error;
    if (billedResult.error) throw billedResult.error;
    if (completedBillableResult.error) throw completedBillableResult.error;
    if (billingLinksResult.error) throw billingLinksResult.error;

    setRecentSales((salesResult.data || []).map((row: any) => ({
      id: row.id,
      orderNumber: row.order_number || 'SO',
      customer: row.contacts?.full_name || 'Customer',
      rep: row.created_by_name || 'Sales',
      total: Number(row.contract_total || 0),
      bookedAt: row.booked_at || row.created_at,
    })));

    setBilledService((billedResult.data || []).map((row: any) => ({
      id: row.id,
      workOrder: row.work_orders?.work_order_number || 'WO',
      title: row.work_orders?.title || 'Service Call',
      customer: row.contacts?.full_name || 'Customer',
      invoiceNumber: row.invoices?.invoice_number || 'Invoice',
      total: Number(row.invoices?.total || 0),
      invoicedAt: row.invoiced_at || row.invoices?.invoice_date || row.completed_at || new Date().toISOString(),
    })));

    const billedIds = new Set(
      (billingLinksResult.data || [])
        .filter((row: any) => row.work_order_id && (row.invoice_id || row.invoiced_at))
        .map((row: any) => row.work_order_id)
    );

    setUnbilledService((completedBillableResult.data || [])
      .filter((row: any) => !billedIds.has(row.id))
      .slice(0, 12)
      .map((row: any) => ({
        id: row.id,
        workOrder: row.work_order_number || 'WO',
        title: row.title || 'Service Call',
        tech: row.assigned_to_name || 'Unassigned',
        completedAt: row.actual_completion_date || row.updated_at,
      })));
  }, []);

  const load = useCallback(async () => {
    if (!profile?.organization_id) return;
    try {
      const orgId = profile.organization_id;
      const [{ data: org }, tv, repData] = await Promise.all([
        supabase.from('organizations').select('name, logo_url').eq('id', orgId).maybeSingle(),
        fetchTvDashboardData(orgId),
        fetchAllRepGoalProgress(orgId),
        loadRevenueLists(orgId),
      ]);
      setOrgName(org?.name || '');
      setOrgLogo(org?.logo_url || '');
      setData(tv);
      setReps(repData);
      setConnected(true);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Sales TV refresh failed:', error);
      setConnected(false);
    }
  }, [loadRevenueLists, profile?.organization_id]);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 30000);
    return () => window.clearInterval(interval);
  }, [load]);

  const totals = useMemo(() => {
    const annualGoal = reps.reduce((s, r) => s + (r.annualQuota || 0), 0);
    const monthlyGoal = reps.reduce((s, r) => s + (r.monthlyQuota || 0), 0);
    const repYtd = reps.reduce((s, r) => s + (r.ytdSales || 0), 0);
    const repMonth = reps.reduce((s, r) => s + (r.thisMonthSales || 0), 0);
    const ytd = data.ytdTotal || repYtd;
    const month = data.monthlyRevenue || repMonth;
    return {
      annualGoal,
      monthlyGoal,
      ytd,
      month,
      annualProgress: annualGoal > 0 ? (ytd / annualGoal) * 100 : 0,
      monthProgress: monthlyGoal > 0 ? (month / monthlyGoal) * 100 : 0,
    };
  }, [data.monthlyRevenue, data.ytdTotal, reps]);

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const expectedMonthPace = (now.getDate() / daysInMonth) * 100;
  const daysInYear = (new Date(now.getFullYear() + 1, 0, 1).getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000;
  const dayOfYear = ((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000) + 1;
  const expectedAnnualPace = (dayOfYear / daysInYear) * 100;

  return (
    <div className="fixed inset-0 overflow-hidden bg-slate-950 text-white">
      <div className="mx-auto flex h-full w-full max-w-[3840px] flex-col">
        <header className="flex h-[8vh] min-h-[82px] shrink-0 items-center justify-between border-b border-slate-800 px-[1.3vw]">
          <div className="flex items-center gap-[1vw]">
            {orgLogo ? <img src={orgLogo} alt="" className="h-[4.8vh] max-h-16 max-w-[12vw] object-contain" /> : <div className="rounded-xl bg-sky-500/15 p-3 text-sky-400"><TrendingUp /></div>}
            <div>
              <div className="text-[clamp(12px,.65vw,25px)] font-bold uppercase tracking-[.2em] text-slate-500">{orgName || 'MyJobView'}</div>
              <h1 className="text-[clamp(28px,1.65vw,62px)] font-black leading-none">Sales Scoreboard</h1>
            </div>
          </div>
          <div className="flex items-center gap-[2vw]">
            <div className={`flex items-center gap-2 rounded-full border px-[.65vw] py-[.3vw] text-[clamp(12px,.6vw,23px)] font-bold ${connected ? 'border-emerald-500/30 text-emerald-300' : 'border-red-500/30 text-red-300'}`}>
              {connected ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}{connected ? 'LIVE' : 'OFFLINE'}
              <span className="text-slate-500">· {Math.max(0, Math.floor((Date.now() - lastUpdate.getTime()) / 1000))}s</span>
            </div>
            <div className="text-right">
              <div className="font-mono text-[clamp(28px,1.65vw,64px)] font-black leading-none">{now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
              <div className="text-[clamp(12px,.65vw,25px)] font-semibold uppercase text-slate-400">{now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</div>
            </div>
          </div>
        </header>

        <section className="grid h-[13.5vh] min-h-[132px] shrink-0 grid-cols-4 gap-[.65vw] p-[.65vw] pb-0">
          <TopKpi label="Sales This Month" value={compact(totals.month)} sub={totals.monthlyGoal > 0 ? `${pct(totals.monthProgress)} of ${compact(totals.monthlyGoal)} goal` : `${data.salesOrderCount} sales orders`} tone={totals.monthProgress >= expectedMonthPace ? 'green' : 'amber'} icon={<DollarSign />} />
          <TopKpi label="YTD Sales" value={compact(totals.ytd)} sub={data.yoyPct !== null ? `${data.yoyPct > 0 ? '+' : ''}${Math.round(data.yoyPct)}% vs last year` : totals.annualGoal > 0 ? `${pct(totals.annualProgress)} of annual goal` : 'Year to date'} tone={data.yoyDir === 'down' ? 'red' : 'green'} icon={data.yoyDir === 'down' ? <TrendingDown /> : <TrendingUp />} />
          <TopKpi label="Pipeline" value={compact(data.pipelineValue)} sub={`${data.proposalsOut} proposals out`} tone="blue" icon={<Target />} />
          <TopKpi label="Avg Margin" value={pct(data.averageMarginPct)} sub={`${compact(data.averageSale)} average sale`} tone={data.averageMarginPct >= 40 ? 'green' : data.averageMarginPct >= 25 ? 'amber' : 'red'} icon={<BarChart3 />} />
        </section>

        <main className="grid min-h-0 flex-1 grid-cols-12 grid-rows-[46%_54%] gap-[.65vw] p-[.65vw]">
          <section className="col-span-8 flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
            <PanelHeader title="Sales Team Leaderboard" icon={<Award />} right={`${reps.length} REPS`} />
            <div className="grid h-[3vh] min-h-[32px] shrink-0 grid-cols-[.35fr_1.7fr_1fr_1fr_.7fr_1fr_.7fr] items-center border-b border-slate-800 px-[.75vw] text-[clamp(10px,.52vw,19px)] font-black uppercase tracking-wider text-slate-500">
              <span>#</span><span>Rep</span><span>MTD Sales</span><span>Monthly Goal</span><span>MTD %</span><span>YTD Sales</span><span>YTD %</span>
            </div>
            <div className="min-h-0 flex-1">
              {reps.length ? reps.slice(0, 7).map((rep, index) => {
                const monthPct = rep.monthlyQuota > 0 ? (rep.thisMonthSales / rep.monthlyQuota) * 100 : 0;
                const onMonthPace = monthPct >= expectedMonthPace;
                const onAnnualPace = rep.quotaProgress >= expectedAnnualPace;
                return <div key={rep.repId} className="grid h-[13.8%] min-h-[48px] grid-cols-[.35fr_1.7fr_1fr_1fr_.7fr_1fr_.7fr] items-center border-b border-slate-800/70 px-[.75vw] text-[clamp(12px,.72vw,27px)]">
                  <span className={`font-black ${index === 0 ? 'text-amber-300' : index === 1 ? 'text-slate-300' : index === 2 ? 'text-orange-300' : 'text-slate-600'}`}>{index + 1}</span>
                  <div className="min-w-0"><div className="truncate font-black">{rep.repName}</div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className={`h-full rounded-full ${onMonthPace ? 'bg-emerald-400' : 'bg-amber-400'}`} style={{ width: `${Math.min(100, monthPct)}%` }} /></div></div>
                  <b className="text-sky-300">{compact(rep.thisMonthSales)}</b><span className="text-slate-400">{compact(rep.monthlyQuota)}</span><b className={onMonthPace ? 'text-emerald-400' : 'text-amber-400'}>{pct(monthPct)}</b><b>{compact(rep.ytdSales)}</b><b className={onAnnualPace ? 'text-emerald-400' : 'text-amber-400'}>{pct(rep.quotaProgress)}</b>
                </div>;
              }) : <Empty text="No sales reps with goals configured" />}
            </div>
          </section>

          <section className="col-span-4 flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
            <PanelHeader title="Company Pace" icon={<Target />} />
            <div className="grid flex-1 grid-cols-2 gap-[.65vw] p-[.65vw]">
              <PaceCard label="Monthly Goal" actual={totals.month} goal={totals.monthlyGoal} progress={totals.monthProgress} expected={expectedMonthPace} />
              <PaceCard label="Annual Goal" actual={totals.ytd} goal={totals.annualGoal} progress={totals.annualProgress} expected={expectedAnnualPace} />
              <Mini label="Win Rate" value={pct(data.winRate)} sub="proposal wins" />
              <Mini label="Proposals Out" value={String(data.proposalsOut)} sub={compact(data.pipelineValue)} />
            </div>
          </section>

          <section className="col-span-4 flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
            <PanelHeader title="Recent Sales" icon={<FileCheck2 />} right="NEWEST FIRST" />
            <div className="grid h-[3vh] min-h-[30px] shrink-0 grid-cols-[.75fr_1.6fr_1fr_.8fr] items-center border-b border-slate-800 px-[.7vw] text-[clamp(9px,.48vw,18px)] font-black uppercase text-slate-500"><span>SO</span><span>Customer</span><span>Rep</span><span className="text-right">Sale</span></div>
            <div className="min-h-0 flex-1">{recentSales.length ? recentSales.slice(0, 7).map(s => <div key={s.id} className="grid h-[13.8%] min-h-[42px] grid-cols-[.75fr_1.6fr_1fr_.8fr] items-center border-b border-slate-800/70 px-[.7vw] text-[clamp(11px,.64vw,24px)]"><b className="font-mono text-sky-300">{s.orderNumber}</b><div className="min-w-0"><div className="truncate font-bold">{s.customer}</div><div className="text-[.8em] text-slate-600">{age(s.bookedAt)} ago</div></div><span className="truncate text-slate-400">{s.rep}</span><b className="text-right text-emerald-400">{compact(s.total)}</b></div>) : <Empty text="No recent sales orders" />}</div>
          </section>

          <section className="col-span-4 flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
            <PanelHeader title="Recent Billed Service" icon={<ReceiptText />} right="INVOICED" />
            <div className="grid h-[3vh] min-h-[30px] shrink-0 grid-cols-[.7fr_1.55fr_.85fr_.75fr] items-center border-b border-slate-800 px-[.7vw] text-[clamp(9px,.48vw,18px)] font-black uppercase text-slate-500"><span>WO</span><span>Customer / Call</span><span>Invoice</span><span className="text-right">Billed</span></div>
            <div className="min-h-0 flex-1">{billedService.length ? billedService.slice(0, 7).map(s => <div key={s.id} className="grid h-[13.8%] min-h-[42px] grid-cols-[.7fr_1.55fr_.85fr_.75fr] items-center border-b border-slate-800/70 px-[.7vw] text-[clamp(11px,.64vw,24px)]"><b className="font-mono text-sky-300">{s.workOrder}</b><div className="min-w-0"><div className="truncate font-bold">{s.customer}</div><div className="truncate text-[.8em] text-slate-600">{s.title} · {age(s.invoicedAt)} ago</div></div><span className="truncate text-slate-400">{s.invoiceNumber}</span><b className="text-right text-emerald-400">{compact(s.total)}</b></div>) : <Empty text="No billed service calls yet" />}</div>
          </section>

          <section className="col-span-4 flex min-h-0 flex-col overflow-hidden rounded-xl border border-amber-500/25 bg-slate-900/50">
            <PanelHeader title="Unbilled Service" icon={<Wrench />} right={`${unbilledService.length} WAITING`} warning />
            <div className="grid h-[3vh] min-h-[30px] shrink-0 grid-cols-[.75fr_1.65fr_1fr_.65fr] items-center border-b border-slate-800 px-[.7vw] text-[clamp(9px,.48vw,18px)] font-black uppercase text-slate-500"><span>WO</span><span>Service Call</span><span>Tech</span><span className="text-right">Age</span></div>
            <div className="min-h-0 flex-1">{unbilledService.length ? unbilledService.slice(0, 7).map(s => <div key={s.id} className="grid h-[13.8%] min-h-[42px] grid-cols-[.75fr_1.65fr_1fr_.65fr] items-center border-b border-slate-800/70 bg-amber-500/[.025] px-[.7vw] text-[clamp(11px,.64vw,24px)]"><b className="font-mono text-amber-300">{s.workOrder}</b><span className="truncate font-bold">{s.title}</span><span className="truncate text-slate-400">{s.tech}</span><b className="text-right text-amber-400">{age(s.completedAt)}</b></div>) : <Empty text="No completed billable work orders waiting to be billed" />}</div>
          </section>
        </main>
      </div>
    </div>
  );
}

function TopKpi({ label, value, sub, tone, icon }: { label: string; value: string; sub: string; tone: 'green' | 'amber' | 'red' | 'blue'; icon: React.ReactNode }) {
  const map = { green: 'border-emerald-500/30 text-emerald-400', amber: 'border-amber-500/30 text-amber-400', red: 'border-red-500/30 text-red-400', blue: 'border-sky-500/30 text-sky-400' };
  return <div className={`flex items-center gap-[.85vw] rounded-xl border bg-slate-900/60 px-[.9vw] ${map[tone]}`}><div className="[&>svg]:h-[2vw] [&>svg]:w-[2vw]">{icon}</div><div><div className="text-[clamp(11px,.65vw,24px)] font-black uppercase tracking-wide text-slate-400">{label}</div><div className="text-[clamp(28px,1.8vw,68px)] font-black leading-none">{value}</div><div className="mt-1 text-[clamp(10px,.57vw,21px)] font-bold text-slate-500">{sub}</div></div></div>;
}

function PanelHeader({ title, icon, right, warning = false }: { title: string; icon: React.ReactNode; right?: string; warning?: boolean }) {
  return <div className="flex h-[4.5vh] min-h-[46px] shrink-0 items-center gap-[.5vw] border-b border-slate-800 px-[.75vw]"><span className={`${warning ? 'text-amber-400' : 'text-sky-400'} [&>svg]:h-[1.05vw] [&>svg]:w-[1.05vw]`}>{icon}</span><h2 className="text-[clamp(14px,.82vw,31px)] font-black uppercase tracking-wide">{title}</h2>{right ? <span className={`ml-auto text-[clamp(9px,.5vw,19px)] font-black tracking-wider ${warning ? 'text-amber-400' : 'text-slate-500'}`}>{right}</span> : null}</div>;
}

function PaceCard({ label, actual, goal, progress, expected }: { label: string; actual: number; goal: number; progress: number; expected: number }) {
  const onPace = progress >= expected;
  return <div className="flex flex-col justify-center rounded-lg border border-slate-800 bg-slate-950/60 p-[.65vw]"><div className="text-[clamp(10px,.52vw,19px)] font-black uppercase text-slate-500">{label}</div><div className="mt-1 text-[clamp(20px,1.25vw,47px)] font-black">{compact(actual)}</div><div className="text-[clamp(10px,.55vw,20px)] font-bold text-slate-500">of {compact(goal)} · <span className={onPace ? 'text-emerald-400' : 'text-amber-400'}>{pct(progress)}</span></div><div className="mt-[.4vw] h-[.65vh] min-h-[7px] overflow-hidden rounded-full bg-slate-800"><div className={`h-full rounded-full ${onPace ? 'bg-emerald-400' : 'bg-amber-400'}`} style={{ width: `${Math.min(100, progress)}%` }} /></div><div className="mt-1 text-[clamp(9px,.46vw,17px)] font-bold text-slate-600">Expected pace {pct(expected)}</div></div>;
}

function Mini({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="flex flex-col justify-center rounded-lg border border-slate-800 bg-slate-950/60 p-[.65vw]"><div className="text-[clamp(9px,.5vw,18px)] font-black uppercase text-slate-500">{label}</div><div className="text-[clamp(20px,1.2vw,45px)] font-black text-sky-300">{value}</div><div className="text-[clamp(9px,.48vw,18px)] font-semibold text-slate-600">{sub}</div></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center px-6 text-center text-[clamp(11px,.62vw,23px)] font-semibold text-slate-600">{text}</div>;
}
