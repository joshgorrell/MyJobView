import { AppointmentsCalendar } from './AppointmentsCalendar';
import { useAuth } from '../../contexts/AuthContext';
import { useEffect } from 'react';

export function CalendarPopout() {
  const { profile } = useAuth();

  useEffect(() => {
    // Set document title for the popup window
    document.title = 'Calendar - Pop-out View';
  }, []);

  if (!profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="text-white text-center">
          <h1 className="text-2xl font-bold mb-2">Authentication Required</h1>
          <p className="text-gray-400">Please log in to view the calendar.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6">
      <AppointmentsCalendar />
    </div>
  );
}
