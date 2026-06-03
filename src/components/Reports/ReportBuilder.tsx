import { useState, useEffect } from 'react';
import { Download, Calendar, TrendingUp, DollarSign, Users, FileText, Filter } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type ReportType = 'sales' | 'revenue' | 'proposals' | 'appointments' | 'commissions' | 'contacts';
type ExportFormat = 'csv' | 'pdf';

interface ReportConfig {
  type: ReportType;
  dateRange: {
    start: string;
    end: string;
  };
  groupBy?: 'day' | 'week' | 'month' | 'year' | 'user' | 'office';
  filters?: {
    status?: string[];
    userId?: string;
    officeId?: string;
  };
}

interface ReportData {
  labels: string[];
  values: number[];
  summary: {
    total: number;
    average: number;
    count: number;
  };
}

export function ReportBuilder() {
  const [reportType, setReportType] = useState<ReportType>('sales');
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month' | 'year'>('month');
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>('');

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .order('full_name');

      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  }

  async function generateReport() {
    setLoading(true);
    try {
      let query = supabase.from('').select('*');

      switch (reportType) {
        case 'sales':
          query = supabase
            .from('proposals')
            .select('id, created_at, total, status, created_by')
            .eq('status', 'approved')
            .gte('created_at', startDate)
            .lte('created_at', endDate);
          break;

        case 'revenue':
          query = supabase
            .from('invoices')
            .select('id, invoice_date, total, amount_paid, status')
            .in('status', ['paid', 'partial'])
            .gte('invoice_date', startDate)
            .lte('invoice_date', endDate);
          break;

        case 'proposals':
          query = supabase
            .from('proposals')
            .select('id, created_at, status, total')
            .gte('created_at', startDate)
            .lte('created_at', endDate);
          break;

        case 'appointments':
          query = supabase
            .from('appointments')
            .select('id, appointment_date, status')
            .gte('appointment_date', startDate)
            .lte('appointment_date', endDate);
          break;

        case 'commissions':
          query = supabase
            .from('commissions')
            .select('id, created_at, commission_amount, status, user_id')
            .gte('created_at', startDate)
            .lte('created_at', endDate);
          break;

        case 'contacts':
          query = supabase
            .from('contacts')
            .select('id, created_at')
            .gte('created_at', startDate)
            .lte('created_at', endDate);
          break;
      }

      if (selectedUser) {
        if (reportType === 'sales' || reportType === 'proposals') {
          query = query.eq('created_by', selectedUser);
        } else if (reportType === 'commissions') {
          query = query.eq('user_id', selectedUser);
        }
      }

      const { data, error } = await query;

      if (error) throw error;

      const processed = processReportData(data || [], reportType, groupBy);
      setReportData(processed);
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Failed to generate report');
    } finally {
      setLoading(false);
    }
  }

  function processReportData(data: any[], type: ReportType, group: string): ReportData {
    const grouped: { [key: string]: number } = {};
    let totalValue = 0;

    data.forEach(item => {
      let dateKey: string;
      const date = new Date(
        item.created_at || item.appointment_date || item.invoice_date
      );

      switch (group) {
        case 'day':
          dateKey = date.toISOString().split('T')[0];
          break;
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          dateKey = weekStart.toISOString().split('T')[0];
          break;
        case 'month':
          dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
        case 'year':
          dateKey = String(date.getFullYear());
          break;
        default:
          dateKey = date.toISOString().split('T')[0];
      }

      let value = 0;
      if (type === 'sales' || type === 'proposals') {
        value = parseFloat(item.total || 0);
      } else if (type === 'revenue') {
        value = parseFloat(item.amount_paid || 0);
      } else if (type === 'commissions') {
        value = parseFloat(item.commission_amount || 0);
      } else {
        value = 1;
      }

      grouped[dateKey] = (grouped[dateKey] || 0) + value;
      totalValue += value;
    });

    const labels = Object.keys(grouped).sort();
    const values = labels.map(label => grouped[label]);

    return {
      labels,
      values,
      summary: {
        total: totalValue,
        average: totalValue / (data.length || 1),
        count: data.length
      }
    };
  }

  function exportReport(format: ExportFormat) {
    if (!reportData) return;

    if (format === 'csv') {
      exportToCSV();
    } else {
      exportToPDF();
    }
  }

  function exportToCSV() {
    if (!reportData) return;

    const headers = ['Period', 'Value'];
    const rows = reportData.labels.map((label, index) => [
      label,
      reportData.values[index].toFixed(2)
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
      '',
      `Total,${reportData.summary.total.toFixed(2)}`,
      `Average,${reportData.summary.average.toFixed(2)}`,
      `Count,${reportData.summary.count}`
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportType}-report-${startDate}-to-${endDate}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  function exportToPDF() {
    if (!reportData) return;

    const content = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${reportType.toUpperCase()} Report</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; }
          h1 { color: #1f2937; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
          th { background-color: #f3f4f6; font-weight: 600; }
          .summary { margin-top: 30px; background: #f9fafb; padding: 20px; border-radius: 8px; }
          .summary-item { display: flex; justify-content: space-between; margin: 10px 0; }
        </style>
      </head>
      <body>
        <h1>${reportType.toUpperCase()} Report</h1>
        <p>Date Range: ${startDate} to ${endDate}</p>
        <p>Group By: ${groupBy}</p>

        <table>
          <thead>
            <tr>
              <th>Period</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            ${reportData.labels.map((label, index) => `
              <tr>
                <td>${label}</td>
                <td>$${reportData.values[index].toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="summary">
          <h2>Summary</h2>
          <div class="summary-item">
            <span>Total:</span>
            <strong>$${reportData.summary.total.toFixed(2)}</strong>
          </div>
          <div class="summary-item">
            <span>Average:</span>
            <strong>$${reportData.summary.average.toFixed(2)}</strong>
          </div>
          <div class="summary-item">
            <span>Count:</span>
            <strong>${reportData.summary.count}</strong>
          </div>
        </div>
      </body>
      </html>
    `;

    const blob = new Blob([content], { type: 'text/html' });
    const url = window.URL.createObjectURL(blob);
    const printWindow = window.open(url);
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  }

  const reportTypes = [
    { value: 'sales', label: 'Sales (Approved Proposals)', icon: DollarSign },
    { value: 'revenue', label: 'Revenue (Paid Invoices)', icon: TrendingUp },
    { value: 'proposals', label: 'All Proposals', icon: FileText },
    { value: 'appointments', label: 'Appointments', icon: Calendar },
    { value: 'commissions', label: 'Commissions', icon: Users },
    { value: 'contacts', label: 'New Contacts', icon: Users }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl sm:text-2xl font-bold text-white">Custom Report Builder</h2>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Report Type
            </label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportType)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              {reportTypes.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Group By
            </label>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="year">Year</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Filter className="w-4 h-4 inline mr-2" />
              Filter by User (Optional)
            </label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Users</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>
                  {user.full_name} ({user.role})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={generateReport}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Generating...' : 'Generate Report'}
          </button>

          {reportData && (
            <>
              <button
                onClick={() => exportReport('csv')}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
              <button
                onClick={() => exportReport('pdf')}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Print/PDF
              </button>
            </>
          )}
        </div>
      </div>

      {reportData && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Report Results</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-sm text-blue-600 font-medium mb-1">Total</div>
              <div className="text-2xl font-bold text-blue-900">
                ${reportData.summary.total.toFixed(2)}
              </div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-sm text-green-600 font-medium mb-1">Average</div>
              <div className="text-2xl font-bold text-green-900">
                ${reportData.summary.average.toFixed(2)}
              </div>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="text-sm text-purple-600 font-medium mb-1">Count</div>
              <div className="text-2xl font-bold text-purple-900">
                {reportData.summary.count}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                    Period
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">
                    Value
                  </th>
                </tr>
              </thead>
              <tbody>
                {reportData.labels.map((label, index) => (
                  <tr key={label} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm text-gray-900">{label}</td>
                    <td className="py-3 px-4 text-sm text-gray-900 text-right font-medium">
                      ${reportData.values[index].toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
