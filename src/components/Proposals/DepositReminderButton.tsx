import { useState, useEffect } from 'react';
import { Send, MessageSquare, Mail, CheckCircle, XCircle, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type ModalState = 'select' | 'sending' | 'success' | 'error';

interface DepositReminderButtonProps {
  proposalId: string;
  proposalNumber: string;
  depositAmount: number;
  reminderCount?: number;
  lastReminderSent?: string;
  customerName?: string;
}

export default function DepositReminderButton({
  proposalId,
  proposalNumber,
  depositAmount,
  reminderCount = 0,
  lastReminderSent,
  customerName
}: DepositReminderButtonProps) {
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [resultMessage, setResultMessage] = useState('');
  const [sentViaSms, setSentViaSms] = useState(false);
  const [checkmarkVisible, setCheckmarkVisible] = useState(false);

  useEffect(() => {
    if (modalState === 'success') {
      const t = setTimeout(() => setCheckmarkVisible(true), 50);
      const close = setTimeout(() => {
        setCheckmarkVisible(false);
        setTimeout(() => setModalState(null), 300);
      }, 2800);
      return () => { clearTimeout(t); clearTimeout(close); };
    } else {
      setCheckmarkVisible(false);
    }
  }, [modalState]);

  async function sendReminder(includeSms: boolean) {
    setSentViaSms(includeSms);
    setModalState('sending');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-deposit-reminder`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ proposalId, sendSms: includeSms }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send reminder');
      }

      const result = await response.json();
      setResultMessage(result.message || 'Deposit reminder sent successfully!');
      setModalState('success');
    } catch (error: any) {
      console.error('Error sending deposit reminder:', error);
      setResultMessage(error.message || 'Failed to send deposit reminder');
      setModalState('error');
    }
  }

  const lastSentText = lastReminderSent
    ? new Date(lastReminderSent).toLocaleDateString()
    : 'Never';

  return (
    <>
      <div className="relative inline-flex flex-shrink-0">
        <button
          onClick={() => setModalState('select')}
          disabled={modalState === 'sending'}
          className="flex items-center justify-center w-8 h-8 bg-yellow-600 text-white rounded-lg hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title={`Send deposit reminder (${reminderCount} sent, last: ${lastSentText})`}
        >
          <Send size={14} />
        </button>
        {reminderCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 bg-yellow-900 border border-yellow-700 text-yellow-100 text-[10px] font-bold rounded-full flex items-center justify-center pointer-events-none">
            {reminderCount}
          </span>
        )}
      </div>

      {modalState !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={modalState === 'select' || modalState === 'error' ? () => setModalState(null) : undefined}
          />

          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

            {modalState === 'select' && (
              <>
                <div className="p-5 border-b border-gray-100">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900 text-base">Send Deposit Reminder</h3>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {proposalNumber}{customerName && ` — ${customerName}`}
                      </p>
                    </div>
                    <button
                      onClick={() => setModalState(null)}
                      className="text-gray-400 hover:text-gray-600 transition-colors ml-3 mt-0.5"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <div className="mt-3 px-3 py-2 bg-yellow-50 rounded-lg border border-yellow-100">
                    <p className="text-sm font-semibold text-yellow-800">
                      Deposit Due: ${depositAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                    {reminderCount > 0 && (
                      <p className="text-xs text-yellow-600 mt-0.5">
                        {reminderCount} reminder{reminderCount !== 1 ? 's' : ''} sent
                        {lastReminderSent && ` · Last: ${lastSentText}`}
                      </p>
                    )}
                  </div>
                </div>

                <div className="p-3 space-y-1">
                  <button
                    onClick={() => sendReminder(false)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 rounded-xl text-left transition-colors group"
                  >
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors flex-shrink-0">
                      <Mail size={18} className="text-blue-600" />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 text-sm">Email Only</div>
                      <div className="text-xs text-gray-500">Send deposit reminder via email</div>
                    </div>
                  </button>

                  <button
                    onClick={() => sendReminder(true)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 rounded-xl text-left transition-colors group"
                  >
                    <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center group-hover:bg-green-100 transition-colors flex-shrink-0">
                      <MessageSquare size={18} className="text-green-600" />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 text-sm">Email + SMS</div>
                      <div className="text-xs text-gray-500">Send via email and text message</div>
                    </div>
                  </button>
                </div>

                <div className="px-5 pb-4">
                  <p className="text-xs text-gray-400 text-center">
                    The customer will be reminded to complete their deposit payment.
                  </p>
                </div>
              </>
            )}

            {modalState === 'sending' && (
              <div className="flex flex-col items-center justify-center py-12 px-6">
                <div className="relative w-20 h-20 mb-5">
                  <div className="absolute inset-0 rounded-full border-4 border-yellow-100" />
                  <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-yellow-500 animate-spin" />
                  <div className="absolute inset-2 rounded-full bg-yellow-50 flex items-center justify-center">
                    {sentViaSms ? (
                      <MessageSquare size={22} className="text-yellow-600" />
                    ) : (
                      <Mail size={22} className="text-yellow-600" />
                    )}
                  </div>
                </div>
                <p className="text-gray-800 font-semibold text-base">Sending Reminder...</p>
                <p className="text-gray-400 text-sm mt-1">
                  {sentViaSms ? 'Sending email and SMS' : 'Sending email'} to customer
                </p>
                <div className="flex gap-1.5 mt-4">
                  <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}

            {modalState === 'success' && (
              <div className="flex flex-col items-center justify-center py-12 px-6">
                <div
                  className="relative w-20 h-20 mb-5 transition-all duration-500"
                  style={{
                    transform: checkmarkVisible ? 'scale(1)' : 'scale(0.5)',
                    opacity: checkmarkVisible ? 1 : 0,
                  }}
                >
                  <div className="absolute inset-0 rounded-full bg-green-100" />
                  <CheckCircle
                    size={80}
                    className="absolute inset-0 text-green-500"
                    style={{ strokeDasharray: 200, strokeDashoffset: checkmarkVisible ? 0 : 200, transition: 'stroke-dashoffset 0.6s ease 0.2s' }}
                  />
                </div>
                <p
                  className="text-gray-800 font-semibold text-base transition-all duration-400"
                  style={{ opacity: checkmarkVisible ? 1 : 0, transform: checkmarkVisible ? 'translateY(0)' : 'translateY(6px)', transitionDelay: '0.15s' }}
                >
                  Reminder Sent!
                </p>
                <p
                  className="text-gray-400 text-sm mt-1 text-center transition-all duration-400"
                  style={{ opacity: checkmarkVisible ? 1 : 0, transform: checkmarkVisible ? 'translateY(0)' : 'translateY(6px)', transitionDelay: '0.25s' }}
                >
                  {resultMessage}
                </p>
                <div
                  className="flex items-center gap-2 mt-3 transition-all duration-400"
                  style={{ opacity: checkmarkVisible ? 1 : 0, transitionDelay: '0.35s' }}
                >
                  {(sentViaSms ? ['Email', 'SMS'] : ['Email']).map((channel) => (
                    <span key={channel} className="px-2 py-0.5 bg-green-50 text-green-700 text-xs font-medium rounded-full border border-green-100">
                      {channel} sent
                    </span>
                  ))}
                </div>
              </div>
            )}

            {modalState === 'error' && (
              <div className="flex flex-col items-center justify-center py-10 px-6">
                <div className="w-16 h-16 mb-4 relative">
                  <div className="absolute inset-0 rounded-full bg-red-50" />
                  <XCircle size={64} className="absolute inset-0 text-red-400" />
                </div>
                <p className="text-gray-800 font-semibold text-base">Failed to Send</p>
                <p className="text-gray-500 text-sm mt-1 text-center">{resultMessage}</p>
                <div className="flex gap-2 mt-5">
                  <button
                    onClick={() => setModalState('select')}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                  >
                    Try Again
                  </button>
                  <button
                    onClick={() => setModalState(null)}
                    className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-sm font-medium transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </>
  );
}
