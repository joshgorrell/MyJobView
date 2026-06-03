import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Car, Calendar, AlertCircle, TrendingUp, CheckCircle } from 'lucide-react';

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  license_plate: string;
}

interface Assignment {
  vehicle: Vehicle;
  assigned_date: string;
}

interface MileageEntry {
  entry_date: string;
  odometer_reading: number;
}

interface MileageReminder {
  due_date: string;
  status: string;
}

export default function VehicleMileageWidget({ onNavigateToMileage }: { onNavigateToMileage: () => void }) {
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [lastEntry, setLastEntry] = useState<MileageEntry | null>(null);
  const [reminder, setReminder] = useState<MileageReminder | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [assignmentResult, entriesResult, remindersResult] = await Promise.all([
        supabase
          .from('vehicle_assignments')
          .select(`
            assigned_date,
            vehicle:vehicles(
              id,
              make,
              model,
              year,
              license_plate
            )
          `)
          .eq('user_id', user.id)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle(),
        supabase
          .from('mileage_entries')
          .select('entry_date, odometer_reading')
          .eq('user_id', user.id)
          .order('entry_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('mileage_reminders')
          .select('due_date, status')
          .eq('user_id', user.id)
          .in('status', ['pending', 'sent', 'overdue'])
          .order('due_date', { ascending: false })
          .limit(1)
          .maybeSingle()
      ]);

      if (assignmentResult.data) {
        setAssignment(assignmentResult.data as Assignment);
      }
      if (entriesResult.data) {
        setLastEntry(entriesResult.data);
      }
      if (remindersResult.data) {
        setReminder(remindersResult.data);
      }
    } catch (error) {
      console.error('Error loading vehicle data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDaysSinceLastEntry = () => {
    if (!lastEntry && assignment) {
      const assignedDate = new Date(assignment.assigned_date);
      const today = new Date();
      return Math.floor((today.getTime() - assignedDate.getTime()) / (1000 * 60 * 60 * 24));
    }
    if (lastEntry) {
      const entryDate = new Date(lastEntry.entry_date);
      const today = new Date();
      return Math.floor((today.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
    }
    return null;
  };

  const getDaysUntilDue = () => {
    const daysSince = getDaysSinceLastEntry();
    if (daysSince === null) return null;
    return 90 - daysSince;
  };

  const isOverdue = () => {
    const daysUntil = getDaysUntilDue();
    return daysUntil !== null && daysUntil < 0;
  };

  const isDueSoon = () => {
    const daysUntil = getDaysUntilDue();
    return daysUntil !== null && daysUntil >= 0 && daysUntil <= 7;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-8 bg-gray-200 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  if (!assignment) {
    return null;
  }

  const vehicle = assignment.vehicle;
  const daysSince = getDaysSinceLastEntry();
  const daysUntil = getDaysUntilDue();
  const overdue = isOverdue();
  const dueSoon = isDueSoon();

  return (
    <div className={`bg-white rounded-lg shadow-sm border-2 p-6 ${
      overdue ? 'border-red-300 bg-red-50' : dueSoon ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200'
    }`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            overdue ? 'bg-red-100' : dueSoon ? 'bg-yellow-100' : 'bg-blue-100'
          }`}>
            <Car className={`w-5 h-5 ${
              overdue ? 'text-red-600' : dueSoon ? 'text-yellow-600' : 'text-blue-600'
            }`} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">My Vehicle</h3>
            <p className="text-sm text-gray-500">
              {vehicle.year} {vehicle.make} {vehicle.model}
            </p>
          </div>
        </div>
        {overdue && (
          <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Overdue
          </span>
        )}
        {dueSoon && !overdue && (
          <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Due Soon
          </span>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">License Plate:</span>
          <span className="font-medium text-gray-900">{vehicle.license_plate}</span>
        </div>

        {lastEntry && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Last Mileage:</span>
            <span className="font-medium text-gray-900">
              {lastEntry.odometer_reading.toLocaleString()} mi
            </span>
          </div>
        )}

        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Last Entry:</span>
          <span className="font-medium text-gray-900">
            {daysSince !== null ? `${daysSince} days ago` : 'Never'}
          </span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Next Entry Due:</span>
          <span className={`font-medium ${
            overdue ? 'text-red-600' : dueSoon ? 'text-yellow-600' : 'text-green-600'
          }`}>
            {daysUntil !== null ? (
              overdue ? `${Math.abs(daysUntil)} days overdue` : `In ${daysUntil} days`
            ) : 'N/A'}
          </span>
        </div>

        {(overdue || dueSoon) && (
          <div className={`mt-4 p-3 rounded-lg ${
            overdue ? 'bg-red-100 border border-red-200' : 'bg-yellow-100 border border-yellow-200'
          }`}>
            <p className={`text-sm font-medium ${
              overdue ? 'text-red-800' : 'text-yellow-800'
            }`}>
              {overdue
                ? 'Your quarterly mileage entry is overdue. Please submit immediately.'
                : 'Your quarterly mileage entry is due soon. Please submit within the next week.'
              }
            </p>
          </div>
        )}

        <button
          onClick={onNavigateToMileage}
          className={`w-full mt-4 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            overdue
              ? 'bg-red-600 text-white hover:bg-red-700'
              : dueSoon
              ? 'bg-yellow-600 text-white hover:bg-yellow-700'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Submit Mileage Entry
        </button>
      </div>
    </div>
  );
}