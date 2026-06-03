import React from 'react';
import { DollarSign, FileText, AlertCircle, TrendingUp, Calendar, ChevronDown, ChevronUp, ListOrdered } from 'lucide-react';

interface PaymentScheduleItem {
  id?: string;
  name: string;
  type: 'deposit' | 'progress' | 'final';
  amount_type: 'percentage' | 'fixed';
  amount: number;
  due_timing: string;
}

interface BillingPhase {
  id?: string;
  phase_order: number;
  title: string;
  amount_type: 'percentage' | 'fixed';
  amount: number;
  notes?: string;
}

interface BillingConfigSummaryProps {
  depositType: 'percentage' | 'parts_total' | 'custom' | 'none';
  depositAmount: number;
  depositPercent: number;
  paymentTerms?: string;
  balancePaymentTerms?: string;
  acceptanceMethods?: string[];
  requireDeposit?: boolean;
  compact?: boolean;
  progressBillingType?: 'monthly' | 'completion' | 'none';
  progressInvoiceTerms?: 'net_10' | 'net_30' | 'net_45' | 'net_60' | 'due_on_receipt';
  paymentSchedule?: PaymentScheduleItem[];
  billingPhases?: BillingPhase[];
}

export default function BillingConfigSummary({
  depositType,
  depositAmount,
  depositPercent,
  paymentTerms = 'Net 30',
  balancePaymentTerms,
  acceptanceMethods = [],
  requireDeposit = true,
  compact = false,
  progressBillingType = 'none',
  progressInvoiceTerms = 'net_30',
  paymentSchedule = [],
  billingPhases = []
}: BillingConfigSummaryProps) {
  const [showSchedule, setShowSchedule] = React.useState(false);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);

  const getDepositText = () => {
    if (!requireDeposit || depositType === 'none') return 'No Deposit Required';
    if (depositType === 'custom') {
      return billingPhases.length > 0
        ? `Custom Schedule (${billingPhases.length} ${billingPhases.length === 1 ? 'entry' : 'entries'})`
        : 'Custom Payment Schedule';
    }
    switch (depositType) {
      case 'percentage': return `${depositPercent}% Deposit (${formatCurrency(depositAmount)})`;
      case 'parts_total': return `Parts Total Deposit (${formatCurrency(depositAmount)})`;
      default: return 'No Deposit';
    }
  };

  const getAcceptanceText = () => {
    const methods = acceptanceMethods || [];
    if (methods.length === 0) return 'No methods configured';
    return methods.map(m => {
      switch (m) {
        case 'payment': return 'Payment';
        case 'purchase_order': return 'PO';
        case 'verbal': return 'Verbal';
        default: return m;
      }
    }).join(' / ');
  };

  const getProgressBillingText = () => {
    if (progressBillingType === 'none') return 'One-Time Payment';
    if (progressBillingType === 'monthly') return 'Monthly Progress Billing';
    if (progressBillingType === 'completion') return 'Upon Completion Progress Billing';
    return 'Not Configured';
  };

  const getProgressInvoiceTermsText = () => {
    switch (progressInvoiceTerms) {
      case 'net_10': return 'Net 10';
      case 'net_30': return 'Net 30';
      case 'net_45': return 'Net 45';
      case 'net_60': return 'Net 60';
      case 'due_on_receipt': return 'Due on Receipt';
      default: return 'Net 30';
    }
  };

  const hasProgressBilling = progressBillingType && progressBillingType !== 'none';
  const hasPaymentSchedule = paymentSchedule && paymentSchedule.length > 0;
  const hasCustomPhases = depositType === 'custom' && billingPhases.length > 0;

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-700">
        <DollarSign className="w-4 h-4 text-gray-500" />
        <span className="font-medium">{getDepositText()}</span>
        <span className="text-gray-400">•</span>
        <FileText className="w-4 h-4 text-gray-500" />
        <span>{balancePaymentTerms || paymentTerms}</span>
        <span className="text-gray-400">•</span>
        <span>{getAcceptanceText()}</span>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-blue-50 to-sky-50 border border-blue-200 rounded-lg p-4 space-y-4">
      {/* Main Billing Configuration */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <DollarSign className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-blue-900 uppercase tracking-wide">Deposit</p>
            <p className="text-sm font-semibold text-gray-900 mt-1 truncate">{getDepositText()}</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-blue-900 uppercase tracking-wide">Balance Payment</p>
            <p className="text-sm font-semibold text-gray-900 mt-1 truncate">{balancePaymentTerms || paymentTerms}</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <AlertCircle className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-blue-900 uppercase tracking-wide">Acceptance</p>
            <p className="text-sm font-semibold text-gray-900 mt-1 truncate">{getAcceptanceText()}</p>
          </div>
        </div>
      </div>

      {/* Custom Billing Phases Preview */}
      {hasCustomPhases && (
        <div className="border-t border-blue-200 pt-4">
          <button
            type="button"
            onClick={() => setShowSchedule(!showSchedule)}
            className="w-full flex items-center justify-between text-left hover:bg-blue-100/50 rounded-lg px-3 py-2 transition-colors"
          >
            <div className="flex items-center gap-2">
              <ListOrdered className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-900">
                Billing Schedule ({billingPhases.length} {billingPhases.length !== 1 ? 'entries' : 'entry'})
              </span>
              <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full font-medium">
                Draft invoices on acceptance
              </span>
            </div>
            {showSchedule ? (
              <ChevronUp className="w-4 h-4 text-blue-600" />
            ) : (
              <ChevronDown className="w-4 h-4 text-blue-600" />
            )}
          </button>

          {showSchedule && (
            <div className="mt-3 space-y-2">
              {billingPhases
                .slice()
                .sort((a, b) => a.phase_order - b.phase_order)
                .map((phase, index) => (
                  <div
                    key={phase.id || index}
                    className="flex items-center justify-between px-3 py-2.5 bg-white border border-blue-200 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                        {index + 1}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{phase.title || `Entry ${index + 1}`}</p>
                        {phase.notes && (
                          <p className="text-xs text-gray-500">{phase.notes}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">
                        {phase.amount_type === 'percentage' ? `${phase.amount}%` : formatCurrency(phase.amount)}
                      </p>
                      <p className="text-xs text-gray-500 capitalize">{phase.amount_type}</p>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Standard Progress Billing Configuration */}
      {!hasCustomPhases && hasProgressBilling && (
        <div className="border-t border-blue-200 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-blue-900 uppercase tracking-wide">Progress Billing</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">{getProgressBillingText()}</p>
                <p className="text-xs text-gray-600 mt-1">
                  {progressBillingType === 'monthly' && 'Invoices created monthly as work progresses'}
                  {progressBillingType === 'completion' && 'Invoices created upon reaching milestones'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <Calendar className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-blue-900 uppercase tracking-wide">Progress Invoice Terms</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">{getProgressInvoiceTermsText()}</p>
                <p className="text-xs text-gray-600 mt-1">Payment terms for progress invoices</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Standard Payment Schedule Preview */}
      {!hasCustomPhases && hasPaymentSchedule && (
        <div className="border-t border-blue-200 pt-4">
          <button
            type="button"
            onClick={() => setShowSchedule(!showSchedule)}
            className="w-full flex items-center justify-between text-left hover:bg-blue-100/50 rounded-lg px-3 py-2 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-900">
                Payment Schedule ({paymentSchedule.length} payments)
              </span>
            </div>
            {showSchedule ? (
              <ChevronUp className="w-4 h-4 text-blue-600" />
            ) : (
              <ChevronDown className="w-4 h-4 text-blue-600" />
            )}
          </button>

          {showSchedule && (
            <div className="mt-3 space-y-2">
              {paymentSchedule.map((item, index) => (
                <div
                  key={item.id || index}
                  className="flex items-center justify-between px-3 py-2 bg-white border border-blue-200 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      item.type === 'deposit' ? 'bg-blue-500' :
                      item.type === 'progress' ? 'bg-emerald-500' :
                      'bg-gray-500'
                    }`} />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-600">{item.due_timing}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">
                      {item.amount_type === 'percentage' ? `${item.amount}%` : formatCurrency(item.amount)}
                    </p>
                    <p className="text-xs text-gray-500 capitalize">{item.type}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer indicator */}
      <div className="flex items-center justify-between pt-3 border-t border-blue-200">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full" />
          <p className="text-xs text-blue-700">Configured from Billing tab</p>
        </div>
        {(hasCustomPhases || hasProgressBilling || hasPaymentSchedule) && (
          <span className="px-2 py-1 text-xs bg-emerald-100 text-emerald-700 rounded-full font-medium">
            {hasCustomPhases ? 'Billing Schedule' : 'Advanced Billing'}
          </span>
        )}
      </div>
    </div>
  );
}
