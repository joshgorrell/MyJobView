import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { MapPin, Navigation, Battery, Clock, Activity, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface TechnicianLocation {
  technician_id: string;
  technician_name: string;
  technician_role: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  captured_at: string;
  battery_level: number;
  device_model: string;
  status: string;
  clock_entry_id: string;
  clock_in_time: string;
}

export function RealTimeLocationDashboard() {
  const { profile } = useAuth();
  const [technicianLocations, setTechnicianLocations] = useState<TechnicianLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTech, setSelectedTech] = useState<TechnicianLocation | null>(null);
  const [mapCenter, setMapCenter] = useState({ lat: 39.0, lng: -95.7 }); // Default to Kansas

  useEffect(() => {
    loadActiveTechnicians();

    const interval = setInterval(loadActiveTechnicians, 10000); // Update every 10 seconds

    // Subscribe to real-time breadcrumb updates
    const subscription = supabase
      .channel('location-updates')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'enhanced_gps_breadcrumbs',
      }, () => {
        loadActiveTechnicians();
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      subscription.unsubscribe();
    };
  }, []);

  async function loadActiveTechnicians() {
    try {
      // Get latest location for each active technician
      const { data, error } = await supabase.rpc('get_latest_technician_locations');

      if (error) throw error;

      setTechnicianLocations(data || []);

      // Center map on technicians
      if (data && data.length > 0) {
        const avgLat = data.reduce((sum: number, t: any) => sum + t.latitude, 0) / data.length;
        const avgLng = data.reduce((sum: number, t: any) => sum + t.longitude, 0) / data.length;
        setMapCenter({ lat: avgLat, lng: avgLng });
      }
    } catch (error) {
      console.error('Error loading technician locations:', error);
    } finally {
      setLoading(false);
    }
  }

  function getTimeSince(timestamp: string): string {
    const now = new Date();
    const then = new Date(timestamp);
    const diff = now.getTime() - then.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  function getAccuracyColor(accuracy: number): string {
    if (accuracy < 10) return 'text-green-600 bg-green-100';
    if (accuracy < 50) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  }

  function getBatteryColor(level: number): string {
    if (level > 0.5) return 'text-green-600';
    if (level > 0.2) return 'text-yellow-600';
    return 'text-red-600';
  }

  function getLocationQuality(accuracy: number): string {
    if (accuracy < 10) return 'Excellent';
    if (accuracy < 25) return 'Good';
    if (accuracy < 50) return 'Fair';
    return 'Poor';
  }

  if (!profile || !['admin', 'owner', 'dispatch', 'manager', 'production_manager', 'service_manager'].includes(profile.role)) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Access Denied</h3>
        <p className="text-gray-600">You don't have permission to view real-time locations.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading technician locations...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Live Technician Tracking</h2>
          <p className="text-sm text-gray-600 mt-1">
            Real-time GPS locations · Updates every 10 seconds
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-xl">
            <Activity className="w-5 h-5 text-green-600 animate-pulse" />
            <span className="font-semibold text-green-900">{technicianLocations.length} Active</span>
          </div>
        </div>
      </div>

      {/* Map Placeholder - In production, use Google Maps or Mapbox */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-blue-100">
            {/* Simple map representation */}
            <div className="absolute inset-0 flex items-center justify-center">
              <MapPin className="w-16 h-16 text-blue-500 opacity-50" />
            </div>
            {/* Technician markers */}
            {technicianLocations.map((tech, idx) => (
              <div
                key={tech.technician_id}
                className="absolute"
                style={{
                  left: `${20 + (idx * 15)}%`,
                  top: `${30 + (idx % 3) * 20}%`,
                }}
              >
                <button
                  onClick={() => setSelectedTech(tech)}
                  className="relative group"
                >
                  <div className="absolute -inset-2 bg-blue-500 rounded-full animate-ping opacity-75"></div>
                  <div className="relative w-10 h-10 bg-blue-600 rounded-full border-4 border-white shadow-lg flex items-center justify-center cursor-pointer hover:scale-110 transition-transform">
                    <Navigation className="w-5 h-5 text-white" />
                  </div>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-1 bg-gray-900 text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                    {tech.technician_name}
                  </div>
                </button>
              </div>
            ))}
          </div>
          <div className="relative text-gray-500 text-sm">
            📍 Interactive map view (integrate Google Maps API for production)
          </div>
        </div>
      </div>

      {/* Technician List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {technicianLocations.map(tech => (
          <div
            key={tech.technician_id}
            className={`bg-white rounded-xl shadow-sm border-2 transition-all cursor-pointer ${
              selectedTech?.technician_id === tech.technician_id
                ? 'border-blue-500 shadow-lg'
                : 'border-gray-200 hover:border-blue-300'
            }`}
            onClick={() => setSelectedTech(tech)}
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">{tech.technician_name}</h3>
                  <p className="text-sm text-gray-600 capitalize">{tech.technician_role.replace('_', ' ')}</p>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-semibold ${getAccuracyColor(tech.accuracy)}`}>
                  {getLocationQuality(tech.accuracy)}
                </div>
              </div>

              {/* Location Details */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-gray-600 text-xs mb-1">
                    <MapPin className="w-4 h-4" />
                    <span>Accuracy</span>
                  </div>
                  <div className="font-bold text-gray-900">{tech.accuracy.toFixed(0)}m</div>
                </div>

                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-gray-600 text-xs mb-1">
                    <Clock className="w-4 h-4" />
                    <span>Last Update</span>
                  </div>
                  <div className="font-bold text-gray-900">{getTimeSince(tech.captured_at)}</div>
                </div>

                {tech.speed !== null && tech.speed > 0 && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-gray-600 text-xs mb-1">
                      <Navigation className="w-4 h-4" />
                      <span>Speed</span>
                    </div>
                    <div className="font-bold text-gray-900">{(tech.speed * 2.237).toFixed(0)} mph</div>
                  </div>
                )}

                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-gray-600 text-xs mb-1">
                    <Battery className={`w-4 h-4 ${getBatteryColor(tech.battery_level)}`} />
                    <span>Battery</span>
                  </div>
                  <div className={`font-bold ${getBatteryColor(tech.battery_level)}`}>
                    {Math.round(tech.battery_level * 100)}%
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between text-xs text-gray-600 pt-4 border-t border-gray-200">
                <div>
                  <div>Clocked in: {new Date(tech.clock_in_time).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}</div>
                  <div className="mt-1">
                    Worked: {(() => {
                      const diff = new Date().getTime() - new Date(tech.clock_in_time).getTime();
                      const hours = Math.floor(diff / 3600000);
                      const minutes = Math.floor((diff % 3600000) / 60000);
                      return `${hours}h ${minutes}m`;
                    })()}
                  </div>
                </div>
                <div className="text-right">
                  <div>{tech.device_model}</div>
                  <div className="mt-1">{tech.latitude.toFixed(5)}, {tech.longitude.toFixed(5)}</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {technicianLocations.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-12 text-center">
          <MapPin className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Active Technicians</h3>
          <p className="text-gray-600">
            No technicians are currently clocked in with GPS tracking enabled.
          </p>
        </div>
      )}
    </div>
  );
}
