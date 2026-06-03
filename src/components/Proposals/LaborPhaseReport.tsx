import React, { useState, useMemo } from 'react';
import { ProposalLineItem, ProposalRoom, LaborPhase } from '../../lib/types';
import {
  X, Printer, Layers, Package, ClipboardList, CheckCircle2,
  Circle, ChevronDown, Eye, EyeOff, Clock, Filter
} from 'lucide-react';

interface LaborPhaseReportProps {
  proposalId: string;
  proposalNumber?: string;
  customerName?: string;
  rooms: (ProposalRoom & { line_items: ProposalLineItem[] })[];
  onClose: () => void;
}

interface PhaseGroup {
  phase: LaborPhase | null;
  phaseId: string;
  phaseName: string;
  parts: ProposalLineItem[];
  tasks: ProposalLineItem[];
  totalLaborHours: number;
}

const UNASSIGNED_ID = '__unassigned__';

export default function LaborPhaseReport({
  proposalId,
  proposalNumber,
  customerName,
  rooms,
  onClose,
}: LaborPhaseReportProps) {
  const [selectedPhaseId, setSelectedPhaseId] = useState<string>('all');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());

  const allLineItems = useMemo(() => {
    const items: ProposalLineItem[] = [];
    rooms.forEach(room => {
      room.line_items
        .filter(item => !item.parent_item_id && !item.is_hidden)
        .forEach(item => {
          items.push(item);
          if (item.accessories) {
            item.accessories
              .filter(acc => !acc.is_hidden)
              .forEach(acc => items.push(acc));
          }
        });
    });
    return items;
  }, [rooms]);

  const phaseGroups = useMemo((): PhaseGroup[] => {
    const groupMap = new Map<string, PhaseGroup>();

    allLineItems.forEach(item => {
      const phaseId = item.labor_phase_id || UNASSIGNED_ID;
      const phaseName = item.labor_phases?.name || 'Unassigned';

      if (!groupMap.has(phaseId)) {
        groupMap.set(phaseId, {
          phase: item.labor_phases || null,
          phaseId,
          phaseName,
          parts: [],
          tasks: [],
          totalLaborHours: 0,
        });
      }

      const group = groupMap.get(phaseId)!;

      const isMaterial =
        item.item_type === 'material' ||
        item.item_type === 'both' ||
        (item.item_type !== 'labor' && item.product_id);
      const isLaborOrTask =
        item.item_type === 'labor' ||
        item.task_notes ||
        (item.labor_hours && item.labor_hours > 0);

      if (isMaterial && item.quantity > 0) {
        group.parts.push(item);
      }
      if (isLaborOrTask) {
        group.tasks.push(item);
      }
      if (item.labor_hours) {
        group.totalLaborHours += item.labor_hours;
      }
    });

    const groups = Array.from(groupMap.values());
    groups.sort((a, b) => {
      if (a.phaseId === UNASSIGNED_ID) return 1;
      if (b.phaseId === UNASSIGNED_ID) return -1;
      const sortA = a.phase?.sort_order ?? 999;
      const sortB = b.phase?.sort_order ?? 999;
      return sortA - sortB || a.phaseName.localeCompare(b.phaseName);
    });
    return groups;
  }, [allLineItems]);

  const filteredGroups = useMemo(() => {
    let groups = phaseGroups;
    if (selectedPhaseId !== 'all') {
      groups = groups.filter(g => g.phaseId === selectedPhaseId);
    }
    return groups;
  }, [phaseGroups, selectedPhaseId]);

  const globalStats = useMemo(() => {
    let totalParts = 0;
    let totalTasks = 0;
    let completedTasks = 0;
    let totalHours = 0;
    phaseGroups.forEach(g => {
      totalParts += g.parts.length;
      totalTasks += g.tasks.length;
      completedTasks += g.tasks.filter(t => t.task_completed).length;
      totalHours += g.totalLaborHours;
    });
    return { totalParts, totalTasks, completedTasks, totalHours };
  }, [phaseGroups]);

  function togglePhase(phaseId: string) {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  }

  function isPhaseExpanded(phaseId: string) {
    return expandedPhases.has(phaseId);
  }

  const phaseColors = [
    'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500',
    'bg-cyan-500', 'bg-violet-400', 'bg-orange-500', 'bg-teal-500',
  ];

  function getPhaseColor(index: number) {
    return phaseColors[index % phaseColors.length];
  }

  const phaseColorIndex = useMemo(() => {
    const map = new Map<string, number>();
    phaseGroups.forEach((g, i) => map.set(g.phaseId, i));
    return map;
  }, [phaseGroups]);

  function filterTasks(tasks: ProposalLineItem[]) {
    if (!hideCompleted) return tasks;
    return tasks.filter(t => !t.task_completed);
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:p-0 print:bg-white print:block">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-full { max-height: none !important; overflow: visible !important; }
          .phase-section { page-break-inside: avoid; }
          .phase-page-break { page-break-before: always; }
          body { background: white; }
        }
      `}</style>

      <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col shadow-2xl border border-gray-200 print:max-h-none print:shadow-none print:rounded-none print:border-0">

        {/* Header */}
        <div className="no-print bg-gradient-to-r from-gray-800 via-gray-700 to-gray-800 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-lg">Labor Phase Report</h2>
              {(proposalNumber || customerName) && (
                <p className="text-gray-300 text-xs mt-0.5">
                  {[proposalNumber, customerName].filter(Boolean).join(' — ')}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>Print</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Print header */}
        <div className="hidden print:block px-8 pt-6 pb-2 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-gray-900">Labor Phase Report</h1>
          {(proposalNumber || customerName) && (
            <p className="text-gray-600 text-sm mt-1">
              {[proposalNumber, customerName].filter(Boolean).join(' — ')}
            </p>
          )}
          <p className="text-gray-400 text-xs mt-0.5">Printed {new Date().toLocaleDateString()}</p>
        </div>

        {/* Stats bar */}
        <div className="no-print bg-gray-50 border-b border-gray-100 px-6 py-3 grid grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-800">{phaseGroups.length}</p>
            <p className="text-xs text-gray-500 mt-0.5">Phases</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-800">{globalStats.totalParts}</p>
            <p className="text-xs text-gray-500 mt-0.5">Parts</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-800">
              {globalStats.completedTasks}/{globalStats.totalTasks}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Tasks Done</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-800">
              {globalStats.totalHours.toFixed(1)}h
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Total Labor</p>
          </div>
        </div>

        {/* Filters */}
        <div className="no-print bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Phase:</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setSelectedPhaseId('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                selectedPhaseId === 'all'
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All Phases
            </button>
            {phaseGroups.map((g, i) => (
              <button
                key={g.phaseId}
                onClick={() => setSelectedPhaseId(g.phaseId)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  selectedPhaseId === g.phaseId
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${getPhaseColor(i)}`} />
                {g.phaseName}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setHideCompleted(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                hideCompleted
                  ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {hideCompleted ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {hideCompleted ? 'Showing open tasks only' : 'Show all tasks'}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto print-full px-6 py-4 space-y-5">
          {filteredGroups.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <Layers className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No items match the selected filters.</p>
            </div>
          )}

          {filteredGroups.map((group, groupIdx) => {
            const colorClass = getPhaseColor(phaseColorIndex.get(group.phaseId) ?? groupIdx);
            const visibleTasks = filterTasks(group.tasks);
            const completedCount = group.tasks.filter(t => t.task_completed).length;
            const isFirstGroup = groupIdx === 0;

            return (
              <div
                key={group.phaseId}
                className={`phase-section border border-gray-200 rounded-xl overflow-hidden ${
                  groupIdx > 0 ? 'phase-page-break' : ''
                }`}
              >
                {/* Phase header */}
                <div className={`flex items-center justify-between px-5 py-3.5 bg-gray-50 border-b border-gray-200`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${colorClass}`} />
                    <h3 className="font-semibold text-gray-800 text-base">{group.phaseName}</h3>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      {group.parts.length > 0 && (
                        <span className="flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded-full">
                          <Package className="w-3 h-3" />
                          {group.parts.length} part{group.parts.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      {group.tasks.length > 0 && (
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${
                          completedCount === group.tasks.length && group.tasks.length > 0
                            ? 'bg-emerald-50 text-emerald-600'
                            : 'bg-gray-100'
                        }`}>
                          <ClipboardList className="w-3 h-3" />
                          {completedCount}/{group.tasks.length} done
                        </span>
                      )}
                      {group.totalLaborHours > 0 && (
                        <span className="flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded-full">
                          <Clock className="w-3 h-3" />
                          {group.totalLaborHours.toFixed(1)}h
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => togglePhase(group.phaseId)}
                    className="no-print w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform ${isPhaseExpanded(group.phaseId) ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                <div className={`${isPhaseExpanded(group.phaseId) ? 'hidden no-print' : ''}`}>
                  {/* Parts List */}
                  {group.parts.length > 0 && (
                    <div className="px-5 py-4 border-b border-gray-100 last:border-b-0">
                      <div className="flex items-center gap-2 mb-3">
                        <Package className="w-4 h-4 text-gray-400" />
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Parts & Materials</h4>
                      </div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                            <th className="pb-2 font-medium">Description</th>
                            <th className="pb-2 font-medium w-16 text-center">Qty</th>
                            <th className="pb-2 font-medium w-24">Unit</th>
                            <th className="pb-2 font-medium w-28 text-right hidden print:table-cell">SKU</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {group.parts.map(item => (
                            <tr key={item.id} className="group">
                              <td className="py-2 pr-4">
                                <div className="flex items-start gap-2">
                                  {item.parent_item_id && (
                                    <span className="text-gray-300 text-xs mt-0.5">↳</span>
                                  )}
                                  <div>
                                    <span className="text-gray-800">{item.description}</span>
                                    {item.task_notes && (
                                      <p className="text-xs text-gray-400 mt-0.5">{item.task_notes}</p>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="py-2 text-center text-gray-700 font-medium">{item.quantity}</td>
                              <td className="py-2 text-gray-500">{item.unit || 'ea'}</td>
                              <td className="py-2 text-right text-gray-400 text-xs hidden print:table-cell">
                                {item.products?.sku || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Tasks List */}
                  {group.tasks.length > 0 && (
                    <div className="px-5 py-4">
                      <div className="flex items-center gap-2 mb-3">
                        <ClipboardList className="w-4 h-4 text-gray-400" />
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tasks</h4>
                        {hideCompleted && group.tasks.length !== visibleTasks.length && (
                          <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                            {group.tasks.length - visibleTasks.length} hidden (completed)
                          </span>
                        )}
                      </div>

                      {visibleTasks.length === 0 && (
                        <div className="flex items-center gap-2 py-3 text-emerald-600 text-sm">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>All tasks in this phase are complete!</span>
                        </div>
                      )}

                      {visibleTasks.length > 0 && (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                              <th className="pb-2 font-medium w-8"></th>
                              <th className="pb-2 font-medium">Task / Item</th>
                              <th className="pb-2 font-medium w-48">Notes</th>
                              <th className="pb-2 font-medium w-20 text-right">Labor</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {visibleTasks.map(item => (
                              <tr
                                key={item.id}
                                className={`${item.task_completed ? 'opacity-50' : ''}`}
                              >
                                <td className="py-2 pr-2">
                                  {item.task_completed ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                  ) : (
                                    <Circle className="w-4 h-4 text-gray-300" />
                                  )}
                                </td>
                                <td className={`py-2 pr-4 ${item.task_completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                                  {item.description}
                                </td>
                                <td className="py-2 pr-4 text-gray-500 text-xs">
                                  {item.task_notes || '—'}
                                </td>
                                <td className="py-2 text-right text-gray-600 text-xs font-medium">
                                  {item.labor_hours ? `${item.labor_hours}h` : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  {group.parts.length === 0 && group.tasks.length === 0 && (
                    <div className="px-5 py-6 text-center text-gray-400 text-sm">
                      No parts or tasks in this phase.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer summary */}
        <div className="no-print border-t border-gray-100 bg-gray-50 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6 text-sm">
            <span className="text-gray-500">
              Showing{' '}
              <span className="font-medium text-gray-700">
                {filteredGroups.reduce((acc, g) => acc + filterTasks(g.tasks).length, 0)}
              </span>{' '}
              {hideCompleted ? 'open' : 'total'} tasks
            </span>
            {globalStats.completedTasks > 0 && (
              <span className="flex items-center gap-1.5 text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {globalStats.completedTasks} completed
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Clock className="w-3.5 h-3.5" />
            <span>
              {filteredGroups
                .reduce((acc, g) => acc + g.totalLaborHours, 0)
                .toFixed(1)}h labor across{' '}
              {filteredGroups.length} phase{filteredGroups.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
