import { Clock, Star, AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';
import { useState } from 'react';

interface TrialStatusBannerProps {
  daysRemaining: number;
  expirationDate: string;
  subscriptionPlanName?: string | null;
  showDetails?: boolean;
  compact?: boolean;
}

export function TrialStatusBanner({
  daysRemaining,
  expirationDate,
  subscriptionPlanName,
  showDetails = true,
  compact = false
}: TrialStatusBannerProps) {
  const [showBenefits, setShowBenefits] = useState(false);

  const isExpiringSoon = daysRemaining <= 7;
  const isWarning = daysRemaining <= 30 && daysRemaining > 7;

  const getStatusColor = () => {
    if (isExpiringSoon) return 'orange';
    if (isWarning) return 'yellow';
    return 'blue';
  };

  const statusColor = getStatusColor();

  const colorClasses = {
    blue: {
      bg: 'bg-blue-50',
      border: 'border-blue-300',
      text: 'text-blue-900',
      textLight: 'text-blue-700',
      icon: 'text-blue-600',
      badge: 'bg-blue-200 text-blue-900',
      button: 'bg-blue-600 hover:bg-blue-700',
      iconBg: 'bg-blue-100'
    },
    yellow: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-300',
      text: 'text-yellow-900',
      textLight: 'text-yellow-700',
      icon: 'text-yellow-600',
      badge: 'bg-yellow-200 text-yellow-900',
      button: 'bg-yellow-600 hover:bg-yellow-700',
      iconBg: 'bg-yellow-100'
    },
    orange: {
      bg: 'bg-orange-50',
      border: 'border-orange-300',
      text: 'text-orange-900',
      textLight: 'text-orange-700',
      icon: 'text-orange-600',
      badge: 'bg-orange-200 text-orange-900',
      button: 'bg-orange-600 hover:bg-orange-700',
      iconBg: 'bg-orange-100'
    }
  };

  const colors = colorClasses[statusColor];

  const benefits = [
    'Create unlimited punchlist items',
    'Priority service scheduling',
    'Direct communication with your team',
    'Photo documentation and tracking',
    'Service history and notes access'
  ];

  if (compact) {
    return (
      <div className={`${colors.bg} border-2 ${colors.border} rounded-lg p-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isExpiringSoon ? (
              <AlertTriangle className={`w-5 h-5 ${colors.icon}`} />
            ) : (
              <Sparkles className={`w-5 h-5 ${colors.icon}`} />
            )}
            <div>
              <div className={`text-sm font-semibold ${colors.text}`}>
                {isExpiringSoon ? 'Trial Ending Soon!' : '90-Day Test & Tune Program'}
              </div>
              <div className={`text-xs ${colors.textLight}`}>
                {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} remaining
              </div>
            </div>
          </div>
          {daysRemaining <= 30 && (
            <a
              href="/portal/vip-membership"
              className={`px-4 py-2 rounded-lg text-sm font-semibold text-white ${colors.button} transition-colors`}
            >
              Keep VIP Access
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`${colors.bg} border-2 ${colors.border} rounded-lg p-6`}>
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${colors.iconBg}`}>
          {isExpiringSoon ? (
            <AlertTriangle className={`w-6 h-6 ${colors.icon}`} />
          ) : (
            <Sparkles className={`w-6 h-6 ${colors.icon}`} />
          )}
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h3 className={`text-lg font-bold ${colors.text}`}>
              {isExpiringSoon
                ? 'Your Free Trial is Ending Soon!'
                : '90-Day Test & Tune Program - Free VIP Trial'}
            </h3>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${colors.badge}`}>
              {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} remaining
            </span>
          </div>

          <p className={`mb-3 ${colors.textLight}`}>
            {isExpiringSoon ? (
              <>
                Your complimentary Test & Tune access expires on{' '}
                <strong>
                  {new Date(expirationDate).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </strong>
                . Continue enjoying VIP benefits by subscribing to a membership plan.
              </>
            ) : (
              <>
                Thank you for choosing us! Enjoy complimentary VIP access until{' '}
                <strong>
                  {new Date(expirationDate).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </strong>
                {' '}to help us perfect your system.
              </>
            )}
          </p>

          {showDetails && (
            <>
              <button
                onClick={() => setShowBenefits(!showBenefits)}
                className={`text-sm font-medium ${colors.textLight} hover:${colors.text} underline mb-3 flex items-center gap-1`}
              >
                {showBenefits ? 'Hide' : 'Show'} what's included
                {showBenefits ? '▲' : '▼'}
              </button>

              {showBenefits && (
                <ul className={`space-y-2 mb-4 text-sm ${colors.textLight}`}>
                  {benefits.map((benefit, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <CheckCircle2 className={`w-4 h-4 ${colors.icon} mt-0.5 flex-shrink-0`} />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <a
              href="/portal/vip-membership"
              className={`inline-flex items-center gap-2 px-6 py-2.5 font-semibold rounded-lg transition-colors text-white ${colors.button}`}
            >
              <Star className="w-5 h-5" />
              {isExpiringSoon ? 'Keep Your VIP Access' : 'View Membership Plans'}
            </a>

            {!isExpiringSoon && (
              <a
                href="/portal/punchlist"
                className={`inline-flex items-center gap-2 px-4 py-2 font-medium rounded-lg transition-colors ${colors.text} hover:bg-white/50`}
              >
                Go to Punchlist
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
