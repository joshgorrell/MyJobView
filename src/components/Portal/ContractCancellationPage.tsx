import { useState, useEffect } from 'react';
import { XCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ContractCancellationForm } from './ContractCancellationForm';

export function ContractCancellationPage() {
  const [loading, setLoading] = useState(true);
  const [contactId, setContactId] = useState<string | null>(null);
  const [contactName, setContactName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUserData();
  }, []);

  async function loadUserData() {
    try {
      const impersonatingContactId = localStorage.getItem('admin_impersonating_contact');
      let currentContactId: string | null = null;

      if (impersonatingContactId) {
        currentContactId = impersonatingContactId;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setError('Please log in to access this page.');
          setLoading(false);
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('contact_id')
          .eq('id', user.id)
          .maybeSingle();

        if (!profile?.contact_id) {
          setError('No customer account found. Please contact support.');
          setLoading(false);
          return;
        }

        currentContactId = profile.contact_id;
      }

      if (!currentContactId) {
        setError('Unable to load customer information.');
        setLoading(false);
        return;
      }

      const { data: contact } = await supabase
        .from('contacts')
        .select('first_name, last_name')
        .eq('id', currentContactId)
        .maybeSingle();

      if (contact) {
        setContactName(`${contact.first_name} ${contact.last_name}`.trim() || 'Customer');
      }

      setContactId(currentContactId);
    } catch (err) {
      console.error('Error loading user data:', err);
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleSuccess() {
    window.location.href = '/portal';
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 bg-white rounded-2xl shadow-md flex items-center justify-center mx-auto mb-4">
            <Loader2 className="w-7 h-7 text-[#0f2347] animate-spin" />
          </div>
          <p className="text-gray-500 text-sm font-medium">Loading your account...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-5 border-4 border-red-100">
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Access Error</h1>
          <p className="text-gray-500 mb-6 text-sm leading-relaxed">{error}</p>
          <a
            href="/portal"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#0f2347] text-white rounded-xl font-semibold hover:bg-[#1a3a6e] transition-colors text-sm"
          >
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-[#0f2347] shadow-md sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/el_logo_color_(2).png" alt="Electronic Life" className="h-8 sm:h-10 object-contain" />
              <div className="border-l border-white/20 pl-3">
                <p className="text-white font-semibold text-sm leading-tight">Contract Cancellation</p>
                {contactName && <p className="text-blue-300 text-xs">{contactName}</p>}
              </div>
            </div>
            <a
              href="/portal"
              className="flex items-center gap-1.5 px-3 py-2 text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-sm font-medium min-h-[44px]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back to Portal</span>
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Warning Banner */}
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 sm:p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-red-900 mb-2">Before You Cancel</h2>
              <ul className="text-sm text-red-800 space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                  If your contract has more than 90 days remaining, an early termination fee will apply
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                  You will continue to receive monitoring service until your selected end date
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                  We bill monthly on the 1st — plan your cancellation date accordingly
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                  Our team will review and contact you within 1–2 business days
                </li>
              </ul>
            </div>
          </div>
        </div>

        {contactId && (
          <ContractCancellationForm
            contactId={contactId}
            onClose={() => { window.location.href = '/portal'; }}
            onSuccess={handleSuccess}
          />
        )}
      </main>
    </div>
  );
}
