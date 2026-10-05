import { useState } from 'react';
import { Check, Building2, Layout, UserCircle, Briefcase, X, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { CreatedUserData } from './AddUserForm';

interface UserCreatedConfirmationProps {
  userData: CreatedUserData;
  onEditDepartment: () => void;
  onEditModules: () => void;
  onClose: () => void;
}

export function UserCreatedConfirmation({
  userData,
  onEditDepartment,
  onEditModules,
  onClose,
}: UserCreatedConfirmationProps) {
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  async function sendWelcomeEmail() {
    setSendingEmail(true);
    setEmailError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-welcome-email`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: userData.email,
            full_name: userData.full_name,
          }),
        }
      );

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to send welcome email');
      }
      if (result.warning) setEmailError(result.warning);
      setEmailSent(true);
    } catch (error: any) {
      console.error('Error sending welcome email:', error);
      setEmailError(error.message || 'Failed to send email');
    } finally {
      setSendingEmail(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
              <Check className="w-5 h-5 text-green-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">User Created</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div>
              <span className="text-xs font-medium text-gray-500 uppercase">Name</span>
              <p className="text-sm font-semibold text-gray-900">{userData.full_name}</p>
            </div>
            <div>
              <span className="text-xs font-medium text-gray-500 uppercase">Email</span>
              <p className="text-sm text-gray-700">{userData.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500 uppercase">Classification</span>
              {userData.classification === 'employee' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                  <UserCircle className="w-3 h-3" />
                  Employee
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                  <Briefcase className="w-3 h-3" />
                  Non-Employee
                </span>
              )}
            </div>
            <div>
              <span className="text-xs font-medium text-gray-500 uppercase">Departments</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {userData.departmentNames.length > 0 ? (
                  userData.departmentNames.map((name) => (
                    <span
                      key={name}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-cyan-100 text-cyan-700"
                    >
                      <Building2 className="w-3 h-3" />
                      {name}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-gray-400">No departments enabled</span>
                )}
              </div>
            </div>
          </div>

          {emailError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
              {emailError}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-500 uppercase">Next Steps</p>

            <button
              onClick={onEditDepartment}
              className="w-full flex items-center gap-3 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors text-left"
            >
              <Building2 className="w-4 h-4 text-indigo-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">Edit Department Access</p>
                <p className="text-xs text-gray-500">Fine-tune which departments this user can see</p>
              </div>
            </button>

            <button
              onClick={onEditModules}
              className="w-full flex items-center gap-3 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors text-left"
            >
              <Layout className="w-4 h-4 text-cyan-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">Edit Page Access</p>
                <p className="text-xs text-gray-500">Control which specific pages within each department</p>
              </div>
            </button>

            <button
              onClick={sendWelcomeEmail}
              disabled={sendingEmail || emailSent}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-colors text-left ${
                emailSent
                  ? 'bg-green-50 border-green-200'
                  : 'bg-blue-50 border-blue-200 hover:bg-blue-100'
              } disabled:opacity-60`}
            >
              {emailSent ? (
                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
              ) : (
                <Send className={`w-4 h-4 text-blue-600 flex-shrink-0 ${sendingEmail ? 'animate-pulse' : ''}`} />
              )}
              <div className="flex-1">
                <p className={`text-sm font-medium ${emailSent ? 'text-green-800' : 'text-blue-900'}`}>
                  {emailSent ? 'Welcome Email Sent' : sendingEmail ? 'Sending...' : 'Send Welcome Email'}
                </p>
                <p className="text-xs text-gray-500">
                  {emailSent
                    ? `${userData.email} has been sent a secure password setup link`
                    : `Send a password setup link to ${userData.email}`}
                </p>
              </div>
            </button>
          </div>
        </div>

        <div className="p-5 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
