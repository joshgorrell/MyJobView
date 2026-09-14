import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { getTaxApplicability, type TaxEnvironment, type TaxProjectType } from '../../lib/taxCalculations';

interface TaxRulesBadgeProps {
  taxEnvironment: string;
  taxProjectType: string;
  darkMode?: boolean;
  state?: string;
  reviewRequired?: boolean;
}

export function TaxRulesBadge({ taxEnvironment, taxProjectType, darkMode = false, state = 'KS', reviewRequired = false }: TaxRulesBadgeProps) {
  const taxInfo = getTaxApplicability(
    taxEnvironment as TaxEnvironment,
    taxProjectType as TaxProjectType,
    state
  );

  const containerCls = darkMode
    ? 'bg-gray-900 border border-gray-700 rounded-lg p-3'
    : 'bg-gray-50 border border-gray-200 rounded-lg p-3';

  const labelCls = darkMode ? 'text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2' : 'text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2';
  const textCls = darkMode ? 'text-sm font-medium text-gray-200' : 'text-sm font-medium text-gray-800';
  const explainCls = darkMode ? 'text-xs text-gray-400 italic mt-2' : 'text-xs text-gray-500 italic mt-2';

  return (
    <div className={containerCls}>
      <p className={labelCls}>Tax Rules</p>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          {taxInfo.partsTaxable ? (
            <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          )}
          <span className={textCls}>
            Parts/Materials: {taxInfo.partsTaxable ? 'Taxable' : 'Not Taxable'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {taxInfo.laborTaxable ? (
            <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          )}
          <span className={textCls}>
            Labor: {taxInfo.laborTaxable ? 'Taxable' : 'Not Taxable'}
          </span>
        </div>
      </div>
      {reviewRequired && (
        <div className="flex items-center gap-2 mt-2 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded-md">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span className="text-xs font-medium text-amber-800">Tax Review Required</span>
        </div>
      )}
      <p className={explainCls}>{taxInfo.explanation}</p>
    </div>
  );
}
