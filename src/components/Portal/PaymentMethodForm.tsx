import { useState } from 'react';
import { CreditCard, Building2, AlertCircle, Check, X } from 'lucide-react';

interface PaymentMethodFormProps {
  onSubmit: (paymentData: PaymentFormData) => Promise<void>;
  onCancel: () => void;
  amount: number;
}

export interface PaymentFormData {
  paymentType: 'card' | 'ach';
  cardNumber?: string;
  cardExpMonth?: string;
  cardExpYear?: string;
  cardCvv?: string;
  cardName?: string;
  achRouting?: string;
  achAccount?: string;
  achAccountType?: 'checking' | 'savings';
  achAccountName?: string;
}

export function PaymentMethodForm({ onSubmit, onCancel, amount }: PaymentMethodFormProps) {
  const [paymentType, setPaymentType] = useState<'card' | 'ach'>('card');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState<PaymentFormData>({
    paymentType: 'card',
    cardNumber: '',
    cardExpMonth: '',
    cardExpYear: '',
    cardCvv: '',
    cardName: '',
    achRouting: '',
    achAccount: '',
    achAccountType: 'checking',
    achAccountName: '',
  });

  const convenienceFee = paymentType === 'card' ? amount * 0.03 : 0;
  const totalAmount = amount + convenienceFee;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await onSubmit({ ...formData, paymentType });
    } catch (err: any) {
      setError(err.message || 'Payment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Payment Method
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setPaymentType('card')}
            className={`p-4 rounded-lg border-2 transition-all flex flex-col items-center text-center min-h-[88px] justify-center ${
              paymentType === 'card'
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 bg-white hover:border-blue-300'
            }`}
          >
            <CreditCard className={`w-6 h-6 mb-2 ${
              paymentType === 'card' ? 'text-blue-600' : 'text-gray-500'
            }`} />
            <div className="text-sm font-medium text-gray-900">Credit Card</div>
            <div className="text-xs text-gray-600 mt-0.5">+3% fee</div>
          </button>

          <button
            type="button"
            onClick={() => setPaymentType('ach')}
            className={`p-4 rounded-lg border-2 transition-all flex flex-col items-center text-center min-h-[88px] justify-center ${
              paymentType === 'ach'
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 bg-white hover:border-blue-300'
            }`}
          >
            <Building2 className={`w-6 h-6 mb-2 ${
              paymentType === 'ach' ? 'text-blue-600' : 'text-gray-500'
            }`} />
            <div className="text-sm font-medium text-gray-900">Bank Account</div>
            <div className="text-xs text-gray-600 mt-0.5">No fee</div>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-300 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {paymentType === 'card' && (
        <div className="space-y-4">
          <div>
            <label htmlFor="cardName" className="block text-sm font-medium text-gray-700 mb-2">
              Cardholder Name *
            </label>
            <input
              id="cardName"
              type="text"
              value={formData.cardName}
              onChange={(e) => setFormData({ ...formData, cardName: e.target.value })}
              required
              className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="John Doe"
            />
          </div>

          <div>
            <label htmlFor="cardNumber" className="block text-sm font-medium text-gray-700 mb-2">
              Card Number *
            </label>
            <input
              id="cardNumber"
              type="text"
              value={formData.cardNumber}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '').slice(0, 16);
                setFormData({ ...formData, cardNumber: value });
              }}
              required
              className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="1234 5678 9012 3456"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="expMonth" className="block text-sm font-medium text-gray-700 mb-2">
                Month *
              </label>
              <input
                id="expMonth"
                type="text"
                value={formData.cardExpMonth}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 2);
                  setFormData({ ...formData, cardExpMonth: value });
                }}
                required
                className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="MM"
              />
            </div>
            <div>
              <label htmlFor="expYear" className="block text-sm font-medium text-gray-700 mb-2">
                Year *
              </label>
              <input
                id="expYear"
                type="text"
                value={formData.cardExpYear}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setFormData({ ...formData, cardExpYear: value });
                }}
                required
                className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="YYYY"
              />
            </div>
            <div>
              <label htmlFor="cvv" className="block text-sm font-medium text-gray-700 mb-2">
                CVV *
              </label>
              <input
                id="cvv"
                type="text"
                value={formData.cardCvv}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setFormData({ ...formData, cardCvv: value });
                }}
                required
                className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="123"
              />
            </div>
          </div>
        </div>
      )}

      {paymentType === 'ach' && (
        <div className="space-y-4">
          <div>
            <label htmlFor="achAccountName" className="block text-sm font-medium text-gray-700 mb-2">
              Account Holder Name *
            </label>
            <input
              id="achAccountName"
              type="text"
              value={formData.achAccountName}
              onChange={(e) => setFormData({ ...formData, achAccountName: e.target.value })}
              required
              className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="John Doe"
            />
          </div>

          <div>
            <label htmlFor="achRouting" className="block text-sm font-medium text-gray-700 mb-2">
              Routing Number *
            </label>
            <input
              id="achRouting"
              type="text"
              value={formData.achRouting}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '').slice(0, 9);
                setFormData({ ...formData, achRouting: value });
              }}
              required
              className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="123456789"
            />
          </div>

          <div>
            <label htmlFor="achAccount" className="block text-sm font-medium text-gray-700 mb-2">
              Account Number *
            </label>
            <input
              id="achAccount"
              type="text"
              value={formData.achAccount}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '').slice(0, 17);
                setFormData({ ...formData, achAccount: value });
              }}
              required
              className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="1234567890"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Account Type *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, achAccountType: 'checking' })}
                className={`p-3 rounded-lg border-2 transition-all text-sm font-medium min-h-[48px] ${
                  formData.achAccountType === 'checking'
                    ? 'border-blue-500 bg-blue-50 text-gray-900'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-blue-300'
                }`}
              >
                Checking
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, achAccountType: 'savings' })}
                className={`p-3 rounded-lg border-2 transition-all text-sm font-medium min-h-[48px] ${
                  formData.achAccountType === 'savings'
                    ? 'border-blue-500 bg-blue-50 text-gray-900'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-blue-300'
                }`}
              >
                Savings
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-gray-700">
            <span>Subscription Amount</span>
            <span>${amount.toFixed(2)}</span>
          </div>
          {convenienceFee > 0 && (
            <div className="flex justify-between text-gray-700">
              <span>Convenience Fee (3%)</span>
              <span>${convenienceFee.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-gray-900 font-bold text-base pt-2 border-t border-gray-300">
            <span>Total Due Today</span>
            <span>${totalAmount.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <Check className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-900">
            This payment method will be securely stored for automatic renewal of your VIP membership.
            You can update or remove it at any time from your account settings.
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-800 rounded-lg font-medium"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 text-white rounded-lg font-semibold flex items-center justify-center gap-2 shadow-lg"
        >
          {loading ? (
            <>Processing...</>
          ) : (
            <>
              <Check className="w-5 h-5" />
              Complete Signup - ${totalAmount.toFixed(2)}
            </>
          )}
        </button>
      </div>

      <p className="text-xs text-gray-600 text-center">
        Payments are processed securely through QuickBooks. We never store your full payment details.
      </p>
    </form>
  );
}
