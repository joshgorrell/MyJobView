import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Car, Plus, CreditCard as Edit, Trash2, User, Calendar, TrendingUp, AlertCircle, Gauge } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  vin: string | null;
  license_plate: string | null;
  color: string | null;
  initial_mileage: number;
  purchase_date: string | null;
  status: 'active' | 'maintenance' | 'retired';
  notes: string | null;
}

interface VehicleAssignment {
  id: string;
  vehicle_id: string;
  user_id: string;
  assigned_date: string;
  end_date: string | null;
  is_active: boolean;
  notes: string | null;
  user?: {
    full_name: string;
    email: string;
  };
}

interface MileageEntry {
  id: string;
  vehicle_id: string;
  odometer_reading: number;
  entry_date: string;
  notes: string | null;
  user?: {
    full_name: string;
  };
}

export default function VehicleManagement() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [assignments, setAssignments] = useState<VehicleAssignment[]>([]);
  const [mileageEntries, setMileageEntries] = useState<MileageEntry[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'vehicles' | 'assignments' | 'mileage'>('vehicles');
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [showAssignmentForm, setShowAssignmentForm] = useState(false);
  const [confirmDeleteVehicleId, setConfirmDeleteVehicleId] = useState<string | null>(null);
  const [confirmEndAssignmentId, setConfirmEndAssignmentId] = useState<string | null>(null);
  const [showMileageModal, setShowMileageModal] = useState(false);
  const [mileageForm, setMileageForm] = useState({ vehicle_id: '', odometer_reading: '' });
  const [mileageSaving, setMileageSaving] = useState(false);
  const [mileageError, setMileageError] = useState('');

  const [vehicleForm, setVehicleForm] = useState({
    make: '',
    model: '',
    year: new Date().getFullYear(),
    vin: '',
    license_plate: '',
    color: '',
    initial_mileage: 0,
    purchase_date: '',
    status: 'active' as 'active' | 'maintenance' | 'retired',
    notes: '',
  });

  const [assignmentForm, setAssignmentForm] = useState({
    vehicle_id: '',
    user_id: '',
    assigned_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadVehicles(),
        loadAssignments(),
        loadMileageEntries(),
        loadUsers(),
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadVehicles = async () => {
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading vehicles:', error);
    } else {
      setVehicles(data || []);
    }
  };

  const loadAssignments = async () => {
    const { data, error } = await supabase
      .from('vehicle_assignments')
      .select(`
        *,
        user:profiles(full_name, email)
      `)
      .order('assigned_date', { ascending: false });

    if (error) {
      console.error('Error loading assignments:', error);
    } else {
      setAssignments(data || []);
    }
  };

  const loadMileageEntries = async () => {
    const { data, error } = await supabase
      .from('mileage_entries')
      .select(`
        *,
        user:profiles(full_name)
      `)
      .order('entry_date', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error loading mileage entries:', error);
    } else {
      setMileageEntries(data || []);
    }
  };

  const loadUsers = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('is_active', true)
      .order('full_name');

    if (error) {
      console.error('Error loading users:', error);
    } else {
      setUsers(data || []);
    }
  };

  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const vehicleData = {
        ...vehicleForm,
        organization_id: user.id,
        vin: vehicleForm.vin || null,
        license_plate: vehicleForm.license_plate || null,
        color: vehicleForm.color || null,
        purchase_date: vehicleForm.purchase_date || null,
        notes: vehicleForm.notes || null,
      };

      if (selectedVehicle) {
        const { error } = await supabase
          .from('vehicles')
          .update(vehicleData)
          .eq('id', selectedVehicle.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('vehicles')
          .insert([vehicleData]);

        if (error) throw error;
      }

      setShowVehicleForm(false);
      setSelectedVehicle(null);
      resetVehicleForm();
      loadVehicles();
    } catch (error) {
      console.error('Error saving vehicle:', error);
      alert('Error saving vehicle. Please try again.');
    }
  };

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { error } = await supabase
        .from('vehicle_assignments')
        .insert([{
          ...assignmentForm,
          is_active: true,
        }]);

      if (error) throw error;

      setShowAssignmentForm(false);
      resetAssignmentForm();
      loadAssignments();
    } catch (error) {
      console.error('Error saving assignment:', error);
      alert('Error saving assignment. Please try again.');
    }
  };

  const handleEndAssignment = async (assignmentId: string) => {
    try {
      const { error } = await supabase
        .from('vehicle_assignments')
        .update({
          is_active: false,
          end_date: new Date().toISOString().split('T')[0],
        })
        .eq('id', assignmentId);

      if (error) throw error;
      loadAssignments();
    } catch (error) {
      console.error('Error ending assignment:', error);
      alert('Error ending assignment. Please try again.');
    }
  };

  const handleDeleteVehicle = async (vehicleId: string) => {
    try {
      const { error } = await supabase
        .from('vehicles')
        .delete()
        .eq('id', vehicleId);

      if (error) throw error;
      loadVehicles();
    } catch (error) {
      console.error('Error deleting vehicle:', error);
      alert('Error deleting vehicle. Please try again.');
    }
  };

  const handleLogMileage = async (e: React.FormEvent) => {
    e.preventDefault();
    setMileageSaving(true);
    setMileageError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const reading = parseInt(mileageForm.odometer_reading);
      if (isNaN(reading) || reading < 0) throw new Error('Please enter a valid odometer reading');

      const { error } = await supabase
        .from('mileage_entries')
        .insert([{
          vehicle_id: mileageForm.vehicle_id,
          user_id: user.id,
          odometer_reading: reading,
          entry_date: new Date().toISOString().split('T')[0],
        }]);

      if (error) throw error;

      setShowMileageModal(false);
      setMileageForm({ vehicle_id: '', odometer_reading: '' });
      loadMileageEntries();
    } catch (error: any) {
      setMileageError(error.message || 'Error saving entry. Please try again.');
    } finally {
      setMileageSaving(false);
    }
  };

  const resetVehicleForm = () => {
    setVehicleForm({
      make: '',
      model: '',
      year: new Date().getFullYear(),
      vin: '',
      license_plate: '',
      color: '',
      initial_mileage: 0,
      purchase_date: '',
      status: 'active',
      notes: '',
    });
  };

  const resetAssignmentForm = () => {
    setAssignmentForm({
      vehicle_id: '',
      user_id: '',
      assigned_date: new Date().toISOString().split('T')[0],
      notes: '',
    });
  };

  const editVehicle = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setVehicleForm({
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      vin: vehicle.vin || '',
      license_plate: vehicle.license_plate || '',
      color: vehicle.color || '',
      initial_mileage: vehicle.initial_mileage,
      purchase_date: vehicle.purchase_date || '',
      status: vehicle.status,
      notes: vehicle.notes || '',
    });
    setShowVehicleForm(true);
  };

  const assignVehicle = (vehicleId: string) => {
    setAssignmentForm({
      vehicle_id: vehicleId,
      user_id: '',
      assigned_date: new Date().toISOString().split('T')[0],
      notes: '',
    });
    setShowAssignmentForm(true);
  };

  const getVehicleInfo = (vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return 'Unknown Vehicle';
    return `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.license_plate ? ` (${vehicle.license_plate})` : ''}`;
  };

  const getLatestMileage = (vehicleId: string) => {
    const entries = mileageEntries.filter(e => e.vehicle_id === vehicleId);
    if (entries.length === 0) return null;
    return entries[0].odometer_reading;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'maintenance': return 'bg-yellow-100 text-yellow-800';
      case 'retired': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading vehicles...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Vehicle Tracking</h2>
          <p className="text-sm text-gray-300 mt-1">Manage fleet vehicles and mileage tracking</p>
        </div>
        <div className="flex gap-2">
          {activeTab === 'vehicles' && (
            <button
              onClick={() => {
                resetVehicleForm();
                setSelectedVehicle(null);
                setShowVehicleForm(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              Add Vehicle
            </button>
          )}
          {activeTab === 'assignments' && (
            <button
              onClick={() => {
                resetAssignmentForm();
                setShowAssignmentForm(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              Assign Vehicle
            </button>
          )}
          {activeTab === 'mileage' && (
            <button
              onClick={() => {
                setMileageForm({ vehicle_id: vehicles.length === 1 ? vehicles[0].id : '', odometer_reading: '' });
                setMileageError('');
                setShowMileageModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Gauge className="w-4 h-4" />
              Log Mileage
            </button>
          )}
        </div>
      </div>

      <div className="border-b border-gray-200">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('vehicles')}
            className={`px-4 py-2 border-b-2 font-medium ${
              activeTab === 'vehicles'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <Car className="w-4 h-4" />
              Vehicles ({vehicles.length})
            </div>
          </button>
          <button
            onClick={() => setActiveTab('assignments')}
            className={`px-4 py-2 border-b-2 font-medium ${
              activeTab === 'assignments'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <User className="w-4 h-4" />
              Assignments ({assignments.filter(a => a.is_active).length} active)
            </div>
          </button>
          <button
            onClick={() => setActiveTab('mileage')}
            className={`px-4 py-2 border-b-2 font-medium ${
              activeTab === 'mileage'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Mileage History ({mileageEntries.length})
            </div>
          </button>
        </div>
      </div>

      {activeTab === 'vehicles' && (
        <div className="space-y-4">
          {vehicles.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <Car className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No vehicles added yet</p>
              <button
                onClick={() => setShowVehicleForm(true)}
                className="mt-4 text-blue-600 hover:text-blue-700 font-medium"
              >
                Add your first vehicle
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {vehicles.map((vehicle) => {
                const activeAssignment = assignments.find(a => a.vehicle_id === vehicle.id && a.is_active);
                const latestMileage = getLatestMileage(vehicle.id);

                return (
                  <div key={vehicle.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                          <Car className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">
                            {vehicle.year} {vehicle.make} {vehicle.model}
                          </h3>
                          <p className="text-sm text-gray-500">
                            {vehicle.license_plate || 'No plate'}
                          </p>
                        </div>
                      </div>
                      <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(vehicle.status)}`}>
                        {vehicle.status}
                      </span>
                    </div>

                    <div className="space-y-2 mb-4">
                      {vehicle.vin && (
                        <div className="text-xs text-gray-600">
                          <span className="font-medium">VIN:</span> {vehicle.vin}
                        </div>
                      )}
                      {vehicle.color && (
                        <div className="text-xs text-gray-600">
                          <span className="font-medium">Color:</span> {vehicle.color}
                        </div>
                      )}
                      <div className="text-xs text-gray-600">
                        <span className="font-medium">Initial Mileage:</span> {vehicle.initial_mileage.toLocaleString()} mi
                      </div>
                      {latestMileage && (
                        <div className="text-xs text-gray-600">
                          <span className="font-medium">Current Mileage:</span> {latestMileage.toLocaleString()} mi
                        </div>
                      )}
                    </div>

                    {activeAssignment && (
                      <div className="bg-green-50 border border-green-200 rounded p-2 mb-3">
                        <div className="flex items-center gap-2 text-xs text-green-800">
                          <User className="w-3 h-3" />
                          <span className="font-medium">Assigned to:</span>
                          <span>{activeAssignment.user?.full_name}</span>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <button
                        onClick={() => assignVehicle(vehicle.id)}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700"
                      >
                        <User className="w-4 h-4" />
                        {activeAssignment ? 'Reassign Vehicle' : 'Assign Vehicle'}
                      </button>
                      <div className="flex gap-2">
                        <button
                          onClick={() => editVehicle(vehicle)}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                        >
                          <Edit className="w-4 h-4" />
                          Edit
                        </button>
                        <button
                          onClick={() => setConfirmDeleteVehicleId(vehicle.id)}
                          className="flex items-center justify-center gap-2 px-3 py-2 text-sm text-red-600 bg-red-50 rounded hover:bg-red-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'assignments' && (
        <div className="space-y-4">
          {assignments.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <User className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No vehicle assignments yet</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vehicle</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned To</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Start Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">End Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {assignments.map((assignment) => (
                    <tr key={assignment.id} className={!assignment.is_active ? 'bg-gray-50 opacity-60' : ''}>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {getVehicleInfo(assignment.vehicle_id)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div>
                          <div className="font-medium text-gray-900">{assignment.user?.full_name}</div>
                          <div className="text-gray-500 text-xs">{assignment.user?.email}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(assignment.assigned_date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {assignment.end_date ? new Date(assignment.end_date).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 text-xs font-medium rounded ${
                          assignment.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {assignment.is_active ? 'Active' : 'Ended'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        {assignment.is_active && (
                          <button
                            onClick={() => setConfirmEndAssignmentId(assignment.id)}
                            className="text-red-600 hover:text-red-700 text-sm font-medium"
                          >
                            End Assignment
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'mileage' && (
        <div className="space-y-4">
          {mileageEntries.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <TrendingUp className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No mileage entries yet</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vehicle</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Submitted By</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Odometer</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {mileageEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {getVehicleInfo(entry.vehicle_id)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {entry.user?.full_name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(entry.entry_date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                        {entry.odometer_reading.toLocaleString()} mi
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {entry.notes || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showVehicleForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4">
                {selectedVehicle ? 'Edit Vehicle' : 'Add New Vehicle'}
              </h3>
              <form onSubmit={handleSaveVehicle} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Make *
                    </label>
                    <input
                      type="text"
                      required
                      value={vehicleForm.make}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, make: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Toyota"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Model *
                    </label>
                    <input
                      type="text"
                      required
                      value={vehicleForm.model}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Camry"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Year *
                    </label>
                    <input
                      type="number"
                      required
                      min="1900"
                      max="2100"
                      value={vehicleForm.year}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, year: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      License Plate
                    </label>
                    <input
                      type="text"
                      value={vehicleForm.license_plate}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, license_plate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="ABC-1234 (optional)"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      VIN
                    </label>
                    <input
                      type="text"
                      value={vehicleForm.vin}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, vin: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="1HGBH41JXMN109186"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Color
                    </label>
                    <input
                      type="text"
                      value={vehicleForm.color}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, color: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Silver"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Initial Mileage *
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={vehicleForm.initial_mileage}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, initial_mileage: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Purchase Date
                    </label>
                    <input
                      type="date"
                      value={vehicleForm.purchase_date}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, purchase_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status *
                  </label>
                  <select
                    required
                    value={vehicleForm.status}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, status: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="active">Active</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="retired">Retired</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes
                  </label>
                  <textarea
                    value={vehicleForm.notes}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, notes: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Additional notes about this vehicle..."
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowVehicleForm(false);
                      setSelectedVehicle(null);
                      resetVehicleForm();
                    }}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    {selectedVehicle ? 'Update Vehicle' : 'Add Vehicle'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {showAssignmentForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-lg w-full">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4">Assign Vehicle to User</h3>
              <form onSubmit={handleSaveAssignment} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vehicle *
                  </label>
                  <select
                    required
                    value={assignmentForm.vehicle_id}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, vehicle_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select a vehicle</option>
                    {vehicles.filter(v => v.status === 'active').map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.year} {vehicle.make} {vehicle.model}{vehicle.license_plate ? ` (${vehicle.license_plate})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Assign To *
                  </label>
                  <select
                    required
                    value={assignmentForm.user_id}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, user_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select a user</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.full_name} ({user.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Assignment Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={assignmentForm.assigned_date}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, assigned_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes
                  </label>
                  <textarea
                    value={assignmentForm.notes}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, notes: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Assignment notes..."
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAssignmentForm(false);
                      resetAssignmentForm();
                    }}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Assign Vehicle
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {showMileageModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Gauge className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Log Mileage</h3>
              </div>

              <form onSubmit={handleLogMileage} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle *</label>
                  <select
                    required
                    value={mileageForm.vehicle_id}
                    onChange={(e) => setMileageForm({ ...mileageForm, vehicle_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                  >
                    <option value="">Select a vehicle</option>
                    {vehicles.filter(v => v.status !== 'retired').map((vehicle) => {
                      const activeAssignment = assignments.find(a => a.vehicle_id === vehicle.id && a.is_active);
                      return (
                        <option key={vehicle.id} value={vehicle.id}>
                          {vehicle.year} {vehicle.make} {vehicle.model}
                          {vehicle.license_plate ? ` (${vehicle.license_plate})` : ''}
                          {activeAssignment?.user?.full_name ? ` — ${activeAssignment.user.full_name}` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Odometer Reading (miles) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={mileageForm.odometer_reading}
                    onChange={(e) => setMileageForm({ ...mileageForm, odometer_reading: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 text-lg font-medium"
                    placeholder="e.g. 45230"
                    autoFocus
                  />
                  {mileageForm.vehicle_id && (
                    <p className="text-xs text-gray-500 mt-1">
                      Last recorded:{' '}
                      {(() => {
                        const last = getLatestMileage(mileageForm.vehicle_id);
                        return last ? `${last.toLocaleString()} mi` : 'no entries yet';
                      })()}
                    </p>
                  )}
                </div>

                {mileageError && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {mileageError}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowMileageModal(false);
                      setMileageError('');
                    }}
                    className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={mileageSaving}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {mileageSaving ? 'Saving...' : 'Save Entry'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmEndAssignmentId !== null}
        title="End Vehicle Assignment"
        message="End this vehicle assignment?"
        variant="warning"
        confirmLabel="End Assignment"
        onConfirm={() => {
          if (confirmEndAssignmentId) handleEndAssignment(confirmEndAssignmentId);
          setConfirmEndAssignmentId(null);
        }}
        onCancel={() => setConfirmEndAssignmentId(null)}
      />

      <ConfirmModal
        isOpen={confirmDeleteVehicleId !== null}
        title="Delete Vehicle"
        message="Are you sure you want to delete this vehicle? This will also delete all assignments and mileage entries."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirmDeleteVehicleId) handleDeleteVehicle(confirmDeleteVehicleId);
          setConfirmDeleteVehicleId(null);
        }}
        onCancel={() => setConfirmDeleteVehicleId(null)}
      />
    </div>
  );
}