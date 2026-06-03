import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ProposalLineItem, ProposalRoom } from '../../lib/types';
import { X, Printer, PieChart, TrendingUp, Package, DollarSign } from 'lucide-react';

interface ClassSummaryReportProps {
  proposalId: string;
  rooms: (ProposalRoom & { line_items: ProposalLineItem[] })[];
  onClose: () => void;
}

interface ProposalClass {
  id: string;
  name: string;
  color: string;
}

interface ClassTotal {
  class: ProposalClass | null;
  items: ProposalLineItem[];
  total: number;
}

export default function ClassSummaryReport({ proposalId, rooms, onClose }: ClassSummaryReportProps) {
  const [classes, setClasses] = useState<ProposalClass[]>([]);
  const [classTotals, setClassTotals] = useState<ClassTotal[]>([]);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    loadClassesAndCalculate();
    // Trigger animation after mount
    setTimeout(() => setAnimate(true), 100);
  }, [rooms]);

  async function loadClassesAndCalculate() {
    try {
      const { data, error } = await supabase
        .from('proposal_classes')
        .select('id, name, color')
        .order('name');

      if (error) throw error;

      const classesData = data || [];
      setClasses(classesData);

      const allItems = rooms.flatMap(room => room.line_items);

      const totals: ClassTotal[] = [];

      classesData.forEach(cls => {
        const classItems = allItems.filter(item => item.class_id === cls.id);
        if (classItems.length > 0) {
          totals.push({
            class: cls,
            items: classItems,
            total: classItems.reduce((sum, item) => sum + item.line_total, 0)
          });
        }
      });

      const unclassifiedItems = allItems.filter(item => !item.class_id);
      if (unclassifiedItems.length > 0) {
        totals.push({
          class: null,
          items: unclassifiedItems,
          total: unclassifiedItems.reduce((sum, item) => sum + item.line_total, 0)
        });
      }

      setClassTotals(totals);
    } catch (error) {
      console.error('Error loading classes:', error);
    }
  }

  const grandTotal = classTotals.reduce((sum, ct) => sum + ct.total, 0);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <style>{`
        @keyframes slideInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes countUp {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes shimmer {
          0% {
            background-position: -1000px 0;
          }
          100% {
            background-position: 1000px 0;
          }
        }
        .animate-slide-up {
          animation: slideInUp 0.4s ease-out forwards;
        }
        .animate-count {
          animation: countUp 0.6s ease-out forwards;
        }
        @media print {
          body * {
            visibility: hidden;
          }
          .print-content, .print-content * {
            visibility: visible;
          }
          .print-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className={`bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden shadow-2xl border border-gray-700/50 print-content ${animate ? 'animate-slide-up' : 'opacity-0'}`}>
        {/* Premium Header with Gradient */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-600 p-6 flex items-center justify-between shadow-lg z-10">
          <div className="flex items-center gap-4">
            <div className="bg-white/20 backdrop-blur-sm p-3 rounded-xl">
              <PieChart className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Class Summary Report</h2>
              <p className="text-blue-100 text-sm">Breakdown by category</p>
            </div>
          </div>
          <div className="flex items-center gap-3 no-print">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white rounded-xl transition-all duration-200 hover:scale-105"
            >
              <Printer size={18} />
              <span className="font-medium">Print</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-white hover:bg-white/20 rounded-xl transition-all duration-200"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Stats Overview Bar */}
        <div className="bg-gradient-to-r from-gray-800/50 to-gray-900/50 backdrop-blur-sm px-6 py-4 border-b border-gray-700/50">
          <div className="grid grid-cols-3 gap-6">
            <div className="flex items-center gap-3">
              <div className="bg-blue-500/20 p-2 rounded-lg">
                <Package className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wide">Total Classes</div>
                <div className="text-xl font-bold text-white">{classTotals.length}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="bg-purple-500/20 p-2 rounded-lg">
                <TrendingUp className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wide">Total Items</div>
                <div className="text-xl font-bold text-white">
                  {classTotals.reduce((sum, ct) => sum + ct.items.length, 0)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="bg-green-500/20 p-2 rounded-lg">
                <DollarSign className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wide">Grand Total</div>
                <div className="text-xl font-bold text-green-400">
                  ${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-180px)] p-6 space-y-6">
          {classTotals.map((ct, index) => {
            const percentage = grandTotal > 0 ? (ct.total / grandTotal) * 100 : 0;
            const classColor = ct.class?.color || '#6B7280';

            return (
              <div
                key={ct.class?.id || 'unclassified'}
                className="group hover:scale-[1.01] transition-transform duration-300"
                style={{
                  animationDelay: `${index * 0.1}s`,
                  animation: animate ? 'slideInUp 0.5s ease-out forwards' : 'none',
                  opacity: animate ? 1 : 0
                }}
              >
                {/* Class Card with Gradient Border */}
                <div
                  className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl overflow-hidden shadow-xl border"
                  style={{
                    borderColor: `${classColor}40`,
                    boxShadow: `0 4px 24px ${classColor}15, 0 0 0 1px ${classColor}20`
                  }}
                >
                  {/* Class Header with Visual Indicator */}
                  <div
                    className="relative p-6"
                    style={{
                      background: `linear-gradient(135deg, ${classColor}18 0%, ${classColor}08 100%)`,
                    }}
                  >
                    {/* Decorative Corner Element */}
                    <div
                      className="absolute top-0 right-0 w-32 h-32 opacity-10"
                      style={{
                        background: `radial-gradient(circle at top right, ${classColor} 0%, transparent 70%)`
                      }}
                    />

                    <div className="relative flex items-start justify-between">
                      <div className="flex items-start gap-4 flex-1">
                        {/* Class Badge */}
                        <div
                          className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white shadow-lg"
                          style={{
                            backgroundColor: classColor,
                            boxShadow: `0 4px 12px ${classColor}40`
                          }}
                        >
                          {(ct.class?.name || 'U').charAt(0).toUpperCase()}
                        </div>

                        <div className="flex-1">
                          <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-3">
                            {ct.class?.name || 'Unclassified'}
                            <span className="text-xs px-3 py-1 bg-white/10 backdrop-blur-sm rounded-full text-gray-300 font-normal">
                              {ct.items.length} item{ct.items.length !== 1 ? 's' : ''}
                            </span>
                          </h3>

                          {/* Progress Bar */}
                          <div className="mt-3">
                            <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
                              <span>Contribution to Total</span>
                              <span className="font-semibold">{percentage.toFixed(1)}%</span>
                            </div>
                            <div className="h-2 bg-gray-700/50 rounded-full overflow-hidden backdrop-blur-sm">
                              <div
                                className="h-full rounded-full transition-all duration-1000 ease-out"
                                style={{
                                  width: animate ? `${percentage}%` : '0%',
                                  background: `linear-gradient(90deg, ${classColor} 0%, ${classColor}CC 100%)`,
                                  boxShadow: `0 0 10px ${classColor}60`
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Class Total */}
                      <div className="text-right ml-6">
                        <div className="text-sm text-gray-400 mb-1">Class Total</div>
                        <div
                          className="text-3xl font-bold animate-count"
                          style={{ color: classColor }}
                        >
                          ${ct.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Items Table */}
                  <div className="p-6 pt-4">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-700">
                            <th className="text-left py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                              Description
                            </th>
                            <th className="text-right py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider w-24">
                              Quantity
                            </th>
                            <th className="text-right py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider w-28">
                              Unit Price
                            </th>
                            <th className="text-right py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider w-32">
                              Line Total
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {ct.items.map((item, itemIndex) => (
                            <tr
                              key={item.id}
                              className="border-b border-gray-800/50 hover:bg-white/5 transition-colors"
                            >
                              <td className="py-3 text-sm text-gray-200">
                                {item.description}
                              </td>
                              <td className="py-3 text-sm text-right text-gray-400">
                                {item.quantity} {item.unit}
                              </td>
                              <td className="py-3 text-sm text-right text-gray-400">
                                ${item.unit_price.toFixed(2)}
                              </td>
                              <td className="py-3 text-sm text-right font-semibold text-white">
                                ${item.line_total.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Grand Total Card */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 p-8 shadow-2xl">
            {/* Decorative Background Pattern */}
            <div className="absolute inset-0 opacity-10">
              <div className="absolute inset-0" style={{
                backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
                backgroundSize: '32px 32px'
              }} />
            </div>

            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-white/20 backdrop-blur-sm p-4 rounded-2xl">
                  <DollarSign className="w-8 h-8 text-white" />
                </div>
                <div>
                  <div className="text-emerald-100 text-sm font-medium uppercase tracking-wide mb-1">
                    Proposal Grand Total
                  </div>
                  <div className="text-4xl font-bold text-white animate-count">
                    ${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-emerald-100 text-sm mb-2">
                  {classTotals.length} {classTotals.length === 1 ? 'Category' : 'Categories'}
                </div>
                <div className="text-emerald-100 text-sm">
                  {classTotals.reduce((sum, ct) => sum + ct.items.length, 0)} Total Items
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
