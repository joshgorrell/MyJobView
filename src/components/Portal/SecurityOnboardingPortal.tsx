import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Shield, CheckCircle, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import OnboardingWizard from './OnboardingWizard';

interface SecurityOnboardingPortalProps {
  token?: string;
}

export default function SecurityOnboardingPortal({ token: propToken }: SecurityOnboardingPortalProps) {
  const urlParams = new URLSearchParams(window.location.search);
  const urlToken = urlParams.get('token');
  const initialToken = propToken || urlToken || null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contract, setContract] = useState<any>(null);
  const [token] = useState<string | null>(initialToken);

  useEffect(() => {
    if (token) {
      validateToken();
    } else {
      setLoading(false);
      setError('No invitation token provided');
    }
  }, []);

  async function validateToken() {
    try {
      setLoading(true);
      setError(null);

      const { data: contractData, error: contractError } = await supabase
        .from('security_contracts')
        .select('id, status, magic_link_expires_at, contact_id, template_id, organization_id, contract_number, monthly_price, term_months, notes, customer_signature, customer_completed_at, payment_method, last_four, payment_token, price_override, invitation_sent_at, customer_signature_date, customer_ip_address')
        .eq('magic_link_token', token)
        .maybeSingle();

      if (contractError) throw contractError;

      if (!contractData) {
        setError('Invalid or expired invitation link');
        return;
      }

      if (contractData.magic_link_expires_at && new Date(contractData.magic_link_expires_at) < new Date()) {
        setError('This invitation link has expired. Please contact us for a new link.');
        return;
      }

      if (contractData.status === 'active' || contractData.status === 'cancelled') {
        setError('This agreement has already been processed.');
        return;
      }

      const [contactResult, templateResult] = await Promise.all([
        contractData.contact_id
          ? supabase.from('contacts').select('*').eq('id', contractData.contact_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        contractData.template_id
          ? supabase.from('security_contract_templates').select('*, fields:security_contract_fields(*)').eq('id', contractData.template_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      setContract({
        ...contractData,
        contact: contactResult.data,
        template: templateResult.data,
      });
    } catch (err) {
      console.error('Error validating token:', err);
      setError('Failed to load agreement. Please try again or contact support.');
    } finally {
      setLoading(false);
    }
  }

  const PageShell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-[#0f2347] py-4 px-4 sm:px-6 shadow-md">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <img src="/el_logo_color_(2).png" alt="Electronic Life" className="h-8 sm:h-10 object-contain" />
          <div className="border-l border-white/20 pl-3">
            <p className="text-white font-semibold text-sm leading-tight">Security Agreement</p>
            <p className="text-blue-300 text-xs">Electronic Life</p>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center p-4 sm:p-8 min-h-[calc(100vh-72px)]">
        {children}
      </div>
    </div>
  );

  if (loading) {
    return (
      <PageShell>
        <div className="bg-white rounded-2xl shadow-lg p-8 sm:p-10 text-center max-w-sm w-full">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Loading Agreement</h2>
          <p className="text-gray-500 text-sm">Please wait while we retrieve your agreement...</p>
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell>
        <div className="bg-white rounded-2xl shadow-lg p-8 sm:p-10 max-w-md w-full">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-5 border-4 border-red-100">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 text-center mb-3">Unable to Access Agreement</h1>
          <p className="text-gray-500 text-center mb-6 text-sm sm:text-base leading-relaxed">{error}</p>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-sm text-gray-600 text-center leading-relaxed">
              If you believe this is an error, please contact Electronic Life for assistance.
            </p>
          </div>
        </div>
      </PageShell>
    );
  }

  if (!contract) {
    return (
      <PageShell>
        <div className="bg-white rounded-2xl shadow-lg p-8 sm:p-10 max-w-md w-full">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <Shield className="w-8 h-8 text-gray-400" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 text-center mb-3">Agreement Not Found</h1>
          <p className="text-gray-500 text-center text-sm sm:text-base leading-relaxed">
            Please check your invitation link and try again, or contact us for assistance.
          </p>
        </div>
      </PageShell>
    );
  }

  if (contract.status === 'pending_approval' || contract.customer_completed_at) {
    return (
      <PageShell>
        <div className="bg-white rounded-2xl shadow-lg p-8 sm:p-10 max-w-md w-full">
          <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-green-100">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 text-center mb-3">Agreement Submitted!</h1>
          <p className="text-gray-500 text-center mb-6 text-sm sm:text-base leading-relaxed">
            Thank you! Your agreement has been submitted successfully and is pending review by our team.
          </p>
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                <ArrowRight className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-blue-900 mb-1">What happens next?</p>
                <p className="text-sm text-blue-700 leading-relaxed">
                  You'll receive an email notification once your agreement has been approved and your monitoring service is activated.
                </p>
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400 text-center">Have questions? Contact us at any time.</p>
        </div>
      </PageShell>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-[#0f2347] shadow-md">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/el_logo_color_(2).png" alt="Electronic Life" className="h-8 sm:h-10 object-contain" />
              <div className="border-l border-white/20 pl-3">
                <p className="text-white font-semibold text-sm leading-tight">Security Agreement Onboarding</p>
                <p className="text-blue-300 text-xs">Complete your monitoring agreement below</p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-300" />
              <span className="text-blue-200 text-sm font-medium">Secure &amp; Encrypted</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
          <OnboardingWizard contract={contract} token={token || ''} onComplete={() => validateToken()} />
        </div>
      </div>
    </div>
  );
}
