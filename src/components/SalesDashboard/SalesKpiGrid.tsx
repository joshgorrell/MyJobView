import { SalesKpiCard } from './SalesKpiCard';
import {
  computeCurrentPaceKpi,
  computeSalesBookedKpi,
  computePipelineCoverageKpi,
  computeCloseRateKpi,
} from '../../lib/salesDashboardCalculations';
import type { SalesDashboardResult } from '../../lib/salesDashboardTypes';

interface SalesKpiGridProps {
  data: SalesDashboardResult;
}

export function SalesKpiGrid({ data }: SalesKpiGridProps) {
  const cards = [
    { data: computeCurrentPaceKpi(data), color: 'blue' },
    { data: computeSalesBookedKpi(data), color: 'green' },
    { data: computePipelineCoverageKpi(data), color: 'teal' },
    { data: computeCloseRateKpi(data), color: 'amber' },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, i) => (
        <SalesKpiCard key={i} data={card.data} accentColor={card.color} />
      ))}
    </div>
  );
}
