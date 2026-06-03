import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { X, FileText, CheckCircle, XCircle, Info, DollarSign, Printer, TrendingUp, Package, BarChart3 } from 'lucide-react';
import { getTaxApplicability, TaxEnvironment, TaxProjectType } from '../../lib/taxCalculations';

interface ProposalTaxReportProps {
  proposalId: string;
  onClose: () => void;
}

interface LineItemWithTax {
  id: string;
  room_name: string;
  description: string;
  item_type: 'part' | 'labor';
  quantity: number;
  unit_price: number;
  labor_hours: number | null;
  labor_rate: number | null;
  parts_total: number;
  labor_total: number;
  parts_taxable: boolean;
  labor_taxable: boolean;
  parts_tax: number;
  labor_tax: number;
  total_tax: number;
}

export default function ProposalTaxReport({ proposalId, onClose }: ProposalTaxReportProps) {
  const [loading, setLoading] = useState(true);
  const [lineItems, setLineItems] = useState<LineItemWithTax[]>([]);
  const [proposal, setProposal] = useState<any>(null);
  const [taxRate, setTaxRate] = useState(0);
  const [taxInfo, setTaxInfo] = useState<any>(null);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    loadData();
    setTimeout(() => setAnimate(true), 100);
  }, [proposalId]);

  async function loadData() {
    try {
      setLoading(true);

      const { data: proposalData, error: proposalError } = await supabase
        .from('proposals')
        .select('*, contacts:contacts!proposals_contact_id_fkey(zip_code)')
        .eq('id', proposalId)
        .maybeSingle();

      if (proposalError) throw proposalError;
      setProposal(proposalData);

      let currentTaxRate = 0;
      if (proposalData?.contacts?.zip_code) {
        const { data: taxRateData } = await supabase
          .from('tax_jurisdictions')
          .select('combined_rate')
          .eq('zip_code', proposalData.contacts.zip_code)
          .eq('is_active', true)
          .order('effective_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (taxRateData) {
          currentTaxRate = taxRateData.combined_rate;
        }
      }

      if (currentTaxRate === 0) {
        const { data: defaultRate } = await supabase
          .from('tax_jurisdictions')
          .select('combined_rate')
          .eq('is_default', true)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();

        if (defaultRate) {
          currentTaxRate = defaultRate.combined_rate;
        }
      }

      setTaxRate(currentTaxRate);

      const taxEnvironment = (proposalData?.tax_environment || 'residential') as TaxEnvironment;
      const taxProjectType = (proposalData?.tax_project_type || 'general_installation_repair') as TaxProjectType;
      const applicability = getTaxApplicability(taxEnvironment, taxProjectType);
      setTaxInfo(applicability);

      const { data: settingsData } = await supabase
        .from('proposal_settings')
        .select('*')
        .eq('proposal_id', proposalId)
        .maybeSingle();

      let discountPercent = settingsData?.discount_percent || 0;
      let projectMgmtPercent = settingsData?.project_management_percent || 0;
      let projectDesignPercent = settingsData?.project_design_percent || 0;
      const systemDesignPercent = settingsData?.system_design_percent || 0;
      const creditCardFeePercent = settingsData?.credit_card_fee_percent || 0;
      const miscPartsPercent = settingsData?.misc_parts_percent || 0;
      const customMod1Percent = settingsData?.custom_modifier_1_percent || 0;
      const customMod2Percent = settingsData?.custom_modifier_2_percent || 0;

      if (proposalData?.discount_percent != null && proposalData.discount_percent > 0) {
        discountPercent = proposalData.discount_percent;
      }
      if (proposalData?.project_management_percent != null && proposalData.project_management_percent > 0) {
        projectMgmtPercent = proposalData.project_management_percent;
      }
      if (proposalData?.project_design_percent != null && proposalData.project_design_percent > 0) {
        projectDesignPercent = proposalData.project_design_percent;
      }

      const netModifierPercent =
        -discountPercent +
        projectMgmtPercent +
        projectDesignPercent +
        systemDesignPercent +
        creditCardFeePercent +
        miscPartsPercent +
        customMod1Percent +
        customMod2Percent;

      const { data: itemsData, error: itemsError } = await supabase
        .from('proposal_line_items')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('created_at');

      if (itemsError) throw itemsError;

      const { data: roomsData } = await supabase
        .from('proposal_rooms')
        .select('id, name')
        .eq('proposal_id', proposalId);

      const roomsMap = new Map(roomsData?.map(r => [r.id, r.name]) || []);

      const itemsWithTax = (itemsData || []).map((item: any) => {
        const partsTaxable = applicability.partsTaxable;
        const laborTaxable = applicability.laborTaxable;

        const lineTotal = item.line_total || 0;

        let partsTotal, laborTotal;
        if (item.item_type === 'labor') {
          partsTotal = 0;
          laborTotal = item.labor_total || lineTotal;
        } else {
          partsTotal = lineTotal;
          laborTotal = item.labor_total || 0;
        }

        const modifiedParts = partsTotal * (1 + netModifierPercent / 100);
        const modifiedLabor = laborTotal * (1 + netModifierPercent / 100);

        const partsTax = partsTaxable ? modifiedParts * currentTaxRate : 0;
        const laborTax = laborTaxable ? modifiedLabor * currentTaxRate : 0;

        return {
          id: item.id,
          room_name: roomsMap.get(item.room_id) || 'Unassigned',
          description: item.description,
          item_type: item.item_type || 'part',
          quantity: item.quantity,
          unit_price: item.unit_price,
          labor_hours: item.labor_hours,
          labor_rate: item.labor_rate,
          parts_total: modifiedParts,
          labor_total: modifiedLabor,
          parts_taxable: partsTaxable,
          labor_taxable: laborTaxable,
          parts_tax: partsTax,
          labor_tax: laborTax,
          total_tax: partsTax + laborTax
        };
      });

      setLineItems(itemsWithTax);
    } catch (error: any) {
      console.error('Error loading tax report:', error);
      alert(`Failed to load tax report: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const handlePrint = () => {
    window.print();
  };

  const totalPartsTax = lineItems.reduce((sum, item) => sum + item.parts_tax, 0);
  const totalLaborTax = lineItems.reduce((sum, item) => sum + item.labor_tax, 0);
  const grandTotalTax = totalPartsTax + totalLaborTax;

  const totalParts = lineItems.reduce((sum, item) => sum + item.parts_total, 0);
  const totalLabor = lineItems.reduce((sum, item) => sum + item.labor_total, 0);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
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
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
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
          .print-header {
            background: linear-gradient(to right, #059669, #0d9488) !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-info-box {
            background: linear-gradient(to right, #dbeafe, #cffafe) !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          table {
            page-break-inside: auto;
          }
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          thead {
            display: table-header-group;
          }
          tfoot {
            display: table-footer-group;
          }
        }
      `}</style>

      <div className={`bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-7xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col border-2 border-gray-700/70 print-content ${animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'} transition-all duration-500`}>

        {/* Header - Responsive */}
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 px-3 sm:px-6 py-3 sm:py-5 flex items-center justify-between flex-shrink-0 print-header shadow-lg">
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="bg-white/20 backdrop-blur-sm p-2 sm:p-3 rounded-lg sm:rounded-xl">
              <FileText className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg sm:text-2xl font-bold text-white">Sales Tax Report</h2>
              <p className="text-xs sm:text-sm text-emerald-100 hidden sm:block">Detailed taxability breakdown</p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 no-print">
            <button
              onClick={handlePrint}
              className="hidden sm:flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white rounded-lg sm:rounded-xl transition-all duration-200 hover:scale-105"
            >
              <Printer className="w-4 h-4" />
              <span className="font-medium text-sm">Print</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-white hover:bg-white/20 rounded-lg sm:rounded-xl transition-all duration-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-4"></div>
                <p className="text-gray-400 text-sm sm:text-base">Loading tax report...</p>
              </div>
            </div>
          ) : (
            <>
              {/* Tax Configuration - Responsive Grid */}
              <div className="px-3 sm:px-6 py-2 sm:py-3 bg-gradient-to-br from-blue-900/30 via-cyan-900/30 to-teal-900/30 border-b-2 border-gray-700/70 flex-shrink-0 max-h-[25vh] overflow-y-auto print-info-box">
                <div className="flex items-start gap-2 sm:gap-4 mb-2">
                  <div className="bg-blue-500/30 p-1.5 sm:p-2 rounded-lg flex-shrink-0">
                    <Info className="w-4 h-4 sm:w-5 sm:h-5 text-blue-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xs sm:text-sm font-bold text-white mb-2 uppercase tracking-wide">Tax Configuration</h3>

                    {/* Responsive Grid - Stacks on mobile */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-2">
                      <div className="bg-gray-800/60 backdrop-blur-sm rounded-lg p-2 border border-gray-700/70">
                        <span className="text-xs text-gray-400 uppercase tracking-wide block mb-0.5">Environment</span>
                        <span className="text-sm font-semibold text-white capitalize">
                          {proposal?.tax_environment || 'Residential'}
                        </span>
                      </div>
                      <div className="bg-gray-800/60 backdrop-blur-sm rounded-lg p-2 border border-gray-700/70">
                        <span className="text-xs text-gray-400 uppercase tracking-wide block mb-0.5">Project Type</span>
                        <span className="text-sm font-semibold text-white break-words">
                          {(proposal?.tax_project_type || 'general_installation_repair')
                            .replace(/_/g, ' ')
                            .split(' ')
                            .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                            .join(' ')}
                        </span>
                      </div>
                      <div className="bg-gradient-to-br from-emerald-500/30 to-teal-500/30 backdrop-blur-sm rounded-lg p-2 border-2 border-emerald-500/50 sm:col-span-2 lg:col-span-1">
                        <span className="text-xs text-emerald-200 uppercase tracking-wide block mb-0.5">Tax Rate</span>
                        <span className="text-lg sm:text-xl font-bold text-emerald-300">{(taxRate * 100).toFixed(3)}%</span>
                      </div>
                    </div>

                    {taxInfo && (
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-700/70">
                        <div className="flex items-center gap-2 bg-gray-800/60 backdrop-blur-sm rounded-lg p-2">
                          {taxInfo.partsTaxable ? (
                            <div className="bg-green-500/30 p-1 rounded-lg flex-shrink-0">
                              <CheckCircle className="w-3.5 h-3.5 text-green-300" />
                            </div>
                          ) : (
                            <div className="bg-red-500/30 p-1 rounded-lg flex-shrink-0">
                              <XCircle className="w-3.5 h-3.5 text-red-300" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <span className="text-xs text-gray-400 block">Materials</span>
                            <span className="text-xs font-semibold text-white">
                              {taxInfo.partsTaxable ? 'Taxable' : 'Not Taxable'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 bg-gray-800/60 backdrop-blur-sm rounded-lg p-2">
                          {taxInfo.laborTaxable ? (
                            <div className="bg-green-500/30 p-1 rounded-lg flex-shrink-0">
                              <CheckCircle className="w-3.5 h-3.5 text-green-300" />
                            </div>
                          ) : (
                            <div className="bg-red-500/30 p-1 rounded-lg flex-shrink-0">
                              <XCircle className="w-3.5 h-3.5 text-red-300" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <span className="text-xs text-gray-400 block">Labor</span>
                            <span className="text-xs font-semibold text-white">
                              {taxInfo.laborTaxable ? 'Taxable' : 'Not Taxable'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {taxInfo && (
                      <div className="mt-2 p-2 bg-blue-500/20 border border-blue-500/30 rounded-lg">
                        <p className="text-xs text-blue-200 italic leading-snug">{taxInfo.explanation}</p>
                        <p className="text-xs text-blue-300 mt-1 font-medium">
                          Note: Amounts include modifiers. Tax calculated on final amounts.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Scrollable Table Container */}
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
                <div className="min-w-[900px]">
                  <table className="w-full">
                    <thead className="bg-gray-800/90 backdrop-blur-sm sticky top-0 z-10">
                      <tr>
                        <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs sm:text-sm font-bold text-gray-200 uppercase tracking-wider">Area</th>
                        <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs sm:text-sm font-bold text-gray-200 uppercase tracking-wider">Description</th>
                        <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs sm:text-sm font-bold text-gray-200 uppercase tracking-wider">Type</th>
                        <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs sm:text-sm font-bold text-gray-200 uppercase tracking-wider">Materials</th>
                        <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs sm:text-sm font-bold text-gray-200 uppercase tracking-wider w-10 sm:w-12">Tax?</th>
                        <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs sm:text-sm font-bold text-emerald-300 uppercase tracking-wider">Mat. Tax</th>
                        <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs sm:text-sm font-bold text-gray-200 uppercase tracking-wider">Labor</th>
                        <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs sm:text-sm font-bold text-gray-200 uppercase tracking-wider w-10 sm:w-12">Tax?</th>
                        <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs sm:text-sm font-bold text-emerald-300 uppercase tracking-wider">Labor Tax</th>
                        <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs sm:text-sm font-bold text-cyan-300 uppercase tracking-wider">Total Tax</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                      {lineItems.map((item, index) => (
                        <tr
                          key={item.id}
                          className="hover:bg-gray-800/40 transition-colors"
                          style={{
                            animation: animate ? `fadeIn 0.4s ease-out ${index * 0.05}s both` : 'none'
                          }}
                        >
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-200 whitespace-nowrap">{item.room_name}</td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-100 max-w-[200px] sm:max-w-xs truncate" title={item.description}>
                            {item.description}
                          </td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                            <span className={`inline-flex px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg text-xs font-semibold ${
                              item.item_type === 'labor'
                                ? 'bg-orange-500/30 text-orange-200 border border-orange-500/40'
                                : 'bg-blue-500/30 text-blue-200 border border-blue-500/40'
                            }`}>
                              {item.item_type === 'labor' ? 'Labor' : 'Material'}
                            </span>
                          </td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-right text-white whitespace-nowrap font-semibold">
                            {formatCurrency(item.parts_total)}
                          </td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                            {item.parts_taxable ? (
                              <div className="bg-green-500/30 p-1 rounded-lg inline-block">
                                <CheckCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-green-300" />
                              </div>
                            ) : (
                              <div className="bg-gray-700/60 p-1 rounded-lg inline-block">
                                <XCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-500" />
                              </div>
                            )}
                          </td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-right text-emerald-300 font-bold whitespace-nowrap">
                            {formatCurrency(item.parts_tax)}
                          </td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-right text-white whitespace-nowrap font-semibold">
                            {formatCurrency(item.labor_total)}
                          </td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                            {item.labor_taxable ? (
                              <div className="bg-green-500/30 p-1 rounded-lg inline-block">
                                <CheckCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-green-300" />
                              </div>
                            ) : (
                              <div className="bg-gray-700/60 p-1 rounded-lg inline-block">
                                <XCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-500" />
                              </div>
                            )}
                          </td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-right text-emerald-300 font-bold whitespace-nowrap">
                            {formatCurrency(item.labor_tax)}
                          </td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-right text-cyan-300 font-bold whitespace-nowrap">
                            {formatCurrency(item.total_tax)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gradient-to-r from-gray-800 to-gray-900 border-t-2 border-cyan-500/60 sticky bottom-0">
                      <tr className="font-bold">
                        <td colSpan={3} className="px-2 sm:px-4 py-3 sm:py-4 text-right text-xs sm:text-sm text-white uppercase tracking-wide">
                          Totals:
                        </td>
                        <td className="px-2 sm:px-4 py-3 sm:py-4 text-xs sm:text-sm text-right text-white whitespace-nowrap font-bold">
                          {formatCurrency(totalParts)}
                        </td>
                        <td className="px-2 sm:px-4 py-3 sm:py-4"></td>
                        <td className="px-2 sm:px-4 py-3 sm:py-4 text-sm sm:text-base text-right text-emerald-300 font-bold whitespace-nowrap">
                          {formatCurrency(totalPartsTax)}
                        </td>
                        <td className="px-2 sm:px-4 py-3 sm:py-4 text-xs sm:text-sm text-right text-white whitespace-nowrap font-bold">
                          {formatCurrency(totalLabor)}
                        </td>
                        <td className="px-2 sm:px-4 py-3 sm:py-4"></td>
                        <td className="px-2 sm:px-4 py-3 sm:py-4 text-sm sm:text-base text-right text-emerald-300 font-bold whitespace-nowrap">
                          {formatCurrency(totalLaborTax)}
                        </td>
                        <td className="px-2 sm:px-4 py-3 sm:py-4 text-base sm:text-xl text-right text-cyan-300 font-bold whitespace-nowrap">
                          {formatCurrency(grandTotalTax)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Summary Footer - Responsive Layout */}
              <div className="px-3 sm:px-6 py-3 sm:py-4 bg-gradient-to-r from-gray-900/95 to-gray-800/95 backdrop-blur-sm border-t-2 border-gray-700/70 flex-shrink-0">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
                  <div className="flex items-center gap-2 text-gray-400">
                    <BarChart3 className="w-4 h-4" />
                    <span className="text-xs sm:text-sm">
                      <span className="font-semibold text-white">{lineItems.length}</span> line items
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
                    <div className="flex-1 sm:flex-initial text-center bg-gradient-to-br from-cyan-500/20 to-blue-500/20 px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl border border-cyan-500/30">
                      <div className="text-xs text-cyan-200 uppercase font-bold tracking-wide flex items-center justify-center gap-1">
                        <Package className="w-3 h-3" />
                        Materials
                      </div>
                      <div className="text-base sm:text-lg font-bold text-cyan-300">{formatCurrency(totalPartsTax)}</div>
                    </div>
                    <div className="flex-1 sm:flex-initial text-center bg-gradient-to-br from-orange-500/20 to-red-500/20 px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl border border-orange-500/30">
                      <div className="text-xs text-orange-200 uppercase font-bold tracking-wide flex items-center justify-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        Labor
                      </div>
                      <div className="text-base sm:text-lg font-bold text-orange-300">{formatCurrency(totalLaborTax)}</div>
                    </div>
                    <div className="w-full sm:w-auto text-center bg-gradient-to-br from-emerald-500/30 to-teal-500/30 px-4 sm:px-5 py-2 rounded-lg sm:rounded-xl border-2 border-emerald-500/50 shadow-lg">
                      <div className="text-xs sm:text-sm text-emerald-200 uppercase font-bold tracking-wide flex items-center justify-center gap-1">
                        <DollarSign className="w-3 h-3 sm:w-4 sm:h-4" />
                        Total Sales Tax
                      </div>
                      <div className="text-xl sm:text-2xl font-bold text-emerald-300">{formatCurrency(grandTotalTax)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
