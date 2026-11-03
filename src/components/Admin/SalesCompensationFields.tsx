export type SalesArrangement = 'none' | 'base_plus_commission' | 'commission_only';
export interface SalesCompensationValues {
  arrangement: SalesArrangement;
  baseAmount: string;
  baseFrequency: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
}
export const defaultSalesCompensation: SalesCompensationValues = {
  arrangement: 'none', baseAmount: '', baseFrequency: 'weekly',
};
export function validateSalesCompensation(value: SalesCompensationValues): string | null {
  if (value.arrangement !== 'base_plus_commission') return null;
  const amount = Number(value.baseAmount);
  if (!value.baseAmount.trim() || !Number.isFinite(amount) || amount <= 0 || !/^\d+(\.\d{1,2})?$/.test(value.baseAmount.trim()))
    return 'Enter a positive base amount with no more than two decimal places.';
  return null;
}
export function SalesCompensationFields({ value, onChange }: {
  value: SalesCompensationValues;
  onChange: (next: SalesCompensationValues) => void;
}) {
  const input = 'w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white';
  return <div className="rounded-lg border border-gray-600 bg-gray-800 p-4 space-y-3">
    <h3 className="font-semibold text-white">Sales Compensation</h3>
    <p className="text-xs text-gray-300">Base pay is additional to commissions, never an advance or draw. Commission rates and payment timing remain in Commission Management.</p>
    <label className="block text-sm text-gray-200">Compensation Arrangement
      <select className={input} value={value.arrangement} onChange={e => onChange({...value, arrangement: e.target.value as SalesArrangement})}>
        <option value="none">No sales commission arrangement</option>
        <option value="base_plus_commission">Base + Commission</option>
        <option value="commission_only">Commission Only</option>
      </select>
    </label>
    {value.arrangement === 'base_plus_commission' && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label className="block text-sm text-gray-200">Guaranteed Base Pay ($)
        <input className={input} inputMode="decimal" value={value.baseAmount} onChange={e => onChange({...value, baseAmount: e.target.value})} placeholder="500.00" />
      </label>
      <label className="block text-sm text-gray-200">Base Pay Frequency
        <select className={input} value={value.baseFrequency} onChange={e => onChange({...value, baseFrequency: e.target.value as SalesCompensationValues['baseFrequency']})}>
          <option value="weekly">Weekly</option><option value="biweekly">Biweekly</option><option value="semimonthly">Twice monthly</option><option value="monthly">Monthly</option>
        </select>
      </label>
    </div>}
    {value.arrangement !== 'none' && <p className="text-xs text-cyan-200">Set the commission percentage and eligibility in Commission Management. Commission calculations exclude applicable sales tax and credit card fees according to company policy.</p>}
    {validateSalesCompensation(value) && <p role="alert" className="text-sm text-red-300">{validateSalesCompensation(value)}</p>}
  </div>;
}
