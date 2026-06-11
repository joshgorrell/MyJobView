import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { TechEfficiencyChart } from './TechEfficiencyChart';
import { TechAdvisorTab } from './TechAdvisorTab';
import {
  Clock,
  TrendingUp,
  Users,
  Calendar,
  Award,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Activity,
  Navigation,
  MapPin,
  DollarSign,
  ChevronRight,
  Printer,
  History,
  Brain,
} from 'lucide-react';

interface TechEfficiency {
  technician_id: string;
  technician_name: string;
  employment_type: string;
  total_daily_hours: number;
  total_job_hours: number;
  expected_hours?: number;
  efficiency_percentage: number;
  days_worked: number;
  total_miles_driven: number;
  total_trips: number;
  average_trip_distance: number;
  total_travel_bonus: number;
}

interface DailyBreakdown {
  date: string;
  daily_hours: number;
  job_hours: number;
  efficiency: number;
  miles_driven: number;
  trips: number;
  payroll_hours_only: boolean;
}

type PresetKey = 'this_week' | 'last_week' | 'last_month' | 'last_quarter' | 'this_year' | 'last_year' | 'custom';

interface DatePreset {
  key: PresetKey;
  label: string;
}

const DATE_PRESETS: DatePreset[] = [
  { key: 'this_week', label: 'This Week' },
  { key: 'last_week', label: 'Last Week' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'last_quarter', label: 'Last Quarter' },
  { key: 'this_year', label: 'This Year' },
  { key: 'last_year', label: 'Last Year' },
];

function getPresetDates(preset: PresetKey): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const dow = now.getDay();

  const fmt = (dt: Date) => dt.toISOString().split('T')[0];

  switch (preset) {
    case 'this_week': {
      const mon = new Date(now);
      mon.setDate(d - (dow === 0 ? 6 : dow - 1));
      return { start: fmt(mon), end: fmt(now) };
    }
    case 'last_week': {
      const mon = new Date(now);
      mon.setDate(d - (dow === 0 ? 6 : dow - 1) - 7);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return { start: fmt(mon), end: fmt(sun) };
    }
    case 'last_month': {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      return { start: fmt(start), end: fmt(end) };
    }
    case 'last_quarter': {
      const qStart = Math.floor(m / 3) * 3 - 3;
      const start = new Date(qStart < 0 ? y - 1 : y, qStart < 0 ? qStart + 12 : qStart, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 3, 0);
      return { start: fmt(start), end: fmt(end) };
    }
    case 'this_year':
      return { start: `${y}-01-01`, end: fmt(now) };
    case 'last_year':
      return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31` };
    default:
      return { start: fmt(new Date(now.setDate(d - 30))), end: new Date().toISOString().split('T')[0] };
  }
}

function detectPreset(start: string, end: string): PresetKey {
  for (const p of DATE_PRESETS) {
    const { start: ps, end: pe } = getPresetDates(p.key);
    if (ps === start && pe === end) return p.key;
  }
  return 'custom';
}

function getPriorPeriodDates(
  preset: PresetKey,
  currentStart: string,
  currentEnd: string
): { start: string; end: string; label: string } {
  const fmt = (dt: Date) => dt.toISOString().split('T')[0];

  switch (preset) {
    case 'this_week': {
      const d = getPresetDates('last_week');
      return { ...d, label: 'Last Week' };
    }
    case 'last_week': {
      const now = new Date(currentStart + 'T12:00:00');
      const end = new Date(now);
      end.setDate(now.getDate() - 1);
      const start = new Date(end);
      start.setDate(end.getDate() - 6);
      return { start: fmt(start), end: fmt(end), label: 'Week Before Last' };
    }
    case 'last_month': {
      const s = new Date(currentStart + 'T12:00:00');
      const priorEnd = new Date(s.getFullYear(), s.getMonth(), 0);
      const priorStart = new Date(priorEnd.getFullYear(), priorEnd.getMonth(), 1);
      return { start: fmt(priorStart), end: fmt(priorEnd), label: '2 Months Ago' };
    }
    case 'last_quarter': {
      const s = new Date(currentStart + 'T12:00:00');
      const qStart = Math.floor(s.getMonth() / 3) * 3 - 3;
      const priorStart = new Date(qStart < 0 ? s.getFullYear() - 1 : s.getFullYear(), qStart < 0 ? qStart + 12 : qStart, 1);
      const priorEnd = new Date(priorStart.getFullYear(), priorStart.getMonth() + 3, 0);
      return { start: fmt(priorStart), end: fmt(priorEnd), label: 'Prior Quarter' };
    }
    case 'this_year': {
      const y = new Date(currentStart + 'T12:00:00').getFullYear();
      return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31`, label: 'Last Year' };
    }
    case 'last_year': {
      const y = new Date(currentStart + 'T12:00:00').getFullYear();
      return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31`, label: `${y - 1}` };
    }
    default: {
      // Custom: shift back by the same number of days
      const s = new Date(currentStart + 'T12:00:00');
      const e = new Date(currentEnd + 'T12:00:00');
      const daysDiff = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
      const priorEnd = new Date(s);
      priorEnd.setDate(s.getDate() - 1);
      const priorStart = new Date(priorEnd);
      priorStart.setDate(priorEnd.getDate() - daysDiff + 1);
      return { start: fmt(priorStart), end: fmt(priorEnd), label: 'Prior Period' };
    }
  }
}

function getEfficiencyColor(efficiency: number) {
  if (efficiency >= 90) return 'text-green-400 bg-green-500/10';
  if (efficiency >= 75) return 'text-blue-400 bg-blue-500/10';
  if (efficiency >= 60) return 'text-yellow-400 bg-yellow-500/10';
  return 'text-red-400 bg-red-500/10';
}

function getEfficiencyBarColor(efficiency: number) {
  if (efficiency >= 90) return 'bg-green-500';
  if (efficiency >= 75) return 'bg-blue-500';
  if (efficiency >= 60) return 'bg-yellow-500';
  return 'bg-red-500';
}

function getEfficiencyPrintColor(efficiency: number): string {
  if (efficiency >= 90) return '#16a34a';
  if (efficiency >= 75) return '#2563eb';
  if (efficiency >= 60) return '#ca8a04';
  return '#dc2626';
}

interface TechStatsProps {
  onNavigate?: (tab: string) => void;
}

export function TechStats({ onNavigate }: TechStatsProps) {
  const defaultDates = getPresetDates('last_month');

  const [activeView, setActiveView] = useState<'stats' | 'advisor'>('stats');
  const [loading, setLoading] = useState(true);
  const [techStats, setTechStats] = useState<TechEfficiency[]>([]);
  const [selectedTech, setSelectedTech] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>(defaultDates.start);
  const [endDate, setEndDate] = useState<string>(defaultDates.end);
  const [activePreset, setActivePreset] = useState<PresetKey>('last_month');
  const [expandedTechs, setExpandedTechs] = useState<Set<string>>(new Set());
  const [allDailyBreakdowns, setAllDailyBreakdowns] = useState<Record<string, DailyBreakdown[]>>({});
  const [showPrintOptions, setShowPrintOptions] = useState(false);
  const [printOptions, setPrintOptions] = useState({
    includeBreakdowns: true,
    includeSummary: true,
    includeTable: true,
  });
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [showCustomDates, setShowCustomDates] = useState(false);
  const customRef = useRef<HTMLDivElement>(null);
  const printRef = useRef<HTMLDivElement>(null);

  function applyPreset(key: PresetKey) {
    const { start, end } = getPresetDates(key);
    setActivePreset(key);
    setStartDate(start);
    setEndDate(end);
    setShowCustomDates(false);
  }

  function handleStartDateChange(val: string) {
    setStartDate(val);
    setActivePreset(detectPreset(val, endDate));
  }

  function handleEndDateChange(val: string) {
    setEndDate(val);
    setActivePreset(detectPreset(startDate, val));
  }

  function calculateBusinessDays(start: string, end: string): number {
    let count = 0;
    const cur = new Date(start + 'T12:00:00');
    const fin = new Date(end + 'T12:00:00');
    while (cur <= fin) {
      const dow = cur.getDay();
      if (dow !== 0 && dow !== 6) count++;
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  }

  function calculateExpectedHours(start: string, end: string): number {
    return calculateBusinessDays(start, end) * 8;
  }

  useEffect(() => {
    loadTechnicians();
  }, []);

  useEffect(() => {
    if (technicians.length > 0) loadTechStats();
  }, [startDate, endDate, selectedTech, technicians]);

  async function loadTechnicians() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, employment_type')
        .in('role', ['tech', 'manager'])
        .order('full_name');
      if (error) throw error;
      setTechnicians(data || []);
      if (!data || data.length === 0) setLoading(false);
    } catch (error) {
      console.error('Error loading technicians:', error);
      setLoading(false);
    }
  }

  async function loadTechStats() {
    try {
      setLoading(true);

      const techIds = selectedTech === 'all'
        ? technicians.map(t => t.id)
        : [selectedTech];

      if (techIds.length === 0) {
        setTechStats([]);
        setLoading(false);
        return;
      }

      const statsPromises = techIds.map(async (techId) => {
        const tech = technicians.find(t => t.id === techId);
        const employmentType = tech?.employment_type || 'hourly';
        const isSalaryNoClock = employmentType === 'salary_no_clock';

        const [dailyClockResult, timeEntriesResult, travelResult] = await Promise.all([
          isSalaryNoClock
            ? Promise.resolve({ data: [], error: null })
            : supabase
                .from('daily_clock_entries')
                .select('entry_date, total_hours, payroll_hours_only, status')
                .eq('technician_id', techId)
                .gte('entry_date', startDate)
                .lte('entry_date', endDate)
                .or('status.eq.clocked_out,payroll_hours_only.eq.true'),
          supabase
            .from('time_entries')
            .select('entry_date, total_hours')
            .eq('technician_id', techId)
            .gte('entry_date', startDate)
            .lte('entry_date', endDate)
            .not('clock_out', 'is', null),
          supabase
            .from('travel_bonus_requests')
            .select('total_distance_miles, bonus_amount, adjusted_amount, status, created_at')
            .eq('technician_id', techId)
            .gte('created_at', startDate)
            .lte('created_at', endDate + 'T23:59:59'),
        ]);

        const dailyClockData = dailyClockResult.data || [];
        const timeEntriesData = timeEntriesResult.data || [];
        const travelData = travelResult.data || [];

        const totalDailyHours = dailyClockData.reduce(
          (sum, e) => sum + (parseFloat(e.total_hours) || 0), 0
        );
        const totalJobHours = timeEntriesData.reduce(
          (sum, e) => sum + (parseFloat(e.total_hours) || 0), 0
        );

        const daysFromClock = new Set(dailyClockData.map(e => e.entry_date)).size;
        const daysFromJobs = new Set(timeEntriesData.map(e => e.entry_date)).size;
        const daysWorked = isSalaryNoClock
          ? daysFromJobs
          : Math.max(daysFromClock, daysFromJobs > 0 && daysFromClock === 0 ? daysFromJobs : 0);

        let efficiency = 0;
        let expectedHours = 0;

        if (employmentType === 'salary' || employmentType === 'salary_no_clock') {
          expectedHours = calculateExpectedHours(startDate, endDate);
          efficiency = expectedHours > 0 ? (totalJobHours / expectedHours) * 100 : 0;
        } else {
          if (totalDailyHours > 0) {
            efficiency = (totalJobHours / totalDailyHours) * 100;
          } else if (totalJobHours > 0) {
            efficiency = 0;
          }
        }

        const totalMilesDriven = travelData.reduce(
          (sum, t) => sum + (parseFloat(t.total_distance_miles) || 0), 0
        );
        const totalTrips = travelData.length;
        const averageTripDistance = totalTrips > 0 ? totalMilesDriven / totalTrips : 0;
        const totalTravelBonus = travelData
          .filter(t => t.status === 'approved' || t.status === 'paid')
          .reduce((sum, t) => sum + (parseFloat(t.adjusted_amount || t.bonus_amount) || 0), 0);

        return {
          technician_id: techId,
          technician_name: tech?.full_name || 'Unknown',
          employment_type: employmentType,
          total_daily_hours: totalDailyHours,
          total_job_hours: totalJobHours,
          expected_hours: expectedHours > 0 ? expectedHours : undefined,
          efficiency_percentage: efficiency,
          days_worked: daysWorked,
          total_miles_driven: totalMilesDriven,
          total_trips: totalTrips,
          average_trip_distance: averageTripDistance,
          total_travel_bonus: totalTravelBonus,
        };
      });

      const results = await Promise.all(statsPromises);
      const sortedResults = results
        .filter(r => r.days_worked > 0 || r.total_job_hours > 0)
        .sort((a, b) => b.efficiency_percentage - a.efficiency_percentage);

      setTechStats(sortedResults);
    } catch (error) {
      console.error('Error loading tech stats:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadDailyBreakdown(techId: string) {
    try {
      const tech = technicians.find(t => t.id === techId);
      const isSalaryNoClock = tech?.employment_type === 'salary_no_clock';

      const [clockResult, jobResult] = await Promise.all([
        isSalaryNoClock
          ? Promise.resolve({ data: [], error: null })
          : supabase
              .from('daily_clock_entries')
              .select('entry_date, total_hours, payroll_hours_only, status')
              .eq('technician_id', techId)
              .gte('entry_date', startDate)
              .lte('entry_date', endDate)
              .or('status.eq.clocked_out,payroll_hours_only.eq.true')
              .order('entry_date', { ascending: false }),
        supabase
          .from('time_entries')
          .select('entry_date, total_hours')
          .eq('technician_id', techId)
          .gte('entry_date', startDate)
          .lte('entry_date', endDate)
          .not('clock_out', 'is', null),
      ]);

      const clockData = clockResult.data || [];
      const jobData = jobResult.data || [];

      const allDates = new Set([
        ...clockData.map(e => e.entry_date),
        ...jobData.map(e => e.entry_date),
      ]);

      const breakdown: DailyBreakdown[] = Array.from(allDates)
        .sort((a, b) => b.localeCompare(a))
        .map(date => {
          const clockEntry = clockData.find(e => e.entry_date === date);
          const dayJobEntries = jobData.filter(e => e.entry_date === date);
          const dailyHours = parseFloat(clockEntry?.total_hours || '0') || 0;
          const jobHours = dayJobEntries.reduce((s, e) => s + (parseFloat(e.total_hours) || 0), 0);
          const efficiency = dailyHours > 0 ? (jobHours / dailyHours) * 100 : 0;
          return {
            date,
            daily_hours: dailyHours,
            job_hours: jobHours,
            efficiency,
            miles_driven: 0,
            trips: 0,
            payroll_hours_only: !!clockEntry?.payroll_hours_only,
          };
        });

      return breakdown;
    } catch (error) {
      console.error('Error loading daily breakdown:', error);
      return [];
    }
  }

  function toggleExpanded(techId: string) {
    setExpandedTechs(prev => {
      const next = new Set(prev);
      if (next.has(techId)) {
        next.delete(techId);
      } else {
        next.add(techId);
        if (!allDailyBreakdowns[techId]) {
          loadDailyBreakdown(techId).then(bd => {
            setAllDailyBreakdowns(p => ({ ...p, [techId]: bd }));
          });
        }
      }
      return next;
    });
  }

  function expandAll() {
    const ids = techStats.map(t => t.technician_id);
    setExpandedTechs(new Set(ids));
    ids.forEach(id => {
      if (!allDailyBreakdowns[id]) {
        loadDailyBreakdown(id).then(bd => {
          setAllDailyBreakdowns(p => ({ ...p, [id]: bd }));
        });
      }
    });
  }

  function collapseAll() {
    setExpandedTechs(new Set());
  }

  async function handlePrint() {
    const statsToprint = techStats;
    if (statsToprint.length === 0) return;

    setShowPrintOptions(false);

    const breakdownMap: Record<string, DailyBreakdown[]> = { ...allDailyBreakdowns };

    if (printOptions.includeBreakdowns && expandedTechs.size > 0) {
      for (const techId of Array.from(expandedTechs)) {
        if (!breakdownMap[techId]) {
          breakdownMap[techId] = await loadDailyBreakdown(techId);
        }
      }
      setAllDailyBreakdowns(breakdownMap);
    }

    const isSingleTech = selectedTech !== 'all';
    const techLabel = isSingleTech
      ? technicians.find(t => t.id === selectedTech)?.full_name || ''
      : 'All Technicians';
    const dateLabel = activePreset === 'custom'
      ? `${startDate} — ${endDate}`
      : DATE_PRESETS.find(p => p.key === activePreset)?.label || 'Custom';

    const avgEff = statsToprint.length > 0
      ? statsToprint.reduce((s, t) => s + t.efficiency_percentage, 0) / statsToprint.length
      : 0;
    const totClockHrs = statsToprint.reduce((s, t) => s + t.total_daily_hours, 0);
    const totJobHrs = statsToprint.reduce((s, t) => s + t.total_job_hours, 0);
    const totMiles = statsToprint.reduce((s, t) => s + t.total_miles_driven, 0);
    const totTrips = statsToprint.reduce((s, t) => s + t.total_trips, 0);
    const totBonus = statsToprint.reduce((s, t) => s + t.total_travel_bonus, 0);

    const summaryRows = statsToprint.map((tech, idx) => {
      const isSalary = tech.employment_type === 'salary' || tech.employment_type === 'salary_no_clock';
      const clockLabel = isSalary
        ? `${(tech.expected_hours ?? 0).toFixed(0)}h expected`
        : `${tech.total_daily_hours.toFixed(1)}h`;
      const effColor = getEfficiencyPrintColor(tech.efficiency_percentage);
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;

      return `
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:8px 10px;font-weight:600;">${medal} ${tech.technician_name}</td>
          <td style="padding:8px 10px;text-align:center;">${isSalary ? 'Salary' : tech.days_worked + 'd'}</td>
          <td style="padding:8px 10px;text-align:right;">${clockLabel}</td>
          <td style="padding:8px 10px;text-align:right;">${tech.total_job_hours.toFixed(1)}h</td>
          <td style="padding:8px 10px;text-align:right;">${tech.total_miles_driven.toFixed(0)}</td>
          <td style="padding:8px 10px;text-align:right;">${tech.total_trips}</td>
          <td style="padding:8px 10px;text-align:right;font-weight:700;color:${effColor};">${tech.efficiency_percentage.toFixed(1)}%</td>
        </tr>`;
    }).join('');

    const breakdownSections = printOptions.includeBreakdowns
      ? statsToprint
          .filter(tech => expandedTechs.has(tech.technician_id))
          .map(tech => {
            const bd = breakdownMap[tech.technician_id] || [];
            if (bd.length === 0) return '';
            const rows = bd.map(day => {
              const dateStr = new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric',
              });
              const effColor = getEfficiencyPrintColor(day.efficiency);
              const payrollBadge = day.payroll_hours_only
                ? ' <span style="font-size:10px;background:#dbeafe;color:#1d4ed8;padding:1px 5px;border-radius:4px;">Payroll</span>'
                : '';
              return '<tr style="border-bottom:1px solid #f3f4f6;">' +
                '<td style="padding:5px 10px;">' + dateStr + payrollBadge + '</td>' +
                '<td style="padding:5px 10px;text-align:right;">' + day.daily_hours.toFixed(1) + 'h</td>' +
                '<td style="padding:5px 10px;text-align:right;">' + day.job_hours.toFixed(1) + 'h</td>' +
                '<td style="padding:5px 10px;text-align:right;font-weight:600;color:' + effColor + ';">' + day.efficiency.toFixed(0) + '%</td>' +
                '</tr>';
            }).join('');

            return '<div style="margin-top:24px;page-break-inside:avoid;">' +
              '<h3 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 6px 0;padding:6px 10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;">' +
              tech.technician_name + ' \u2014 Daily Breakdown</h3>' +
              '<table style="width:100%;border-collapse:collapse;font-size:12px;">' +
              '<thead><tr style="background:#f3f4f6;">' +
              '<th style="padding:5px 10px;text-align:left;color:#6b7280;">Date</th>' +
              '<th style="padding:5px 10px;text-align:right;color:#6b7280;">Clock Hrs</th>' +
              '<th style="padding:5px 10px;text-align:right;color:#6b7280;">Job Hrs</th>' +
              '<th style="padding:5px 10px;text-align:right;color:#6b7280;">Efficiency</th>' +
              '</tr></thead>' +
              '<tbody>' + rows + '</tbody>' +
              '</table></div>';
          }).join('')
      : '';

    const summarySection = printOptions.includeSummary ? (
      '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:20px;">' +
      [
        ['Clock Hrs', totClockHrs.toFixed(1)],
        ['Job Hrs', totJobHrs.toFixed(1)],
        ['Avg Efficiency', avgEff.toFixed(1) + '%'],
        ['Total Miles', totMiles.toFixed(0)],
        ['Total Trips', totTrips.toString()],
        ['Travel Bonus', '$' + totBonus.toFixed(0)],
      ].map(([label, val]) =>
        '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;">' +
        '<div style="font-size:10px;color:#6b7280;margin-bottom:3px;">' + label + '</div>' +
        '<div style="font-size:18px;font-weight:700;">' + val + '</div>' +
        '</div>'
      ).join('') +
      '</div>'
    ) : '';

    const tableSection = printOptions.includeTable ? (
      '<h2 style="font-size:14px;font-weight:700;margin:0 0 8px 0;color:#111827;">Technician Rankings</h2>' +
      '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:4px;">' +
      '<thead><tr style="background:#f3f4f6;border-bottom:2px solid #e5e7eb;">' +
      '<th style="padding:8px 10px;text-align:left;color:#374151;">Technician</th>' +
      '<th style="padding:8px 10px;text-align:center;color:#374151;">Days</th>' +
      '<th style="padding:8px 10px;text-align:right;color:#374151;">Clock Hrs</th>' +
      '<th style="padding:8px 10px;text-align:right;color:#374151;">Job Hrs</th>' +
      '<th style="padding:8px 10px;text-align:right;color:#374151;">Miles</th>' +
      '<th style="padding:8px 10px;text-align:right;color:#374151;">Trips</th>' +
      '<th style="padding:8px 10px;text-align:right;color:#374151;">Efficiency</th>' +
      '</tr></thead>' +
      '<tbody>' + summaryRows + '</tbody>' +
      '</table>'
    ) : '';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Tech Efficiency Report — ${dateLabel}</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; color: #111827; margin: 0; padding: 24px; }
          @media print {
            body { padding: 0; }
            @page { margin: 18mm 14mm; }
          }
        </style>
      </head>
      <body>
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;border-bottom:2px solid #e5e7eb;padding-bottom:14px;">
          <div>
            <h1 style="font-size:20px;font-weight:800;margin:0 0 4px 0;">Tech Efficiency Report</h1>
            <p style="margin:0;color:#6b7280;font-size:12px;">${techLabel} &bull; ${dateLabel}</p>
          </div>
          <div style="text-align:right;font-size:11px;color:#9ca3af;">
            Printed ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
        ${summarySection}
        ${tableSection}
        ${breakdownSections}
      </body>
      </html>`;

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 400);
  }

  const averageEfficiency = techStats.length > 0
    ? techStats.reduce((sum, t) => sum + t.efficiency_percentage, 0) / techStats.length
    : 0;

  const totalDailyHours = techStats.reduce((sum, t) => sum + t.total_daily_hours, 0);
  const totalJobHours = techStats.reduce((sum, t) => sum + t.total_job_hours, 0);
  const totalMiles = techStats.reduce((sum, t) => sum + t.total_miles_driven, 0);
  const totalTrips = techStats.reduce((sum, t) => sum + t.total_trips, 0);
  const totalTravelBonus = techStats.reduce((sum, t) => sum + t.total_travel_bonus, 0);

  const activeDateLabel = activePreset === 'custom'
    ? `${startDate} — ${endDate}`
    : DATE_PRESETS.find(p => p.key === activePreset)?.label || 'Custom';

  if (loading && techStats.length === 0 && technicians.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading tech stats...</div>
      </div>
    );
  }

  if (!loading && technicians.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Tech Efficiency Stats</h2>
          <p className="text-gray-400">Track technician efficiency: Daily clock time vs. Job time</p>
        </div>
        <div className="flex items-center justify-center h-64 bg-gray-800 border border-gray-700 rounded-xl">
          <div className="text-center">
            <Users className="w-16 h-16 mx-auto mb-4 text-gray-600" />
            <h3 className="text-xl font-semibold text-white mb-2">No Technicians Found</h3>
            <p className="text-gray-400 text-sm">Add technicians in the Admin section to start tracking efficiency stats.</p>
          </div>
        </div>
      </div>
    );
  }

  const priorPeriod = getPriorPeriodDates(activePreset, startDate, endDate);
  const currentPeriodLabel = activePreset === 'custom'
    ? `${startDate} — ${endDate}`
    : DATE_PRESETS.find(p => p.key === activePreset)?.label || 'Custom';

  return (
    <div className="space-y-5" ref={printRef}>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Tech Efficiency Stats</h2>
          <p className="text-gray-400 text-sm">Daily clock time vs. job time for each technician</p>
        </div>
        <div className="flex items-center gap-2">
          {activeView === 'stats' && onNavigate && (
            <button
              onClick={() => onNavigate('daily_clock')}
              className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 hover:text-white rounded-lg text-sm font-medium transition-colors"
            >
              <History className="w-4 h-4" />
              Time Clock History
            </button>
          )}
          {activeView === 'stats' && (
            <div className="relative">
              <button
                onClick={() => setShowPrintOptions(v => !v)}
                disabled={techStats.length === 0}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Printer className="w-4 h-4" />
                Print Report
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showPrintOptions ? 'rotate-180' : ''}`} />
              </button>

              {showPrintOptions && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 p-4">
                  <h4 className="text-sm font-semibold text-white mb-3">Print Options</h4>
                  <div className="space-y-2.5 mb-4">
                    <label className="flex items-center gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={printOptions.includeSummary}
                        onChange={e => setPrintOptions(p => ({ ...p, includeSummary: e.target.checked }))}
                        className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
                      />
                      <span className="text-sm text-gray-300 group-hover:text-white transition-colors">Summary KPIs</span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={printOptions.includeTable}
                        onChange={e => setPrintOptions(p => ({ ...p, includeTable: e.target.checked }))}
                        className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
                      />
                      <span className="text-sm text-gray-300 group-hover:text-white transition-colors">Rankings Table</span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={printOptions.includeBreakdowns}
                        onChange={e => setPrintOptions(p => ({ ...p, includeBreakdowns: e.target.checked }))}
                        className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
                      />
                      <span className="text-sm text-gray-300 group-hover:text-white transition-colors">
                        Daily Breakdowns
                        <span className="ml-1 text-xs text-gray-500">({expandedTechs.size} expanded)</span>
                      </span>
                    </label>
                  </div>
                  {printOptions.includeBreakdowns && expandedTechs.size === 0 && (
                    <p className="text-xs text-amber-400 mb-3">Expand technician rows to include their daily breakdowns.</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={handlePrint}
                      className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Print
                    </button>
                    <button
                      onClick={() => setShowPrintOptions(false)}
                      className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm font-medium transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* View tabs */}
      <div className="flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveView('stats')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeView === 'stats'
              ? 'bg-gray-700 text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Stats
        </button>
        <button
          onClick={() => setActiveView('advisor')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeView === 'advisor'
              ? 'bg-gray-700 text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Brain className="w-4 h-4" />
          AI Advisor
        </button>
      </div>

      {activeView === 'advisor' && (
        <TechAdvisorTab
          startDate={startDate}
          endDate={endDate}
          priorStartDate={priorPeriod.start}
          priorEndDate={priorPeriod.end}
          periodLabel={currentPeriodLabel}
          priorPeriodLabel={priorPeriod.label}
        />
      )}

      {activeView === 'stats' && (
      <>
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-5">

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {DATE_PRESETS.map(preset => (
              <button
                key={preset.key}
                onClick={() => applyPreset(preset.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activePreset === preset.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                }`}
              >
                {preset.label}
              </button>
            ))}
            <button
              onClick={() => setShowCustomDates(v => !v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                activePreset === 'custom'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Custom
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showCustomDates ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {showCustomDates && (
            <div ref={customRef} className="flex items-center gap-3 flex-wrap bg-gray-900/50 border border-gray-700/50 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400 shrink-0">From</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => handleStartDateChange(e.target.value)}
                  className="px-3 py-1.5 bg-gray-900 border border-gray-600 text-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent [color-scheme:dark]"
                />
              </div>
              <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400 shrink-0">To</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => handleEndDateChange(e.target.value)}
                  className="px-3 py-1.5 bg-gray-900 border border-gray-600 text-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent [color-scheme:dark]"
                />
              </div>
              {activePreset === 'custom' && (
                <span className="text-xs text-blue-400 font-medium">Custom range active</span>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-48">
              <select
                value={selectedTech}
                onChange={e => setSelectedTech(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 text-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Technicians</option>
                {technicians.map(tech => (
                  <option key={tech.id} value={tech.id}>{tech.full_name}</option>
                ))}
              </select>
            </div>
            <div className="text-sm text-gray-500">
              {activeDateLabel}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { icon: Users, color: 'text-blue-400', label: 'Techs', value: techStats.length.toString() },
            { icon: Clock, color: 'text-green-400', label: 'Clock Hrs', value: totalDailyHours.toFixed(1) },
            { icon: Activity, color: 'text-cyan-400', label: 'Job Hrs', value: totalJobHours.toFixed(1) },
            { icon: TrendingUp, color: 'text-orange-400', label: 'Avg Efficiency', value: `${averageEfficiency.toFixed(1)}%` },
            { icon: Navigation, color: 'text-teal-400', label: 'Miles', value: totalMiles.toFixed(0) },
            { icon: MapPin, color: 'text-pink-400', label: 'Trips', value: totalTrips.toString() },
            { icon: DollarSign, color: 'text-green-400', label: 'Travel Bonus', value: `$${totalTravelBonus.toFixed(0)}` },
          ].map(stat => (
            <div key={stat.label} className="bg-gray-900/70 rounded-lg border border-gray-700/50 p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
                <span className="text-xs text-gray-500">{stat.label}</span>
              </div>
              <div className="text-xl font-bold text-white">{stat.value}</div>
            </div>
          ))}
        </div>
      </div>

      <TechEfficiencyChart
        startDate={startDate}
        endDate={endDate}
        selectedTech={selectedTech}
        technicians={technicians}
      />

      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-700 flex items-center gap-2">
          <Award className="w-5 h-5 text-yellow-400" />
          <h3 className="text-base font-bold text-white">Technician Rankings</h3>
          {loading && <span className="text-xs text-gray-500 ml-auto">Refreshing...</span>}
          {!loading && techStats.length > 0 && (
            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={expandAll}
                className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
              >
                <ChevronDown className="w-3 h-3" />
                Expand All
              </button>
              <button
                onClick={collapseAll}
                className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
              >
                <ChevronUp className="w-3 h-3" />
                Collapse All
              </button>
            </div>
          )}
        </div>

        <div className="divide-y divide-gray-700/60">
          {!loading && techStats.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <BarChart3 className="w-10 h-10 mx-auto mb-3 text-gray-600" />
              <p className="text-gray-400 font-medium">No data for this period</p>
              <p className="text-gray-500 text-sm mt-1">Try a different date range or technician filter</p>
            </div>
          ) : (
            techStats.map((tech, index) => (
              <div key={tech.technician_id}>
                <div
                  className="px-5 py-4 hover:bg-gray-700/30 cursor-pointer transition-colors"
                  onClick={() => toggleExpanded(tech.technician_id)}
                >
                  <div className="flex items-center gap-4">
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm shrink-0 ${
                      index === 0 ? 'bg-yellow-400 text-gray-900'
                      : index === 1 ? 'bg-gray-300 text-gray-900'
                      : index === 2 ? 'bg-amber-600 text-white'
                      : 'bg-gray-700 text-gray-300'
                    }`}>
                      {index + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-white truncate">{tech.technician_name}</span>
                        <span className="text-xs text-gray-500 shrink-0">
                          {tech.employment_type === 'salary' || tech.employment_type === 'salary_no_clock'
                            ? 'Salary'
                            : `${tech.days_worked}d worked`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden max-w-32">
                          <div
                            className={`h-full rounded-full transition-all ${getEfficiencyBarColor(tech.efficiency_percentage)}`}
                            style={{ width: `${Math.min(100, tech.efficiency_percentage)}%` }}
                          />
                        </div>
                        <span className={`text-xs font-semibold ${getEfficiencyColor(tech.efficiency_percentage).split(' ')[0]}`}>
                          {tech.efficiency_percentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    <div className="hidden sm:flex items-center gap-5 shrink-0">
                      <Stat
                        label={tech.employment_type === 'salary' || tech.employment_type === 'salary_no_clock' ? 'Expected' : 'Clock Hrs'}
                        value={
                          tech.employment_type === 'salary' || tech.employment_type === 'salary_no_clock'
                            ? `${tech.expected_hours?.toFixed(0) ?? '0'}h`
                            : `${tech.total_daily_hours.toFixed(1)}h`
                        }
                      />
                      <Stat label="Job Hrs" value={`${tech.total_job_hours.toFixed(1)}h`} />
                      <Stat label="Miles" value={tech.total_miles_driven.toFixed(0)} valueClass="text-teal-400" icon={<Navigation className="w-3 h-3" />} />
                      <Stat label="Trips" value={tech.total_trips.toString()} valueClass="text-pink-400" />
                      <div className={`px-3 py-2 rounded-lg text-center min-w-[70px] ${getEfficiencyColor(tech.efficiency_percentage)}`}>
                        <div className="text-xs font-medium opacity-70">Efficiency</div>
                        <div className="text-lg font-bold leading-tight">{tech.efficiency_percentage.toFixed(1)}%</div>
                      </div>
                    </div>

                    {expandedTechs.has(tech.technician_id)
                      ? <ChevronUp className="w-4 h-4 text-gray-500 shrink-0" />
                      : <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
                    }
                  </div>
                </div>

                {expandedTechs.has(tech.technician_id) && (
                  <div className="px-5 pb-4 bg-gray-900/50 border-t border-gray-700/60">
                    <h5 className="text-sm font-semibold text-gray-300 mt-4 mb-3 flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      Daily Breakdown
                    </h5>

                    {!allDailyBreakdowns[tech.technician_id] ? (
                      <div className="text-center py-4 text-gray-500 text-sm">Loading breakdown...</div>
                    ) : allDailyBreakdowns[tech.technician_id].length === 0 ? (
                      <div className="text-center py-4 text-gray-500 text-sm">No daily data for this period</div>
                    ) : (
                      <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                        {allDailyBreakdowns[tech.technician_id].map(day => (
                          <div
                            key={day.date}
                            className="flex items-center justify-between gap-3 bg-gray-800/70 rounded-lg px-3 py-2.5"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Calendar className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                              <span className="text-sm text-white whitespace-nowrap">
                                {new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', {
                                  weekday: 'short', month: 'short', day: 'numeric',
                                })}
                              </span>
                              {day.payroll_hours_only && (
                                <span className="px-1.5 py-0.5 bg-blue-900/60 text-blue-300 rounded text-xs">Payroll</span>
                              )}
                            </div>
                            <div className="flex items-center gap-4 shrink-0">
                              <MiniStat label="Clock" value={`${day.daily_hours.toFixed(1)}h`} />
                              <MiniStat label="Job" value={`${day.job_hours.toFixed(1)}h`} />
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded ${getEfficiencyColor(day.efficiency)}`}>
                                {day.efficiency.toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
}

function Stat({ label, value, valueClass = 'text-white', icon }: {
  label: string; value: string; valueClass?: string; icon?: React.ReactNode;
}) {
  return (
    <div className="text-right">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-sm font-semibold flex items-center gap-1 justify-end ${valueClass}`}>
        {icon}{value}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm font-medium text-white">{value}</div>
    </div>
  );
}
