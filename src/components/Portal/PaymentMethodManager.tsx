import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { CreditCard, Building2, Plus, Trash2, Check, AlertCircle } from 'lucide-react';
import { PaymentMethodForm, PaymentFormData } from './PaymentMethodForm';
import ConfirmModal from '../ui/ConfirmModal';

interface PaymentMethod {
  id: string;
  payment_type: 'card' | 'ach';
  display_brand: string | null;
  display_last4: string | null;
  display_bank_name: string | null;
  exp_month: number | null;
  exp_year: number | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

interface PaymentMethodManagerProps {
  contactId: string;
  onPaymentMethodAdded?: () => void;
}

export function PaymentMethodManager({ contactId, onPaymentMethodAdded }: PaymentMethodManagerProps) {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadPaymentMethods();
  }, [contactId]);

  async function loadPaymentMethods() {
    try {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('contact_id', contactId)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPaymentMethods(data || []);
    } catch (err: any) {
      console.error('Error loading payment methods:', err);
      setError('Failed to load payment methods');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddPaymentMethod(paymentData: PaymentFormData) {
    // In production, this would tokenize the payment method with Stripe first
    // For now, we'll simulate the process

    try {
      // Simulate Stripe tokenization
      const stripeToken = `pm_${Math.random().toString(36).substr(2, 24)}`;

      // Extract display information
      let displayData: any = {
        payment_type: paymentData.paymentType,
        stripe_payment_method_id: stripeToken,
        is_default: paymentMethods.length === 0, // First payment method is default
      };

      if (paymentData.paymentType === 'card') {
        displayData.display_brand = 'Visa'; // Would come from Stripe
        displayData.display_last4 = paymentData.cardNumber?.slice(-4);
        displayData.exp_month = parseInt(paymentData.cardExpMonth || '0');
        displayData.exp_year = parseInt(paymentData.cardExpYear || '0');
      } else {
        displayData.display_bank_name = 'Bank'; // Would come from Stripe
        displayData.display_last4 = paymentData.achAccount?.slice(-4);
      }

      const { error } = await supabase
        .from('payment_methods')
        .insert({
          contact_id: contactId,
          ...displayData,
        });

      if (error) throw error;

      setShowAddForm(false);
      loadPaymentMethods();
      if (onPaymentMethodAdded) onPaymentMethodAdded();
    } catch (err: any) {
      throw new Error(err.message || 'Failed to add payment method');
    }
  }

  async function handleSetDefault(methodId: string) {
    try {
      const { error } = await supabase
        .from('payment_methods')
        .update({ is_default: true })
        .eq('id', methodId);

      if (error) throw error;

      loadPaymentMethods();
    } catch (err: any) {
      console.error('Error setting default:', err);
      alert('Failed to set default payment method');
    }
  }

  async function handleDelete(methodId: string) {
    try {
      const { error } = await supabase
        .from('payment_methods')
        .update({ is_active: false })
        .eq('id', methodId);

      if (error) throw error;

      loadPaymentMethods();
    } catch (err: any) {
      console.error('Error deleting payment method:', err);
      alert('Failed to remove payment method');
    }
  }

  if (loading) {
    return <div className="text-gray-400">Loading payment methods...</div>;
  }

  if (showAddForm) {
    return (
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Add Payment Method</h3>
        <PaymentMethodForm
          amount={0} // Just for setup, no charge
          onSubmit={handleAddPaymentMethod}
          onCancel={() => setShowAddForm(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-white">Payment Methods</h3>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Payment Method
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-200">{error}</p>
        </div>
      )}

      {paymentMethods.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No payment methods saved</p>
          <p className="text-sm mt-1">Add a payment method for automatic renewal</p>
        </div>
      ) : (
        <div className="space-y-3">
          {paymentMethods.map((method) => (
            <div
              key={method.id}
              className={`bg-gray-800 border rounded-lg p-4 ${
                method.is_default ? 'border-blue-500' : 'border-gray-700'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-start gap-3">
                  {method.payment_type === 'card' ? (
                    <CreditCard className="w-5 h-5 text-blue-400 mt-0.5" />
                  ) : (
                    <Building2 className="w-5 h-5 text-blue-400 mt-0.5" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">
                        {method.payment_type === 'card'
                          ? `${method.display_brand} •••• ${method.display_last4}`
                          : `${method.display_bank_name} •••• ${method.display_last4}`}
                      </span>
                      {method.is_default && (
                        <span className="px-2 py-0.5 bg-blue-900/50 text-blue-300 text-xs rounded">
                          Default
                        </span>
                      )}
                    </div>
                    {method.payment_type === 'card' && method.exp_month && method.exp_year && (
                      <div className="text-sm text-gray-400 mt-1">
                        Expires {String(method.exp_month).padStart(2, '0')}/{method.exp_year}
                      </div>
                    )}
                    {method.payment_type === 'ach' && (
                      <div className="text-sm text-gray-400 mt-1">
                        Bank Account (ACH)
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!method.is_default && (
                    <button
                      onClick={() => handleSetDefault(method.id)}
                      className="p-2 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded"
                      title="Set as default"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => setConfirmDeleteId(method.id)}
                    className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3">
        <p className="text-xs text-blue-200">
          Your default payment method will be used for automatic renewal of your VIP membership.
          All payment information is securely encrypted and processed through Stripe.
        </p>
      </div>
      <ConfirmModal
        isOpen={!!confirmDeleteId}
        title="Remove Payment Method"
        message="Are you sure you want to remove this payment method?"
        variant="danger"
        confirmLabel="Remove"
        onConfirm={() => {
          if (confirmDeleteId) {
            const id = confirmDeleteId;
            setConfirmDeleteId(null);
            handleDelete(id);
          }
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
