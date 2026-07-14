import { X, Sparkles, ClipboardList, Calendar, MessageSquare, Star, CheckCircle } from 'lucide-react';

interface TestAndTuneWelcomeModalProps {
  onClose: () => void;
  daysRemaining: number;
  customerName?: string;
}

export function TestAndTuneWelcomeModal({ onClose, daysRemaining, customerName }: TestAndTuneWelcomeModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 sm:p-6 rounded-t-lg relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <Sparkles className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold">Welcome to Test & Tune!</h2>
              <p className="text-blue-100 text-sm">Your complimentary 90-day VIP access</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-6">
          {/* Thank You Message */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-gray-700">
              <strong>Thank you{customerName ? `, ${customerName},` : ''} for choosing us!</strong> As a token of our
              appreciation, we're giving you <strong>90 days of free VIP access</strong> to help us make sure your
              system is perfect.
            </p>
          </div>

          {/* What is Test & Tune */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              What is Test & Tune?
            </h3>
            <p className="text-gray-600 mb-3">
              The Test & Tune program is our commitment to ensuring your complete satisfaction. During the next
              <strong> {daysRemaining} days</strong>, you have full VIP access to report any issues, request adjustments,
              and help us fine-tune your system to perfection.
            </p>
          </div>

          {/* What's Included */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-600" />
              What's Included in Your Trial
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start gap-3 bg-gray-50 rounded-lg p-4">
                <ClipboardList className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-gray-900 mb-1">Punchlist Access</div>
                  <div className="text-sm text-gray-600">
                    Create unlimited service items and track progress in real-time
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-gray-50 rounded-lg p-4">
                <Calendar className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-gray-900 mb-1">Priority Service</div>
                  <div className="text-sm text-gray-600">
                    Get priority scheduling for service appointments
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-gray-50 rounded-lg p-4">
                <MessageSquare className="w-6 h-6 text-purple-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-gray-900 mb-1">Direct Communication</div>
                  <div className="text-sm text-gray-600">
                    Message our team directly through your portal
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-gray-50 rounded-lg p-4">
                <Star className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-gray-900 mb-1">VIP Support</div>
                  <div className="text-sm text-gray-600">
                    Dedicated support and faster response times
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Getting Started */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-3">Getting Started</h3>
            <ol className="space-y-3">
              <li className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold">
                  1
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">Visit Your Punchlist</div>
                  <div className="text-sm text-gray-600">
                    Click "My Punchlist" from your dashboard to start creating service items
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold">
                  2
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">Document Any Issues</div>
                  <div className="text-sm text-gray-600">
                    Add photos and descriptions to help us understand your needs
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold">
                  3
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">Request Service</div>
                  <div className="text-sm text-gray-600">
                    Submit your punchlist items and we'll schedule a visit
                  </div>
                </div>
              </li>
            </ol>
          </div>

          {/* What Happens After */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h4 className="font-bold text-gray-900 mb-2">What Happens After 90 Days?</h4>
            <p className="text-gray-700 text-sm mb-3">
              Your trial will expire after {daysRemaining} days. If you'd like to continue enjoying VIP benefits,
              you can subscribe to one of our affordable membership plans at any time.
            </p>
            <p className="text-gray-700 text-sm">
              We'll send you reminders as your trial period ends, and there's no obligation to continue.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 p-4 sm:p-6 rounded-b-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-sm text-gray-600">
            You can access this information anytime from your dashboard
          </div>
          <div className="flex gap-3 flex-wrap">
            <a
              href="/portal/vip-membership"
              className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors font-medium"
            >
              View Plans
            </a>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
            >
              Get Started
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
