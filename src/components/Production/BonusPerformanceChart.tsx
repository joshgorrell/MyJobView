import { useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import {
  TrendingUp,
  BarChart3,
  PieChartIcon,
  Calendar,
  Download
} from 'lucide-react';

interface BonusCalculation {
  id: string;
  evaluation_date: string;
  total_bonus_amount: number;
  tech_bonus_amount: number;
  pm_bonus_amount: number;
  bonus_tier: string;
  status: string;
  lead_technician_id: string | null;
  project_manager_id: string | null;
}

interface BonusPerformanceChartProps {
  bonuses: BonusCalculation[];
  profileId: string;
}

type ChartView = 'timeline' | 'monthly' | 'tiers' | 'status';

const TIER_COLORS: Record<string, string> = {
  'Tier 3': '#9333ea',
  'Tier 2': '#3b82f6',
  'Tier 1': '#10b981',
  'On Target': '#06b6d4',
  'Over Target': '#f59e0b'
};

const STATUS_COLORS: Record<string, string> = {
  provisional: '#eab308',
  approved: '#10b981',
  paid: '#3b82f6',
  denied: '#ef4444'
};

export function BonusPerformanceChart({ bonuses, profileId }: BonusPerformanceChartProps) {
  const [chartView, setChartView] = useState<ChartView>('timeline');

  const getUserBonusAmount = (bonus: BonusCalculation): number => {
    const isTech = bonus.lead_technician_id === profileId;
    const isPM = bonus.project_manager_id === profileId;

    if (isTech && isPM) {
      return bonus.total_bonus_amount;
    } else if (isTech) {
      return bonus.tech_bonus_amount;
    } else if (isPM) {
      return bonus.pm_bonus_amount;
    }
    return 0;
  };

  const timelineData = useMemo(() => {
    const sortedBonuses = [...bonuses]
      .sort((a, b) => new Date(a.evaluation_date).getTime() - new Date(b.evaluation_date).getTime());

    let cumulative = 0;
    return sortedBonuses.map(bonus => {
      const amount = getUserBonusAmount(bonus);
      const isPaid = bonus.status === 'paid';
      if (isPaid) {
        cumulative += amount;
      }
      return {
        date: new Date(bonus.evaluation_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        amount: isPaid ? amount : 0,
        cumulative: cumulative,
        status: bonus.status
      };
    });
  }, [bonuses, profileId]);

  const monthlyData = useMemo(() => {
    const monthlyMap = new Map<string, { earned: number; pending: number; count: number }>();

    bonuses.forEach(bonus => {
      const date = new Date(bonus.evaluation_date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      const amount = getUserBonusAmount(bonus);

      if (!monthlyMap.has(monthKey)) {
        monthlyMap.set(monthKey, { earned: 0, pending: 0, count: 0 });
      }

      const data = monthlyMap.get(monthKey)!;
      if (bonus.status === 'paid') {
        data.earned += amount;
      } else if (bonus.status === 'provisional' || bonus.status === 'approved') {
        data.pending += amount;
      }
      data.count++;
    });

    return Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, data]) => {
        const [year, month] = key.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1);
        return {
          month: date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }),
          earned: data.earned,
          pending: data.pending,
          count: data.count
        };
      });
  }, [bonuses, profileId]);

  const tierData = useMemo(() => {
    const tierMap = new Map<string, { amount: number; count: number }>();

    bonuses.forEach(bonus => {
      const amount = getUserBonusAmount(bonus);
      let tierKey = 'Other';

      if (bonus.bonus_tier.includes('Tier 3')) tierKey = 'Tier 3';
      else if (bonus.bonus_tier.includes('Tier 2')) tierKey = 'Tier 2';
      else if (bonus.bonus_tier.includes('Tier 1')) tierKey = 'Tier 1';
      else if (bonus.bonus_tier.includes('On Target')) tierKey = 'On Target';
      else if (bonus.bonus_tier.includes('Over Target')) tierKey = 'Over Target';

      if (!tierMap.has(tierKey)) {
        tierMap.set(tierKey, { amount: 0, count: 0 });
      }

      const data = tierMap.get(tierKey)!;
      data.amount += amount;
      data.count++;
    });

    return Array.from(tierMap.entries()).map(([name, data]) => ({
      name,
      amount: data.amount,
      count: data.count,
      color: TIER_COLORS[name] || '#6b7280'
    }));
  }, [bonuses, profileId]);

  const statusData = useMemo(() => {
    const statusMap = new Map<string, { amount: number; count: number }>();

    bonuses.forEach(bonus => {
      const amount = getUserBonusAmount(bonus);
      const status = bonus.status;

      if (!statusMap.has(status)) {
        statusMap.set(status, { amount: 0, count: 0 });
      }

      const data = statusMap.get(status)!;
      data.amount += amount;
      data.count++;
    });

    return Array.from(statusMap.entries()).map(([name, data]) => ({
      name: name === 'provisional' ? 'Pending' : name.charAt(0).toUpperCase() + name.slice(1),
      amount: data.amount,
      count: data.count,
      color: STATUS_COLORS[name] || '#6b7280'
    }));
  }, [bonuses, profileId]);

  const totalEarned = bonuses
    .filter(b => b.status === 'paid')
    .reduce((sum, b) => sum + getUserBonusAmount(b), 0);

  const totalPending = bonuses
    .filter(b => b.status === 'provisional' || b.status === 'approved')
    .reduce((sum, b) => sum + getUserBonusAmount(b), 0);

  const avgBonusPerProject = bonuses.length > 0
    ? bonuses.reduce((sum, b) => sum + getUserBonusAmount(b), 0) / bonuses.length
    : 0;

  const exportChartData = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';

    if (chartView === 'timeline') {
      csvContent += 'Date,Amount,Cumulative,Status\n';
      timelineData.forEach(row => {
        csvContent += `${row.date},${row.amount},${row.cumulative},${row.status}\n`;
      });
    } else if (chartView === 'monthly') {
      csvContent += 'Month,Earned,Pending,Count\n';
      monthlyData.forEach(row => {
        csvContent += `${row.month},${row.earned},${row.pending},${row.count}\n`;
      });
    } else if (chartView === 'tiers') {
      csvContent += 'Tier,Amount,Count\n';
      tierData.forEach(row => {
        csvContent += `${row.name},${row.amount},${row.count}\n`;
      });
    } else if (chartView === 'status') {
      csvContent += 'Status,Amount,Count\n';
      statusData.forEach(row => {
        csvContent += `${row.name},${row.amount},${row.count}\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `bonus_${chartView}_data.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (bonuses.length === 0) {
    return null;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Bonus Performance Analysis</h2>
          <p className="text-sm text-gray-600">Track your bonus earnings and performance trends</p>
        </div>
        <button
          onClick={exportChartData}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">Export Data</span>
          <span className="sm:hidden">Export</span>
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-lg p-3 sm:p-4">
          <div className="text-xs sm:text-sm font-medium text-emerald-900 mb-1">Total Earned (Paid)</div>
          <div className="text-xl sm:text-2xl font-bold text-emerald-900">${totalEarned.toLocaleString()}</div>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-lg p-3 sm:p-4">
          <div className="text-xs sm:text-sm font-medium text-amber-900 mb-1">Pending Approval</div>
          <div className="text-xl sm:text-2xl font-bold text-amber-900">${totalPending.toLocaleString()}</div>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-3 sm:p-4">
          <div className="text-xs sm:text-sm font-medium text-blue-900 mb-1">Avg Per Project</div>
          <div className="text-xl sm:text-2xl font-bold text-blue-900">${Math.round(avgBonusPerProject).toLocaleString()}</div>
        </div>
      </div>

      {/* Chart View Selector */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
        <button
          onClick={() => setChartView('timeline')}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
            chartView === 'timeline'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span className="hidden sm:inline">Timeline</span>
        </button>
        <button
          onClick={() => setChartView('monthly')}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
            chartView === 'monthly'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span className="hidden sm:inline">Monthly</span>
        </button>
        <button
          onClick={() => setChartView('tiers')}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
            chartView === 'tiers'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <PieChartIcon className="w-4 h-4" />
          <span className="hidden sm:inline">By Tier</span>
        </button>
        <button
          onClick={() => setChartView('status')}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
            chartView === 'status'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span className="hidden sm:inline">By Status</span>
        </button>
      </div>

      {/* Chart Display */}
      <div className="w-full h-64 sm:h-80">
        {chartView === 'timeline' && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timelineData}>
              <defs>
                <linearGradient id="colorCumulative" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `$${value}`} />
              <Tooltip
                formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="cumulative"
                stroke="#10b981"
                fillOpacity={1}
                fill="url(#colorCumulative)"
                name="Cumulative Earnings"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {chartView === 'monthly' && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `$${value}`} />
              <Tooltip
                formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
              />
              <Legend />
              <Bar dataKey="earned" fill="#10b981" name="Earned (Paid)" radius={[8, 8, 0, 0]} />
              <Bar dataKey="pending" fill="#f59e0b" name="Pending Approval" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {chartView === 'tiers' && (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={tierData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                outerRadius={window.innerWidth < 640 ? 60 : 100}
                fill="#8884d8"
                dataKey="amount"
              >
                {tierData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => [`$${value.toLocaleString()}`, 'Total']}
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}

        {chartView === 'status' && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statusData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(value) => `$${value}`} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={80} />
              <Tooltip
                formatter={(value: number) => [`$${value.toLocaleString()}`, 'Amount']}
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
              />
              <Bar dataKey="amount" radius={[0, 8, 8, 0]}>
                {statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Chart Description */}
      <div className="text-xs sm:text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
        {chartView === 'timeline' && (
          <p>Shows your cumulative bonus earnings over time. Only includes bonuses with "Paid" status.</p>
        )}
        {chartView === 'monthly' && (
          <p>Compares earned bonuses vs pending bonuses by month. Helps identify peak performance periods.</p>
        )}
        {chartView === 'tiers' && (
          <p>Distribution of bonuses across performance tiers. Higher tiers indicate better efficiency.</p>
        )}
        {chartView === 'status' && (
          <p>Breakdown of bonus amounts by approval status. Track what's been paid vs pending approval.</p>
        )}
      </div>
    </div>
  );
}
