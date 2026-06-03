import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Car, Camera, Upload, AlertCircle, CheckCircle, Calendar } from 'lucide-react';

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  license_plate: string;
  initial_mileage: number;
}

interface Assignment {
  id: string;
  vehicle: Vehicle;
  assigned_date: string;
}

interface MileageEntry {
  id: string;
  vehicle_id: string;
  odometer_reading: number;
  entry_date: string;
  notes: string | null;
  created_at: string;
}

interface MileageReminder {
  id: string;
  vehicle_id: string;
  due_date: string;
  status: string;
}

export default function MileageEntryForm() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [mileageEntries, setMileageEntries] = useState<MileageEntry[]>([]);
  const [reminders, setReminders] = useState<MileageReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [odometerReading, setOdometerReading] = useState<string>('');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [assignmentsResult, entriesResult, remindersResult] = await Promise.all([
        supabase
          .from('vehicle_assignments')
          .select(`
            id,
            assigned_date,
            vehicle:vehicles(
              id,
              make,
              model,
              year,
              license_plate,
              initial_mileage
            )
          `)
          .eq('user_id', user.id)
          .eq('is_active', true),
        supabase
          .from('mileage_entries')
          .select('*')
          .eq('user_id', user.id)
          .order('entry_date', { ascending: false })
          .limit(10),
        supabase
          .from('mileage_reminders')
          .select('*')
          .eq('user_id', user.id)
          .in('status', ['pending', 'sent', 'overdue'])
      ]);

      if (assignmentsResult.data) {
        setAssignments(assignmentsResult.data as Assignment[]);
        if (assignmentsResult.data.length > 0) {
          setSelectedVehicleId(assignmentsResult.data[0].vehicle.id);
        }
      }
      if (entriesResult.data) setMileageEntries(entriesResult.data);
      if (remindersResult.data) setReminders(remindersResult.data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadPhoto = async (userId: string, vehicleId: string): Promise<string | null> => {
    if (!photoFile) return null;

    const fileExt = photoFile.name.split('.').pop();
    const fileName = `${userId}/${vehicleId}/${Date.now()}.${fileExt}`;

    const { error: uploadError, data } = await supabase.storage
      .from('odometer-photos')
      .upload(fileName, photoFile);

    if (uploadError) {
      console.error('Error uploading photo:', uploadError);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('odometer-photos')
      .getPublicUrl(fileName);

    return publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const reading = parseInt(odometerReading);
      if (isNaN(reading) || reading < 0) {
        throw new Error('Please enter a valid odometer reading');
      }

      const vehicle = assignments.find(a => a.vehicle.id === selectedVehicleId)?.vehicle;
      if (!vehicle) throw new Error('Vehicle not found');

      const lastEntry = mileageEntries.find(e => e.vehicle_id === selectedVehicleId);
      const minimumReading = lastEntry?.odometer_reading || vehicle.initial_mileage;

      if (reading < minimumReading) {
        throw new Error(`Odometer reading must be at least ${minimumReading.toLocaleString()} mi (last recorded mileage)`);
      }

      let photoUrl = null;
      if (photoFile) {
        photoUrl = await uploadPhoto(user.id, selectedVehicleId);
      }

      const { error: insertError } = await supabase
        .from('mileage_entries')
        .insert([{
          vehicle_id: selectedVehicleId,
          user_id: user.id,
          odometer_reading: reading,
          entry_date: entryDate,
          photo_url: photoUrl,
          notes: notes || null,
        }]);

      if (insertError) throw insertError;

      setSuccessMessage('Mileage entry submitted successfully! Your next reminder will be in 3 months.');
      setOdometerReading('');
      setNotes('');
      setPhotoFile(null);
      setPhotoPreview('');
      setEntryDate(new Date().toISOString().split('T')[0]);

      loadData();

      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (error: any) {
      console.error('Error submitting mileage:', error);
      setErrorMessage(error.message || 'Error submitting mileage. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const getVehicleInfo = (vehicle: Vehicle) => {
    return `${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.license_plate})`;
  };

  const getLastMileage = (vehicleId: string) => {
    const entry = mileageEntries.find(e => e.vehicle_id === vehicleId);
    return entry?.odometer_reading || null;
  };

  const getDaysSinceLastEntry = (vehicleId: string) => {
    const entry = mileageEntries.find(e => e.vehicle_id === vehicleId);
    if (!entry) {
      const assignment = assignments.find(a => a.vehicle.id === vehicleId);
      if (!assignment) return null;
      const assignedDate = new Date(assignment.assigned_date);
      const today = new Date();
      return Math.floor((today.getTime() - assignedDate.getTime()) / (1000 * 60 * 60 * 24));
    }
    const entryDate = new Date(entry.entry_date);
    const today = new Date();
    return Math.floor((today.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
  };

  const isOverdue = (vehicleId: string) => {
    const days = getDaysSinceLastEntry(vehicleId);
    return days !== null && days > 90;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading vehicle information...</div>
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
        <Car className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Vehicle Assigned</h3>
        <p className="text-gray-500">
          You don't have any vehicles assigned to you. Contact your administrator if you need a vehicle assignment.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Vehicle Mileage Entry</h2>
        <p className="text-sm text-gray-500 mt-1">Submit your quarterly mileage reading</p>
      </div>

      {assignments.map((assignment) => {
        const vehicle = assignment.vehicle;
        const lastMileage = getLastMileage(vehicle.id);
        const daysSince = getDaysSinceLastEntry(vehicle.id);
        const overdue = isOverdue(vehicle.id);

        return (
          <div key={assignment.id} className={`bg-white border-2 rounded-lg p-6 ${
            overdue ? 'border-red-300 bg-red-50' : 'border-gray-200'
          }`}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                  overdue ? 'bg-red-100' : 'bg-blue-100'
                }`}>
                  <Car className={`w-6 h-6 ${overdue ? 'text-red-600' : 'text-blue-600'}`} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{getVehicleInfo(vehicle)}</h3>
                  <p className="text-sm text-gray-500">Assigned {new Date(assignment.assigned_date).toLocaleDateString()}</p>
                </div>
              </div>
              {overdue && (
                <span className="px-3 py-1 bg-red-100 text-red-800 text-sm font-medium rounded-full flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  Overdue
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Last Recorded Mileage</div>
                <div className="text-lg font-semibold text-gray-900">
                  {lastMileage ? `${lastMileage.toLocaleString()} mi` : `${vehicle.initial_mileage.toLocaleString()} mi (Initial)`}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Days Since Last Entry</div>
                <div className={`text-lg font-semibold ${overdue ? 'text-red-600' : 'text-gray-900'}`}>
                  {daysSince !== null ? `${daysSince} days` : 'N/A'}
                </div>
              </div>
            </div>

            {selectedVehicleId === vehicle.id && (
              <form onSubmit={handleSubmit} className="space-y-4 border-t border-gray-200 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Current Odometer Reading (miles) *
                    </label>
                    <input
                      type="number"
                      required
                      min={lastMileage || vehicle.initial_mileage}
                      value={odometerReading}
                      onChange={(e) => setOdometerReading(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter current mileage"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Must be at least {(lastMileage || vehicle.initial_mileage).toLocaleString()} mi
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={entryDate}
                      onChange={(e) => setEntryDate(e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Odometer Photo (Recommended)
                  </label>
                  <div className="mt-1">
                    {photoPreview ? (
                      <div className="relative">
                        <img
                          src={photoPreview}
                          alt="Odometer preview"
                          className="w-full h-48 object-cover rounded-lg border border-gray-300"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setPhotoFile(null);
                            setPhotoPreview('');
                          }}
                          className="absolute top-2 right-2 px-3 py-1 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer hover:bg-gray-50">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <Camera className="w-8 h-8 text-gray-400 mb-2" />
                          <p className="text-sm text-gray-500">
                            <span className="font-semibold">Click to upload</span> or drag and drop
                          </p>
                          <p className="text-xs text-gray-500">PNG, JPG up to 10MB</p>
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handlePhotoChange}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Any observations about the vehicle..."
                  />
                </div>

                {errorMessage && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <p className="text-sm">{errorMessage}</p>
                  </div>
                )}

                {successMessage && (
                  <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700">
                    <CheckCircle className="w-5 h-5 flex-shrink-0" />
                    <p className="text-sm">{successMessage}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5" />
                      Submit Mileage Entry
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        );
      })}

      {mileageEntries.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Recent Mileage History</h3>
          </div>
          <div className="divide-y divide-gray-200">
            {mileageEntries.slice(0, 5).map((entry) => {
              const vehicle = assignments.find(a => a.vehicle.id === entry.vehicle_id)?.vehicle;
              if (!vehicle) return null;

              return (
                <div key={entry.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-900">{getVehicleInfo(vehicle)}</div>
                      <div className="text-sm text-gray-500 flex items-center gap-2 mt-1">
                        <Calendar className="w-4 h-4" />
                        {new Date(entry.entry_date).toLocaleDateString()}
                      </div>
                      {entry.notes && (
                        <div className="text-sm text-gray-600 mt-1">{entry.notes}</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-gray-900">
                        {entry.odometer_reading.toLocaleString()} mi
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Submitted {new Date(entry.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}