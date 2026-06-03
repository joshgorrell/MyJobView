import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { MapPin, Navigation, Battery, Clock, RefreshCw } from 'lucide-react';

interface TechLocation {
  id: string;
  technician_id: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  timestamp: string;
  battery_level: number | null;
  is_active: boolean;
  technician: {
    full_name: string;
    role: string;
  };
  status?: {
    status: string;
    current_appointment_id: string | null;
    notes: string | null;
  };
}

declare global {
  interface Window {
    google: any;
    initMap: () => void;
  }
}

export function TechMap() {
  const [techLocations, setTechLocations] = useState<TechLocation[]>([]);
  const [selectedTech, setSelectedTech] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const initRetryCount = useRef(0);

  useEffect(() => {
    loadApiKey();
    loadTechLocations();

    const interval = setInterval(() => {
      loadTechLocations();
    }, 30000); // Refresh every 30 seconds

    const locationsChannel = supabase
      .channel('tech-locations')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'gps_breadcrumbs'
      }, () => {
        loadTechLocations();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'daily_clock_entries'
      }, () => {
        loadTechLocations();
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      locationsChannel.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (apiKey && !mapReady) {
      console.log('Initiating Google Maps load...');
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        loadGoogleMaps();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [apiKey, mapReady]);

  useEffect(() => {
    if (mapReady) {
      updateMarkers();
    }
  }, [techLocations, mapReady]);

  useEffect(() => {
    if (selectedTech && googleMapRef.current) {
      const tech = techLocations.find(t => t.technician_id === selectedTech);
      if (tech) {
        googleMapRef.current.panTo({ lat: tech.latitude, lng: tech.longitude });
        googleMapRef.current.setZoom(15);
        const marker = markersRef.current.get(selectedTech);
        if (marker && marker.infoWindow) {
          marker.infoWindow.open(googleMapRef.current, marker);
        }
      }
    }
  }, [selectedTech]);

  async function loadApiKey() {
    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('google_maps_api_key')
        .maybeSingle();

      if (error) throw error;
      if (data?.google_maps_api_key) {
        console.log('Google Maps API key loaded');
        setApiKey(data.google_maps_api_key);
      } else {
        console.warn('No Google Maps API key found in settings');
      }
    } catch (error) {
      console.error('Error loading API key:', error);
    }
  }

  function loadGoogleMaps() {
    if (!apiKey) {
      console.error('No API key available for Google Maps');
      return;
    }

    if (window.google && window.google.maps) {
      initializeMap();
      return;
    }

    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      existingScript.addEventListener('load', initializeMap);
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      console.log('Google Maps script loaded successfully');
      initializeMap();
    };
    script.onerror = (error) => {
      console.error('Failed to load Google Maps script:', error);
      console.error('Check if the API key is valid and has Maps JavaScript API enabled');
    };
    document.head.appendChild(script);
  }

  function initializeMap() {
    if (!mapRef.current) {
      if (initRetryCount.current < 20) {
        initRetryCount.current++;
        console.log(`Map container not ready, retrying (${initRetryCount.current}/20)...`);
        setTimeout(initializeMap, 100);
        return;
      } else {
        console.error('Map container never became ready after 20 retries');
        return;
      }
    }
    if (!window.google) {
      if (initRetryCount.current < 20) {
        initRetryCount.current++;
        console.log(`Google Maps API not ready, retrying (${initRetryCount.current}/20)...`);
        setTimeout(initializeMap, 100);
        return;
      } else {
        console.error('Google Maps API never loaded after 20 retries');
        return;
      }
    }

    // Reset retry count on successful init
    initRetryCount.current = 0;

    try {
      const map = new window.google.maps.Map(mapRef.current, {
        zoom: 10,
        center: { lat: 39.8283, lng: -98.5795 },
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: true,
        zoomControl: true,
      });

      googleMapRef.current = map;
      setMapReady(true);
      console.log('Google Maps initialized successfully');
    } catch (error) {
      console.error('Error initializing Google Maps:', error);
    }
  }

  function getMarkerColor(status?: string): string {
    switch (status) {
      case 'available':
        return '#10b981'; // green
      case 'on_job':
        return '#3b82f6'; // blue
      case 'break':
        return '#f59e0b'; // yellow
      case 'unavailable':
        return '#ef4444'; // red
      default:
        return '#6b7280'; // gray
    }
  }

  function updateMarkers() {
    if (!googleMapRef.current || !window.google) {
      console.log('Map not ready for markers');
      return;
    }

    console.log(`Updating markers for ${techLocations.length} technicians`);

    const existingMarkers = new Set(markersRef.current.keys());
    const currentTechs = new Set<string>();

    techLocations.forEach(tech => {
      currentTechs.add(tech.technician_id);
      const position = { lat: tech.latitude, lng: tech.longitude };

      if (markersRef.current.has(tech.technician_id)) {
        const marker = markersRef.current.get(tech.technician_id);
        marker.setPosition(position);
        marker.setIcon({
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: getMarkerColor(tech.status?.status),
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        });
      } else {
        const marker = new window.google.maps.Marker({
          position,
          map: googleMapRef.current,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: getMarkerColor(tech.status?.status),
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
          title: tech.technician.full_name,
        });

        const infoWindow = new window.google.maps.InfoWindow({
          content: `
            <div style="padding: 8px; min-width: 200px;">
              <h3 style="font-weight: bold; margin: 0 0 8px 0; color: #111;">${tech.technician.full_name}</h3>
              <div style="font-size: 14px; color: #666; margin-bottom: 4px;">
                <strong>Status:</strong> ${tech.status?.status?.replace('_', ' ') || 'Unknown'}
              </div>
              <div style="font-size: 14px; color: #666; margin-bottom: 4px;">
                <strong>Location:</strong> ${tech.latitude.toFixed(6)}, ${tech.longitude.toFixed(6)}
              </div>
              ${tech.speed && tech.speed > 0 ? `
                <div style="font-size: 14px; color: #666; margin-bottom: 4px;">
                  <strong>Speed:</strong> ${Math.round(tech.speed)} mph
                </div>
              ` : ''}
              <div style="font-size: 14px; color: #666;">
                <strong>Updated:</strong> ${getTimeSince(tech.timestamp)}
              </div>
              ${tech.accuracy > 100 ? `
                <div style="font-size: 12px; color: #f59e0b; margin-top: 4px;">
                  ⚠ Low GPS accuracy (${Math.round(tech.accuracy)}m)
                </div>
              ` : ''}
            </div>
          `,
        });

        marker.addListener('click', () => {
          infoWindow.open(googleMapRef.current, marker);
          setSelectedTech(tech.technician_id);
        });

        marker.infoWindow = infoWindow;
        markersRef.current.set(tech.technician_id, marker);
      }
    });

    existingMarkers.forEach(techId => {
      if (!currentTechs.has(techId)) {
        const marker = markersRef.current.get(techId);
        if (marker) {
          marker.setMap(null);
          markersRef.current.delete(techId);
        }
      }
    });

    if (techLocations.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      techLocations.forEach(tech => {
        bounds.extend({ lat: tech.latitude, lng: tech.longitude });
      });
      googleMapRef.current.fitBounds(bounds);

      if (techLocations.length === 1) {
        googleMapRef.current.setZoom(15);
      }
    }
  }

  async function loadTechLocations() {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Get all clocked-in technicians with their clock-in location
      const { data: dailyClocks } = await supabase
        .from('daily_clock_entries')
        .select('id, technician_id, status, clock_in, clock_in_latitude, clock_in_longitude, profiles!technician_id(full_name, role)')
        .eq('entry_date', today)
        .is('clock_out', null);

      const { data: activeBreaks } = await supabase
        .from('daily_clock_breaks')
        .select('daily_clock_entry_id')
        .is('break_end', null);

      const { data: activeJobs } = await supabase
        .from('time_entries')
        .select('technician_id, work_order:work_orders(id, title)')
        .is('clock_out', null);

      // Get GPS breadcrumbs for clocked-in technicians (get latest for each tech, no time limit)
      const clockedInTechIds = dailyClocks?.map(c => c.technician_id) || [];

      const { data: breadcrumbs, error } = await supabase
        .from('gps_breadcrumbs')
        .select('*')
        .in('technician_id', clockedInTechIds.length > 0 ? clockedInTechIds : ['00000000-0000-0000-0000-000000000000'])
        .order('recorded_at', { ascending: false });

      if (error) throw error;

      const latestLocations = new Map<string, TechLocation>();

      // Get the most recent breadcrumb for each technician
      const latestBreadcrumbs = new Map<string, any>();
      breadcrumbs?.forEach((b: any) => {
        if (!latestBreadcrumbs.has(b.technician_id)) {
          latestBreadcrumbs.set(b.technician_id, b);
        }
      });

      // Process all clocked-in technicians
      dailyClocks?.forEach((clock: any) => {
        const techId = clock.technician_id;
        const breadcrumb = latestBreadcrumbs.get(techId);
        const onJob = activeJobs?.find(j => j.technician_id === techId);
        const breakEntry = activeBreaks?.find(b => b.daily_clock_entry_id === clock.id);

        let status = 'off_duty';
        if (clock.status === 'clocked_in') {
          if (breakEntry) {
            status = 'break';
          } else if (onJob) {
            status = 'on_job';
          } else {
            status = 'available';
          }
        }

        // Use breadcrumb if available, otherwise fall back to clock-in location
        let locationData = null;

        if (breadcrumb) {
          // Use latest GPS breadcrumb
          locationData = {
            id: breadcrumb.id,
            latitude: parseFloat(breadcrumb.latitude),
            longitude: parseFloat(breadcrumb.longitude),
            accuracy: parseFloat(breadcrumb.accuracy),
            heading: breadcrumb.heading,
            speed: breadcrumb.speed,
            timestamp: breadcrumb.recorded_at
          };
        } else if (clock.clock_in_latitude && clock.clock_in_longitude) {
          // Fall back to clock-in location if no breadcrumbs yet
          locationData = {
            id: clock.id,
            latitude: parseFloat(clock.clock_in_latitude),
            longitude: parseFloat(clock.clock_in_longitude),
            accuracy: 0, // Unknown accuracy for clock-in location
            heading: null,
            speed: null,
            timestamp: clock.clock_in
          };
        }

        // Show ALL clocked-in technicians on the map
        if (clock.status === 'clocked_in' && locationData) {
          latestLocations.set(techId, {
            id: locationData.id,
            technician_id: techId,
            latitude: locationData.latitude,
            longitude: locationData.longitude,
            accuracy: locationData.accuracy,
            heading: locationData.heading,
            speed: locationData.speed,
            timestamp: locationData.timestamp,
            battery_level: null,
            is_active: true,
            technician: clock.profiles,
            status: {
              status: status,
              current_appointment_id: onJob?.work_order?.id || null,
              notes: null
            }
          });
        }
      });

      setTechLocations(Array.from(latestLocations.values()));
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error loading tech locations:', error);
    } finally {
      setLoading(false);
    }
  }

  function getStatusColor(status?: string) {
    switch (status) {
      case 'available':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'on_job':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'break':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'unavailable':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  }

  function getTimeSince(timestamp: string) {
    const now = new Date();
    const then = new Date(timestamp);
    const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">Technician Map</h2>
          <p className="text-gray-300">
            Real-time location tracking for field technicians
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-sm text-gray-600">
            <span className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              {loading ? 'Loading...' : `Updated ${getTimeSince(lastUpdate.toISOString())}`}
            </span>
          </div>
          <button
            onClick={() => loadTechLocations()}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map Area */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            {!apiKey ? (
              <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <MapPin className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 font-medium">
                    Google Maps API Key Required
                  </p>
                  <p className="text-sm text-gray-500 mt-2">
                    Configure your Google Maps API key in Admin Settings to enable the interactive map
                  </p>
                </div>
              </div>
            ) : (
              <div className="relative">
                <div
                  ref={mapRef}
                  className="rounded-lg overflow-hidden"
                  style={{ width: '100%', height: '500px', backgroundColor: '#e5e7eb' }}
                />
                {!mapReady && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-200 rounded-lg">
                    <div className="text-center">
                      <RefreshCw className="w-8 h-8 text-gray-400 mx-auto mb-2 animate-spin" />
                      <p className="text-gray-600">Loading map...</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Quick Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {techLocations.filter(t => t.status?.status === 'available').length}
                </div>
                <div className="text-xs text-gray-600">Available</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {techLocations.filter(t => t.status?.status === 'on_job').length}
                </div>
                <div className="text-xs text-gray-600">On Job</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">
                  {techLocations.filter(t => t.status?.status === 'break').length}
                </div>
                <div className="text-xs text-gray-600">On Break</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600">
                  {techLocations.filter(t => t.status?.status === 'off_duty').length}
                </div>
                <div className="text-xs text-gray-600">Off Duty</div>
              </div>
            </div>
          </div>
        </div>

        {/* Technician List */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Active Technicians ({techLocations.length})
              </h3>
            </div>
            <div className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
              {techLocations.map(tech => (
                <div
                  key={tech.id}
                  className={`p-4 cursor-pointer transition-colors ${
                    selectedTech === tech.technician_id
                      ? 'bg-blue-50'
                      : 'hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedTech(tech.technician_id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">
                        {tech.technician.full_name}
                      </div>
                      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border mt-1 ${
                        getStatusColor(tech.status?.status)
                      }`}>
                        {tech.status?.status?.replace('_', ' ') || 'Unknown'}
                      </div>
                    </div>
                    {tech.battery_level !== null && (
                      <div className="flex items-center gap-1 text-xs text-gray-600">
                        <Battery className={`w-4 h-4 ${
                          tech.battery_level < 20 ? 'text-red-600' : 'text-green-600'
                        }`} />
                        {tech.battery_level}%
                      </div>
                    )}
                  </div>

                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <MapPin className="w-3 h-3" />
                      {tech.latitude.toFixed(6)}, {tech.longitude.toFixed(6)}
                    </div>
                    {tech.speed !== null && tech.speed > 0 && (
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <Navigation className="w-3 h-3" />
                        {Math.round(tech.speed)} mph
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <Clock className="w-3 h-3" />
                      {getTimeSince(tech.timestamp)}
                    </div>
                  </div>

                  {tech.status?.notes && (
                    <div className="mt-2 text-xs text-gray-600 italic">
                      "{tech.status.notes}"
                    </div>
                  )}

                  {tech.accuracy > 100 && (
                    <div className="mt-2 text-xs text-yellow-600">
                      ⚠ Low GPS accuracy ({Math.round(tech.accuracy)}m)
                    </div>
                  )}
                </div>
              ))}

              {techLocations.length === 0 && (
                <div className="p-8 text-center text-gray-500">
                  <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p>No active technicians</p>
                  <p className="text-sm mt-1">
                    Technicians will appear here when they clock in
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
