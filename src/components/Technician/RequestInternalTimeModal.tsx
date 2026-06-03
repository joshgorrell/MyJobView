import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  X, Wrench, BookOpen, Clock, CheckCircle, AlertCircle, Send
} from 'lucide-react';

interface CompanySettings {
  id: string;
  shop_time_request_enabled: boolean;
  training_time_request_enabled: boolean;
  time_request_requires_approval: boolean;
}

interface RequestInternalTimeModalProps {
  companySettings: CompanySettings;
  onClose: () => void;
  onSubmitted: () => void;
}

const DURATION_OPTIONS = [
  { label: '30 min', value: 0.5 },
  { label: '1 hour', value: 1 },
  { label: '2 hours', value: 2 },
  { label: '4 hours', value: 4 },
];

type Step = 'type' | 'details' | 'success';

export function RequestInternalTimeModal({
  companySettings,
  onClose,
  onSubmitted,
}: RequestInternalTimeModalProps) {
  const { profile } = useAuth();
  const [step, setStep] = useState<Step>('type');
  const [sessionType, setSessionType] = useState<'shop_time' | 'training' | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number>(1);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requiresApproval, setRequiresApproval] = useState(true);

  const bothEnabled = companySettings.shop_time_request_enabled && companySettings.training_time_request_enabled;
  const onlyShop = companySettings.shop_time_request_enabled && !companySettings.training_time_request_enabled;
  const onlyTraining = !companySettings.shop_time_request_enabled && companySettings.training_time_request_enabled;

  function getDuration(): number {
    return selectedDuration;
  }

  function canAdvance(): boolean {
    if (step === 'type') return sessionType !== null;
    if (step === 'details') {
      const d = getDuration();
      return d > 0 && d <= 12 && reason.trim().length >= 3;
    }
    return false;
  }

  async function handleSubmit() {
    if (!profile || !sessionType) return;
    const duration = getDuration();
    if (duration <= 0 || duration > 12) return;

    setSubmitting(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const needsApproval = companySettings.time_request_requires_approval;
      setRequiresApproval(needsApproval);

      const status = needsApproval ? 'pending_approval' : 'scheduled';
      const defaultTitle = sessionType === 'shop_time' ? 'Shop Time Request' : 'Training Request';

      const { data: companyData } = await supabase
        .from('company_settings')
        .select('id')
        .maybeSingle();

      const { error } = await supabase
        .from('internal_time_sessions')
        .insert({
          session_type: sessionType,
          title: defaultTitle,
          description: reason.trim(),
          session_date: today,
          assigned_to: profile.id,
          requested_by: profile.id,
          request_reason: reason.trim(),
          predetermined_hours: duration,
          status,
          notes: notes.trim() || null,
          created_by: profile.id,
        });

      if (error) throw error;

      if (!needsApproval) {
        const clockIn = new Date();
        const clockOut = new Date(clockIn.getTime() + duration * 3600 * 1000);

        await supabase.from('time_entries').insert({
          company_id: companyData?.id,
          technician_id: profile.id,
          entry_date: today,
          clock_in: clockIn.toISOString(),
          clock_out: clockOut.toISOString(),
          total_hours: duration,
          break_minutes: 0,
          status: 'submitted',
          entry_type: sessionType,
          notes: reason.trim() || null,
        });
      }

      setStep('success');
      onSubmitted();
    } catch (err: any) {
      console.error('Error submitting request:', err);
      alert(err.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  }

  const accentShop = 'from-amber-500 to-amber-600';
  const accentTraining = 'from-teal-600 to-teal-700';
  const headerGradient = sessionType === 'training' ? accentTraining : accentShop;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        {/* Header */}
        <div className={`bg-gradient-to-r ${headerGradient} text-white p-5 rounded-t-xl flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            {sessionType === 'training'
              ? <BookOpen className="w-5 h-5" />
              : <Wrench className="w-5 h-5" />
            }
            <div>
              <h2 className="text-lg font-bold">Request Time</h2>
              <p className="text-white/80 text-xs">
                {step === 'success' ? 'Request submitted' : 'Shop time or training request'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step: Type Selection */}
        {step === 'type' && (
          <div className="p-5 space-y-4">
            <p className="text-sm text-gray-600">
              What type of time are you requesting?
            </p>

            <div className="space-y-3">
              {companySettings.shop_time_request_enabled && (
                <button
                  type="button"
                  onClick={() => setSessionType('shop_time')}
                  className={`w-full flex items-start gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                    sessionType === 'shop_time'
                      ? 'border-amber-500 bg-amber-50'
                      : 'border-gray-200 hover:border-amber-300 hover:bg-amber-50/40'
                  }`}
                >
                  <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                    sessionType === 'shop_time' ? 'bg-amber-200' : 'bg-amber-100'
                  }`}>
                    <Wrench className="w-5 h-5 text-amber-700" />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">Shop Time</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Cleaning, organizing, bench work, shop chores
                    </div>
                  </div>
                  {sessionType === 'shop_time' && (
                    <CheckCircle className="w-5 h-5 text-amber-600 flex-shrink-0 ml-auto mt-0.5" />
                  )}
                </button>
              )}

              {companySettings.training_time_request_enabled && (
                <button
                  type="button"
                  onClick={() => setSessionType('training')}
                  className={`w-full flex items-start gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                    sessionType === 'training'
                      ? 'border-teal-600 bg-teal-50'
                      : 'border-gray-200 hover:border-teal-400 hover:bg-teal-50/40'
                  }`}
                >
                  <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                    sessionType === 'training' ? 'bg-teal-200' : 'bg-teal-100'
                  }`}>
                    <BookOpen className="w-5 h-5 text-teal-700" />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">Training</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Instruction, certifications, product knowledge
                    </div>
                  </div>
                  {sessionType === 'training' && (
                    <CheckCircle className="w-5 h-5 text-teal-600 flex-shrink-0 ml-auto mt-0.5" />
                  )}
                </button>
              )}
            </div>

            {companySettings.time_request_requires_approval && (
              <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200 text-xs text-blue-700">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                A manager will need to approve this request before it counts toward your pay.
              </div>
            )}

            <div className="flex gap-3 pt-2 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setStep('details')}
                disabled={!canAdvance()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step: Details */}
        {step === 'details' && (
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                <Clock className="w-4 h-4 inline mr-1" />
                How much time?
              </label>
              <div className="grid grid-cols-2 gap-2">
                {DURATION_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSelectedDuration(opt.value)}
                    className={`py-2 rounded-lg text-sm font-medium border transition-all ${
                      selectedDuration === opt.value
                        ? 'border-blue-500 bg-blue-50 text-blue-800'
                        : 'border-gray-200 text-gray-600 hover:border-blue-300 hover:bg-blue-50/40'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={3}
                placeholder={
                  sessionType === 'shop_time'
                    ? 'What will you be doing? (e.g. cleaning the van, organizing parts room)'
                    : 'What are you training on? (e.g. reviewing new product install guide)'
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Additional Notes
                <span className="text-gray-400 font-normal ml-1">(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="Anything else your manager should know?"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>

            <div className="flex gap-3 pt-2 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setStep('type')}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canAdvance() || submitting}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
                  sessionType === 'training'
                    ? 'bg-teal-600 hover:bg-teal-700'
                    : 'bg-amber-500 hover:bg-amber-600'
                }`}
              >
                <Send className="w-4 h-4" />
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        )}

        {/* Step: Success */}
        {step === 'success' && (
          <div className="p-8 text-center space-y-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${
              sessionType === 'training' ? 'bg-teal-100' : 'bg-amber-100'
            }`}>
              <CheckCircle className={`w-8 h-8 ${
                sessionType === 'training' ? 'text-teal-600' : 'text-amber-600'
              }`} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                {requiresApproval ? 'Request Submitted!' : 'Session Started!'}
              </h3>
              <p className="text-sm text-gray-500 mt-1.5">
                {requiresApproval
                  ? 'Your request has been sent to your manager for approval. You\'ll see it in your Assigned Sessions once approved.'
                  : 'Your session has been created and submitted for payroll. Great work!'
                }
              </p>
            </div>
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
              requiresApproval
                ? 'bg-amber-100 text-amber-800'
                : 'bg-green-100 text-green-800'
            }`}>
              {requiresApproval
                ? <><Clock className="w-4 h-4" /> Awaiting manager approval</>
                : <><CheckCircle className="w-4 h-4" /> Submitted to payroll</>
              }
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full mt-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
