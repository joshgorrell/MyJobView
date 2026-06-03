import { useState } from 'react';
import { X, DollarSign, AlertCircle, Save } from 'lucide-react';
import { applyBonusOverride } from '../../lib/testTunePermissions';

interface AdminBonusOverrideModalProps {
  projectId: string;
  projectNumber: string;
  customerName: string;
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  currentBonus: number;
  onClose: () => void;
  onSuccess: () => void;
}

export function AdminBonusOverrideModal({
  projectId,
  projectNumber,
  customerName,
  employeeId,
  employeeName,
  employeeRole,
  currentBonus,
  onClose,
  onSuccess
}: AdminBonusOverrideModalProps) {
  const [overrideAmount, setOverrideAmount] = useState<string>(currentBonus.toFixed(2));
  const [reason, setReason] = useState<string>('');
  const [adminNotes, setAdminNotes] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adjustmentAmount = parseFloat(overrideAmount || '0') - currentBonus;
  const adjustmentType = adjustmentAmount > 0 ? 'increase' : adjustmentAmount < 0 ? 'decrease' : 'no change';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!reason.trim()) {
      setError('Please provide a reason for the override');
      return;
    }

    const amount = parseFloat(overrideAmount);
    if (isNaN(amount) || amount < 0) {
      setError('Please enter a valid bonus amount');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await applyBonusOverride(
        projectId,
        employeeId,
        amount,
        reason,
        adminNotes || undefined
      );

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error applying bonus override:', err);
      setError(err.message || 'Failed to apply bonus override');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DollarSign className="w-6 h-6" />
              <div>
                <h2 className="text-xl font-bold">Bonus Override</h2>
                <p className="text-sm text-blue-100">Administrative Adjustment</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Project Info */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Project:</span>
                <span className="ml-2 font-medium text-gray-900">#{projectNumber}</span>
              </div>
              <div>
                <span className="text-gray-600">Customer:</span>
                <span className="ml-2 font-medium text-gray-900">{customerName}</span>
              </div>
              <div>
                <span className="text-gray-600">Employee:</span>
                <span className="ml-2 font-medium text-gray-900">{employeeName}</span>
              </div>
              <div>
                <span className="text-gray-600">Role:</span>
                <span className="ml-2 font-medium text-gray-900">{employeeRole}</span>
              </div>
            </div>
          </div>

          {/* Current vs New Bonus */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
              <label className="block text-sm font-medium text-blue-900 mb-2">
                Current Projected Bonus
              </label>
              <div className="text-3xl font-bold text-blue-600">
                ${currentBonus.toFixed(2)}
              </div>
            </div>

            <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
              <label className="block text-sm font-medium text-green-900 mb-2">
                New Bonus Amount
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-lg">$</span>
                <input
                  type="number"
                  value={overrideAmount}
                  onChange={(e) => setOverrideAmount(e.target.value)}
                  step="0.01"
                  min="0"
                  required
                  className="w-full pl-8 pr-3 py-2 text-2xl font-bold text-green-600 border-2 border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          {/* Adjustment Amount */}
          {adjustmentType !== 'no change' && (
            <div className={`p-4 rounded-lg border-2 ${
              adjustmentType === 'increase'
                ? 'bg-green-50 border-green-200'
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className={`w-5 h-5 ${
                  adjustmentType === 'increase' ? 'text-green-600' : 'text-red-600'
                }`} />
                <span className={`font-medium ${
                  adjustmentType === 'increase' ? 'text-green-900' : 'text-red-900'
                }`}>
                  Adjustment: {adjustmentType === 'increase' ? '+' : ''}${adjustmentAmount.toFixed(2)}
                </span>
              </div>
              <p className={`text-sm ${
                adjustmentType === 'increase' ? 'text-green-700' : 'text-red-700'
              }`}>
                This will {adjustmentType === 'increase' ? 'increase' : 'decrease'} the employee's bonus by $
                {Math.abs(adjustmentAmount).toFixed(2)}
              </p>
            </div>
          )}

          {/* Reason (Required) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reason for Override <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              rows={3}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter the reason for this bonus adjustment..."
            />
            <p className="mt-1 text-xs text-gray-500">
              This reason will be visible in the audit trail and to the employee
            </p>
          </div>

          {/* Admin Notes (Optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Internal Admin Notes (Optional)
            </label>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Add any internal notes (not visible to employee)..."
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-700">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm font-medium">{error}</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !reason.trim() || adjustmentType === 'no change'}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Applying Override...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Apply Override
                </>
              )}
            </button>
          </div>

          {/* Warning */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <p className="font-medium mb-1">Important</p>
                <p>This override will be immediately visible to the employee and recorded in the permanent audit trail. All bonus adjustments require a clear business justification.</p>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
