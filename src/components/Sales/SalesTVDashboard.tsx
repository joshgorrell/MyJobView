import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { fetchAllRepGoalProgress, fetchTvDashboardData, type RepGoalProgress, type TvDashboardData } from '../../lib/salesKpis';
import { Award, BarChart3, DollarSign, Target, TrendingDown, TrendingUp, Wifi, WifiOff } from 'lucide-react';

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

export default function SalesTVDashboard() {
  const { profile } = useAuth();
  const [data, setData] = useState<TvDashboardData>(EMPTY);
  const [reps, setReps] = useState<RepGoalProgress[]>([]);
  const [orgName, setOrgName] = useState('');
  const [orgLogo, setOrgLogo] = useState('');
  const [connected, setConnected] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    if (!profile?.organization_id) return;
    try {
      const orgId = profile.organization_id;
      const [{ data: org }, tv, repData] = await Promise.all([
        supabase.from('organizations').select('name, logo_url').eq('id', orgId).maybeSingle(),
        fetchTvDashboardData(orgId),
        fetchAllRepGoalProgress(orgId),
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
  }, [profile?.organization_id]);

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
  const daysInYear = ((new Date(now.getFullYear() + 1, 0, 1).getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000);
  const dayOfYear = ((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000) + 1;
  const expectedAnnualPace = (dayOfYear / daysInYear) * 100;

  return (
    <div className="fixed inset-0 overflow-hidden bg-slate-950 text-white">
      <div className="mx-auto flex h-full w-full max-w-[3840px] flex-col">
        <header className="flex h-[8.5vh] min-h-[86px] shrink-0 items-center justify-between border-b border-slate-800 px-[1.4vw]">
          <div className="flex items-center gap-[1vw]">
            {orgLogo ? <img src={orgLogo} alt="" className="h-[5vh] max-h-16 max-w-[12vw] object-contain" /> : <div className="rounded-xl bg-sky-500/15 p-3 text-sky-400"><TrendingUp /></div>}
            <div>
              <div className="text-[clamp(12px,.7vw,26px)] font-bold uppercase tracking-[.2em] text-slate-500">{orgName || 'MyJobView'}</div>
              <h1 className="text-[clamp(28px,1.8vw,66px)] font-black leading-none">Sales Scoreboard</h1>
            </div>
          </div>
          <div className="flex items-center gap-[2vw]">
            <div className={`flex items-center gap-2 rounded-full border px-[.7vw] py-[.35vw] text-[clamp(12px,.65vw,24px)] font-bold ${connected ? 'border-emerald-500/30 text-emerald-300' : 'border-red-500/30 text-red-300'}`}>
              {connected ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}{connected ? 'LIVE' : 'OFFLINE'}
              <span className="text-slate-500">· {Math.max(0, Math.floor((Date.now() - lastUpdate.getTime()) / 1000))}s</span>
            </div>
            <div className="text-right">
              <div className="font-mono text-[clamp(28px,1.8vw,68px)] font-black leading-none">{now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
              <div className="text-[clamp(12px,.7vw,26px)] font-semibold uppercase text-slate-400">{now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</div>
            </div>
          </div>
        </header>

        <section className="grid h-[16vh] min-h-[150px] shrink-0 grid-cols-4 gap-[.7vw] p-[.7vw] pb-0">
          <TopKpi label="Sales This Month" value={compact(totals.month)} sub={totals.monthlyGoal > 0 ? `${pct(totals.monthProgress)} of ${compact(totals.monthlyGoal)} goal` : `${data.salesOrderCount} sales orders`} tone={totals.monthProgress >= expectedMonthPace ? 'green' : 'amber'} icon={<DollarSign />} />
          <TopKpi label="YTD Sales" value={compact(totals.ytd)} sub={data.yoyPct !== null ? `${data.yoyPct > 0 ? '+' : ''}${Math.round(data.yoyPct)}% vs last year` : totals.annualGoal > 0 ? `${pct(totals.annualProgress)} of annual goal` : 'Year to date'} tone={data.yoyDir === 'down' ? 'red' : 'green'} icon={data.yoyDir === 'down' ? <TrendingDown /> : <TrendingUp />} />
          <TopKpi label="Pipeline" value={compact(data.pipelineValue)} sub={`${data.proposalsOut} proposals out`} tone="blue" icon={<Target />} />
          <TopKpi label="Avg Margin" value={pct(data.averageMarginPct)} sub={`${compact(data.averageSale)} average sale`} tone={data.averageMarginPct >= 40 ? 'green' : data.averageMarginPct >= 25 ? 'amber' : 'red'} icon={<BarChart3 />} />
        </section>

        <main className="grid min-h-0 flex-1 grid-cols-12 grid-rows-2 gap-[.7vw] p-[.7vw]">
          <section className="col-span-7 row-span-2 flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
            <PanelHeader title="Sales Team Leaderboard" icon={<Award />} right={`${reps.length} REPS`} />
            <div className="grid h-[3.3vh] min-h-[34px] shrink-0 grid-cols-[.35fr_1.7fr_1fr_1fr_.7fr_1fr_.7fr] items-center border-b border-slate-800 px-[.8vw] text-[clamp(10px,.55vw,20px)] font-black uppercase tracking-wider text-slate-500">
              <span>#</span><span>Rep</span><span>MTD Sales</span><span>Monthly Goal</span><span>MTD %</span><span>YTD Sales</span><span>YTD %</span>
            </div>
            <div className="min-h-0 flex-1">
              {reps.length ? reps.slice(0, 10).map((rep, index) => {
                const monthPct = rep.monthlyQuota > 0 ? (rep.thisMonthSales / rep.monthlyQuota) * 100 : 0;
                const onMonthPace = monthPct >= expectedMonthPace;
                const onAnnualPace = rep.quotaProgress >= expectedAnnualPace;
                return <div key={rep.repId} className="grid h-[8.7%] min-h-[56px] grid-cols-[.35fr_1.7fr_1fr_1fr_.7fr_1fr_.7fr] items-center border-b border-slate-800/70 px-[.8vw] text-[clamp(13px,.78vw,30px)]">
                  <span className={`font-black ${index === 0 ? 'text-amber-300' : index === 1 ? 'text-slate-300' : index === 2 ? 'text-orange-300' : 'text-slate-600'}`}>{index + 1}</span>
                  <div className="min-w-0"><div className="truncate font-black">{rep.repName}</div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className={`h-full rounded-full ${onMonthPace ? 'bg-emerald-400' : 'bg-amber-400'}`} style={{ width: `${Math.min(100, monthPct)}%` }} /></div></div>
                  <b className="text-sky-300">{compact(rep.thisMonthSales)}</b><span className="text-slate-400">{compact(rep.monthlyQuota)}</span><b className={onMonthPace ? 'text-emerald-400' : 'text-amber-400'}>{pct(monthPct)}</b><b>{compact(rep.ytdSales)}</b><b className={onAnnualPace ? 'text-emerald-400' : 'text-amber-400'}>{pct(rep.quotaProgress)}</b>
                </div>;
              }) : <Empty text="No sales reps with goals configured" />}
            </div>
          </section>

          <section className="col-span-5 flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
            <PanelHeader title="Company Pace" icon={<Target />} />
            <div className="grid flex-1 grid-cols-2 gap-[.8vw] p-[.8vw]">
              <PaceCard label="Monthly Goal" actual={totals.month} goal={totals.monthlyGoal} progress={totals.monthProgress} expected={expectedMonthPace} />
              <PaceCard label="Annual Goal" actual={totals.ytd} goal={totals.annualGoal} progress={totals.annualProgress} expected={expectedAnnualPace} />
              <Mini label="Win Rate" value={pct(data.winRate)} sub="proposal wins" />
              <Mini label="Average Sale" value={compact(data.averageSale)} sub={`${data.salesOrderCount} orders this month`} />
            </div>
          </section>

          <section className="col-span-5 flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
            <PanelHeader title="Pipeline & Trend" icon={<BarChart3 />} right={`${data.proposalsOut} OUT`} />
            <div className="grid min-h-0 flex-1 grid-cols-[.8fr_1.2fr] gap-[.8vw] p-[.8vw]">
              <div className="grid grid-rows-3 gap-[.6vw]">
                <Mini label="Pipeline Value" value={compact(data.pipelineValue)} sub="active opportunities" />
                <Mini label="Proposals Created" value={String(data.proposalsCreated)} sub="this month" />
                <Mini label="Avg Deal Size" value={compact(data.averageDealSize)} sub="active pipeline" />
              </div>
              <div className="flex min-h-0 flex-col justify-end gap-[.3vw]">
                {data.monthlyTrend.slice(-8).map(m => {
                  const max = Math.max(...data.monthlyTrend.slice(-8).map(x => x.total), 1);
                  return <div key={m.label} className="grid grid-cols-[.65fr_2fr_.8fr] items-center gap-[.4vw] text-[clamp(11px,.62vw,23px)]"><span className={m.isCurrentMonth ? 'font-black text-sky-300' : 'font-bold text-slate-500'}>{m.label}</span><div className="h-[1.2vh] min-h-[10px] overflow-hidden rounded bg-slate-800"><div className={`h-full rounded ${m.isCurrentMonth ? 'bg-sky-400' : 'bg-slate-500'}`} style={{ width: `${Math.max(2, (m.total / max) * 100)}%` }} /></div><b className="text-right">{compact(m.total)}</b></div>;
                })}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function TopKpi({ label, value, sub, tone, icon }: { label: string; value: string; sub: string; tone: 'green' | 'amber' | 'red' | 'blue'; icon: React.ReactNode }) {
  const map = { green: 'border-emerald-500/30 text-emerald-400', amber: 'border-amber-500/30 text-amber-400', red: 'border-red-500/30 text-red-400', blue: 'border-sky-500/30 text-sky-400' };
  return <div className={`flex items-center gap-[.9vw] rounded-xl border bg-slate-900/60 px-[1vw] ${map[tone]}`}><div className="[&>svg]:h-[2.2vw] [&>svg]:w-[2.2vw]">{icon}</div><div><div className="text-[clamp(12px,.7vw,26px)] font-black uppercase tracking-wide text-slate-400">{label}</div><div className="text-[clamp(30px,2vw,76px)] font-black leading-none">{value}</div><div className="mt-1 text-[clamp(11px,.62vw,23px)] font-bold text-slate-500">{sub}</div></div></div>;
}
function PanelHeader({ title, icon, right }: { title: string; icon: React.ReactNode; right?: string }) { return <div className="flex h-[5vh] min-h-[50px] shrink-0 items-center gap-[.55vw] border-b border-slate-800 px-[.8vw]"><span className="text-sky-400 [&>svg]:h-[1.15vw] [&>svg]:w-[1.15vw]">{icon}</span><h2 className="text-[clamp(16px,.95vw,36px)] font-black uppercase tracking-wide">{title}</h2>{right && <span className="ml-auto text-[clamp(11px,.6vw,22px)] font-black text-slate-500">{right}</span>}</div>; }
function PaceCard({ label, actual, goal, progress, expected }: { label: string; actual: number; goal: number; progress: number; expected: number }) { const ahead = progress >= expected; return <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-[.7vw]"><div className="text-[clamp(11px,.62vw,23px)] font-black uppercase text-slate-500">{label}</div><div className="mt-[.2vw] text-[clamp(26px,1.55vw,58px)] font-black">{compact(actual)}</div><div className="text-[clamp(11px,.6vw,22px)] font-bold text-slate-500">of {compact(goal)}</div><div className="mt-[.45vw] h-[1vh] min-h-[9px] overflow-hidden rounded-full bg-slate-800"><div className={`h-full rounded-full ${ahead ? 'bg-emerald-400' : 'bg-amber-400'}`} style={{ width: `${Math.min(100, progress)}%` }} /></div><div className={`mt-[.35vw] text-[clamp(11px,.62vw,23px)] font-black ${ahead ? 'text-emerald-400' : 'text-amber-400'}`}>{pct(progress)} · {ahead ? 'AHEAD OF PACE' : `PACE ${pct(expected)}`}</div></div>; }
function Mini({ label, value, sub }: { label: string; value: string; sub: string }) { return <div className="flex flex-col justify-center rounded-xl border border-slate-800 bg-slate-950/60 px-[.7vw]"><div className="text-[clamp(10px,.58vw,21px)] font-black uppercase text-slate-500">{label}</div><div className="text-[clamp(22px,1.35vw,50px)] font-black text-sky-300">{value}</div><div className="text-[clamp(10px,.55vw,20px)] font-semibold text-slate-600">{sub}</div></div>; }
function Empty({ text }: { text: string }) { return <div className="flex h-full items-center justify-center text-[clamp(13px,.75vw,28px)] font-semibold text-slate-600">{text}</div>; }
