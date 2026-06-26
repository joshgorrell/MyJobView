import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  TrendingUp, TrendingDown, DollarSign, Wrench, Package, Award,
  Target, Clock, BarChart3, Loader2, AlertCircle, ArrowUp, ArrowDown, Minus
} from 'lucide-react';
import { formatCurrency } from '../../lib/utils';
import type { SalesOrderFull, ChangeOrderSummary } from './SalesOrderDetail';

interface SalesOrderStatsTabProps {
  order: SalesOrderFull;
  changeOrders: ChangeOrderSummary[];
}

interface LineItem {
  id: string;
  quantity: number;
  unit_price: number;
  cost: number;
  line_total: number;
  labor_hours: number;
  labor_rate: number;
  labor_total: number;
  item_type: string;
  description: string;
  labor_phase_id: string | null;
}

interface ChangeOrderLineItem {
  id: string;
  quantity: number;
  new_unit_price: number;
  labor_hours_added: number;
  labor_rate: number;
  labor_total: number;
  total_price: number;
  description: string;
}

interface LaborPhase {
  id: string;
  name: string;
  default_cost: number;
  default_price: number;
}

interface StatsData {
  lineItems: LineItem[];
  coLineItems: ChangeOrderLineItem[];
  laborPhases: LaborPhase[];
  invoices: { total: number; amount_paid: number; status: string }[];
  workOrders: { estimated_hours: number; actual_hours: number; status: string }[];
  profitGoal: number;
  laborRatePerHour: number;
}

function calculateGrade(marginPct: number, goalPct: number): { letter: string; color: string; bgColor: string; description: string } {
  const ratio = marginPct / goalPct;
  if (ratio >= 1.15) return { letter: 'A+', color: 'text-emerald-400', bgColor: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30', description: 'Exceptional' };
  if (ratio >= 1.0) return { letter: 'A', color: 'text-emerald-400', bgColor: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30', description: 'Exceeds Goal' };
  if (ratio >= 0.9) return { letter: 'B+', color: 'text-green-400', bgColor: 'from-green-500/20 to-green-600/10 border-green-500/30', description: 'Near Goal' };
  if (ratio >= 0.75) return { letter: 'B', color: 'text-blue-400', bgColor: 'from-blue-500/20 to-blue-600/10 border-blue-500/30', description: 'Good' };
  if (ratio >= 0.6) return { letter: 'C', color: 'text-amber-400', bgColor: 'from-amber-500/20 to-amber-600/10 border-amber-500/30', description: 'Below Goal' };
  if (ratio >= 0.4) return { letter: 'D', color: 'text-orange-400', bgColor: 'from-orange-500/20 to-orange-600/10 border-orange-500/30', description: 'Poor' };
  return { letter: 'F', color: 'text-red-400', bgColor: 'from-red-500/20 to-red-600/10 border-red-500/30', description: 'Critical' };
}

export function SalesOrderStatsTab({ order, changeOrders }: SalesOrderStatsTabProps) {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [order.id]);

  async function loadStats() {
    try {
      const approvedCOIds = changeOrders
        .filter(co => co.status === 'approved')
        .map(co => co.id);

      const [lineItemsResult, orgResult, invoicesResult, workOrdersResult, laborPhasesResult] = await Promise.all([
        supabase
          .from('proposal_line_items')
          .select('id, quantity, unit_price, cost, line_total, labor_hours, labor_rate, labor_total, item_type, description, labor_phase_id')
          .eq('proposal_id', order.proposal_id),
        supabase
          .from('organizations')
          .select('profit_goal_percentage, labor_rate_per_hour')
          .limit(1)
          .maybeSingle(),
        supabase
          .from('invoices')
          .select('total, amount_paid, status')
          .eq('sales_order_id', order.id),
        order.project_id
          ? supabase
              .from('work_orders')
              .select('estimated_hours, actual_hours, status')
              .eq('project_id', order.project_id)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('labor_phases')
          .select('id, name, default_cost, default_price')
      ]);

      let coLineItems: ChangeOrderLineItem[] = [];
      if (approvedCOIds.length > 0) {
        const { data: coItems } = await supabase
          .from('change_order_line_items')
          .select('id, quantity, new_unit_price, labor_hours_added, labor_rate, labor_total, total_price, description')
          .in('change_order_id', approvedCOIds);
        coLineItems = coItems || [];
      }

      setStats({
        lineItems: lineItemsResult.data || [],
        coLineItems,
        laborPhases: laborPhasesResult.data || [],
        invoices: invoicesResult.data || [],
        workOrders: workOrdersResult.data || [],
        profitGoal: orgResult.data?.profit_goal_percentage || 40,
        laborRatePerHour: orgResult.data?.labor_rate_per_hour || 100,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-8 h-8 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400">Unable to load stats.</p>
      </div>
    );
  }

  const materialItems = stats.lineItems.filter(li => li.item_type !== 'labor');
  const laborOnlyItems = stats.lineItems.filter(li => li.item_type === 'labor');

  const productRevenue = materialItems.reduce((s, li) => s + ((li.unit_price || 0) * (li.quantity || 0)), 0);
  const productCost = materialItems.reduce((s, li) => s + ((li.cost || 0) * (li.quantity || 0)), 0);
  const productProfit = productRevenue - productCost;
  const productMargin = productRevenue > 0 ? (productProfit / productRevenue) * 100 : 0;

  const laborRevenue = materialItems.reduce((s, li) => s + (li.labor_total || 0), 0)
    + laborOnlyItems.reduce((s, li) => s + (li.line_total || 0) + (li.labor_total || 0), 0);

  const laborPhaseMap: Record<string, LaborPhase> = {};
  stats.laborPhases.forEach(lp => { laborPhaseMap[lp.id] = lp; });

  let laborCost = 0;
  stats.lineItems.forEach(li => {
    const hours = li.labor_hours || 0;
    if (hours > 0 && li.labor_phase_id && laborPhaseMap[li.labor_phase_id]) {
      laborCost += hours * (laborPhaseMap[li.labor_phase_id].default_cost || 0);
    } else if (hours > 0) {
      laborCost += hours * (stats.laborRatePerHour * 0.5);
    }
  });

  const laborProfit = laborRevenue - laborCost;
  const laborMargin = laborRevenue > 0 ? (laborProfit / laborRevenue) * 100 : 0;

  const coRevenue = stats.coLineItems.reduce((s, li) => s + (li.total_price || 0), 0);
  const coLaborRevenue = stats.coLineItems.reduce((s, li) => s + (li.labor_total || 0), 0);

  const approvedCOs = changeOrders.filter(co => co.status === 'approved');
  const totalChangeAmount = approvedCOs.reduce((sum, co) => sum + (co.change_amount || 0), 0);

  const totalContractRevenue = (order.contract_total || 0) + totalChangeAmount;
  const totalCost = productCost + laborCost;
  const overallProfit = totalContractRevenue - totalCost;
  const overallMargin = totalContractRevenue > 0 ? (overallProfit / totalContractRevenue) * 100 : 0;

  const grade = calculateGrade(overallMargin, stats.profitGoal);

  const totalInvoiced = stats.invoices.reduce((s, i) => s + (i.total || 0), 0);
  const totalPaid = stats.invoices.reduce((s, i) => s + (i.amount_paid || 0), 0);
  const collectionRate = totalInvoiced > 0 ? (totalPaid / totalInvoiced) * 100 : 0;

  const totalEstHours = stats.workOrders.reduce((s, w) => s + (w.estimated_hours || 0), 0);
  const totalActualHours = stats.workOrders.reduce((s, w) => s + (w.actual_hours || 0), 0);
  const hoursVariance = totalActualHours - totalEstHours;
  const hoursEfficiency = totalEstHours > 0 ? (totalEstHours / totalActualHours) * 100 : 0;

  const totalEstLaborHours = stats.lineItems.reduce((s, li) => s + (li.labor_hours || 0), 0);

  const revenuePerHour = totalActualHours > 0 ? totalContractRevenue / totalActualHours : 0;
  const profitPerHour = totalActualHours > 0 ? overallProfit / totalActualHours : 0;

  return (
    <div className="space-y-6">
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-3 flex items-start gap-3">
        <BarChart3 className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-gray-400 leading-relaxed">
          <span className="text-gray-200 font-medium">Financial Performance</span>
          {' '}&mdash; This tab shows profit margins, material/labor cost analysis, and how this job compares to your profit goals. For operational tracking (task completion, labor hours clocked, and project status), see the <span className="text-gray-200 font-medium">Project tab</span>.
        </div>
      </div>

      <div className={`relative overflow-hidden rounded-xl border bg-gradient-to-br ${grade.bgColor} p-6`}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <Award className={`w-5 h-5 ${grade.color}`} />
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
                Overall Performance Grade
              </h3>
            </div>
            <p className={`text-sm ${grade.color} font-medium mt-1`}>{grade.description}</p>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
              <div>
                <div className="text-xs text-gray-500 mb-0.5">Profit Margin</div>
                <div className={`text-xl font-bold ${overallMargin >= stats.profitGoal ? 'text-emerald-400' : overallMargin >= stats.profitGoal * 0.75 ? 'text-amber-400' : 'text-red-400'}`}>
                  {overallMargin.toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-0.5">Goal</div>
                <div className="text-xl font-bold text-gray-300">{stats.profitGoal}%</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-0.5">Variance</div>
                <div className={`text-xl font-bold flex items-center gap-1 ${overallMargin >= stats.profitGoal ? 'text-emerald-400' : 'text-red-400'}`}>
                  {overallMargin >= stats.profitGoal ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                  {Math.abs(overallMargin - stats.profitGoal).toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
          <div className={`w-24 h-24 rounded-2xl bg-gray-900/50 flex items-center justify-center ${grade.color}`}>
            <span className="text-4xl font-black">{grade.letter}</span>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-500">Margin vs Goal</span>
            <span className="text-xs text-gray-500">{Math.min(overallMargin, stats.profitGoal * 1.5).toFixed(0)}% / {stats.profitGoal}%</span>
          </div>
          <div className="h-2.5 bg-gray-700/60 rounded-full overflow-hidden relative">
            <div
              className="absolute top-0 left-0 h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(100, (overallMargin / (stats.profitGoal * 1.5)) * 100)}%`,
                background: overallMargin >= stats.profitGoal
                  ? 'linear-gradient(90deg, #10b981, #34d399)'
                  : overallMargin >= stats.profitGoal * 0.75
                    ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                    : 'linear-gradient(90deg, #ef4444, #f87171)',
              }}
            />
            <div
              className="absolute top-0 h-full w-0.5 bg-white/40"
              style={{ left: `${(stats.profitGoal / (stats.profitGoal * 1.5)) * 100}%` }}
              title={`Goal: ${stats.profitGoal}%`}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Total Revenue"
          value={`$${totalContractRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          icon={DollarSign}
          color="blue"
        />
        <MetricCard
          label="Estimated Cost"
          value={`$${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          icon={TrendingDown}
          color="gray"
        />
        <MetricCard
          label="Gross Profit"
          value={`$${overallProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          icon={overallProfit >= 0 ? TrendingUp : TrendingDown}
          color={overallProfit >= 0 ? 'green' : 'red'}
        />
        <MetricCard
          label="Profit Margin"
          value={`${overallMargin.toFixed(1)}%`}
          icon={Target}
          color={overallMargin >= stats.profitGoal ? 'green' : overallMargin >= stats.profitGoal * 0.75 ? 'amber' : 'red'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ProfitSection
          title="Product / Material Profit"
          icon={Package}
          revenue={productRevenue}
          cost={productCost}
          profit={productProfit}
          margin={productMargin}
          goal={stats.profitGoal}
          details={[
            { label: 'Product Revenue', value: productRevenue },
            { label: 'Product Cost (COGS)', value: productCost, isNegative: true },
            { label: 'Product Profit', value: productProfit, isBold: true },
          ]}
        />
        <ProfitSection
          title="Labor Profit"
          icon={Wrench}
          revenue={laborRevenue}
          cost={laborCost}
          profit={laborProfit}
          margin={laborMargin}
          goal={stats.profitGoal}
          details={[
            { label: 'Labor Revenue', value: laborRevenue },
            { label: 'Estimated Labor Cost', value: laborCost, isNegative: true },
            { label: 'Labor Profit', value: laborProfit, isBold: true },
          ]}
        />
      </div>

      {approvedCOs.length > 0 && (
        <div className="bg-gray-900/50 rounded-lg border border-gray-700/50 p-5">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Change Order Impact
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div>
              <div className="text-xs text-gray-500 mb-1">Change Orders</div>
              <div className="text-lg font-bold text-white">{approvedCOs.length}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Revenue Added</div>
              <div className={`text-lg font-bold ${totalChangeAmount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {totalChangeAmount >= 0 ? '+' : ''}${Math.abs(totalChangeAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">CO Labor Revenue</div>
              <div className="text-lg font-bold text-blue-400">
                ${coLaborRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-gray-900/50 rounded-lg border border-gray-700/50 p-5">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Labor Efficiency
        </h3>
        {totalEstHours > 0 || totalActualHours > 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">Estimated Hours (Proposal)</div>
                <div className="text-lg font-bold text-white">{totalEstLaborHours.toFixed(1)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">WO Estimated Hours</div>
                <div className="text-lg font-bold text-white">{totalEstHours.toFixed(1)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Actual Hours</div>
                <div className="text-lg font-bold text-white">{totalActualHours.toFixed(1)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Hours Variance</div>
                <div className={`text-lg font-bold flex items-center gap-1 ${
                  hoursVariance <= 0 ? 'text-green-400' : hoursVariance <= totalEstHours * 0.1 ? 'text-amber-400' : 'text-red-400'
                }`}>
                  {hoursVariance === 0 ? <Minus className="w-4 h-4" /> : hoursVariance > 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                  {Math.abs(hoursVariance).toFixed(1)}h
                </div>
              </div>
            </div>

            {totalEstHours > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-gray-500">Hours Usage</span>
                  <span className="text-xs text-gray-500">
                    {totalActualHours.toFixed(1)} / {totalEstHours.toFixed(1)} hrs
                  </span>
                </div>
                <div className="h-2.5 bg-gray-700/60 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      totalActualHours <= totalEstHours ? 'bg-green-500' : totalActualHours <= totalEstHours * 1.1 ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(100, (totalActualHours / totalEstHours) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-gray-700/50">
              <div>
                <div className="text-xs text-gray-500 mb-1">Revenue / Hour</div>
                <div className="text-lg font-bold text-blue-400">
                  {formatCurrency(revenuePerHour)}/hr
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Profit / Hour</div>
                <div className={`text-lg font-bold ${profitPerHour >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(profitPerHour)}/hr
                </div>
              </div>
              {totalEstHours > 0 && (
                <div>
                  <div className="text-xs text-gray-500 mb-1">Efficiency Score</div>
                  <div className={`text-lg font-bold ${
                    hoursEfficiency >= 100 ? 'text-green-400' : hoursEfficiency >= 90 ? 'text-amber-400' : 'text-red-400'
                  }`}>
                    {hoursEfficiency.toFixed(0)}%
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No work order data available yet.</p>
        )}
      </div>

      <div className="bg-gray-900/50 rounded-lg border border-gray-700/50 p-5">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <DollarSign className="w-4 h-4" />
          Collection Status
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-gray-500 mb-1">Total Invoiced</div>
            <div className="text-lg font-bold text-white">
              ${totalInvoiced.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Collected</div>
            <div className="text-lg font-bold text-green-400">
              ${totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Outstanding</div>
            <div className={`text-lg font-bold ${(totalInvoiced - totalPaid) > 0 ? 'text-amber-400' : 'text-green-400'}`}>
              ${(totalInvoiced - totalPaid).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Collection Rate</div>
            <div className={`text-lg font-bold ${collectionRate >= 90 ? 'text-green-400' : collectionRate >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
              {collectionRate.toFixed(0)}%
            </div>
          </div>
        </div>
        {totalContractRevenue > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-500">Billing Progress</span>
              <span className="text-xs text-gray-500">
                {totalContractRevenue > 0 ? ((totalInvoiced / totalContractRevenue) * 100).toFixed(0) : 0}% invoiced
              </span>
            </div>
            <div className="h-2.5 bg-gray-700/60 rounded-full overflow-hidden flex">
              {totalPaid > 0 && (
                <div
                  className="bg-green-500 transition-all duration-500"
                  style={{ width: `${(totalPaid / totalContractRevenue) * 100}%` }}
                />
              )}
              {(totalInvoiced - totalPaid) > 0 && (
                <div
                  className="bg-amber-500 transition-all duration-500"
                  style={{ width: `${((totalInvoiced - totalPaid) / totalContractRevenue) * 100}%` }}
                />
              )}
            </div>
          </div>
        )}
      </div>

      <div className="text-xs text-gray-600 text-right">
        Profit goal: {stats.profitGoal}% -- Adjustable in Admin &gt; Sales Targets
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, color }: {
  label: string;
  value: string;
  icon: typeof DollarSign;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    blue: 'text-blue-400',
    green: 'text-emerald-400',
    red: 'text-red-400',
    amber: 'text-amber-400',
    gray: 'text-gray-400',
  };
  const textColor = colorMap[color] || 'text-white';

  return (
    <div className="bg-gray-900/50 rounded-lg border border-gray-700/50 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${textColor}`} />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className={`text-lg font-bold ${textColor}`}>{value}</div>
    </div>
  );
}

function ProfitSection({ title, icon: Icon, revenue, cost, profit, margin, goal, details }: {
  title: string;
  icon: typeof Package;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  goal: number;
  details: { label: string; value: number; isNegative?: boolean; isBold?: boolean }[];
}) {
  const marginColor = margin >= goal ? 'text-emerald-400' : margin >= goal * 0.75 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="bg-gray-900/50 rounded-lg border border-gray-700/50 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider flex items-center gap-2">
          <Icon className="w-4 h-4" />
          {title}
        </h3>
        <div className={`text-2xl font-bold ${marginColor}`}>{margin.toFixed(1)}%</div>
      </div>

      <div className="space-y-2">
        {details.map((d, i) => (
          <div key={i} className={`flex items-center justify-between py-1.5 ${d.isBold ? 'border-t border-gray-700/50 pt-2' : ''}`}>
            <span className={`text-sm ${d.isBold ? 'text-white font-semibold' : 'text-gray-400'}`}>{d.label}</span>
            <span className={`text-sm font-medium ${
              d.isBold
                ? d.value >= 0 ? 'text-emerald-400' : 'text-red-400'
                : d.isNegative ? 'text-red-400' : 'text-white'
            }`}>
              {d.isNegative ? '-' : ''}${Math.abs(d.value).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500">Margin</span>
          <span className={`text-xs font-medium ${marginColor}`}>
            {margin.toFixed(1)}% / {goal}% goal
          </span>
        </div>
        <div className="h-2 bg-gray-700/60 rounded-full overflow-hidden relative">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(100, (margin / (goal * 1.5)) * 100)}%`,
              background: margin >= goal
                ? 'linear-gradient(90deg, #10b981, #34d399)'
                : margin >= goal * 0.75
                  ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                  : 'linear-gradient(90deg, #ef4444, #f87171)',
            }}
          />
          <div
            className="absolute top-0 h-full w-0.5 bg-white/30"
            style={{ left: `${(goal / (goal * 1.5)) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
