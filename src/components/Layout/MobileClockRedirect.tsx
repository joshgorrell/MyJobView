import { Smartphone, MapPin, Navigation, Download } from 'lucide-react';

/**
 * Shown inside the Time Clock launchpad when an employee's Time Clock Access
 * is set to "mobile". Instead of rendering the web clock in/out buttons, we
 * direct them to the mobile app for better GPS, tracking, and breadcrumbs.
 */
export function MobileClockRedirect() {
  return (
    <div className="rounded-2xl border border-blue-300 bg-elevated p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
          <Smartphone className="w-5 h-5" />
        </div>
        <div>
          <p className="font-semibold text-primary">Clock in on the mobile app</p>
          <p className="text-sm text-secondary mt-0.5">
            Your time clock is set up for the mobile app for better location tracking.
          </p>
        </div>
      </div>

      <div className="space-y-2 text-sm text-secondary">
        <div className="flex items-start gap-2">
          <MapPin className="w-4 h-4 mt-0.5 text-blue-400 shrink-0" />
          <span>GPS-checked clock in and clock out for accurate location records</span>
        </div>
        <div className="flex items-start gap-2">
          <Navigation className="w-4 h-4 mt-0.5 text-blue-400 shrink-0" />
          <span>Route tracking and breadcrumbs throughout the work day</span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 pt-1">
        <a
          href="https://apps.apple.com/app/mjv/id6738259670"
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-11 rounded-xl bg-blue-600 text-white px-4 py-3 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors"
        >
          <Download className="w-4 h-4" />
 Download for iPhone
        </a>
        <a
          href="https://play.google.com/store/apps/details?id=com.mjv.fieldservice"
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-11 rounded-xl border border-subtle px-4 py-3 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-surface transition-colors"
        >
          <Download className="w-4 h-4" />
 Download for Android
        </a>
      </div>

      <p className="text-xs text-muted pt-1">
        Already installed? Open the MJV app and tap Time Clock to clock in or out.
      </p>
    </div>
  );
}
