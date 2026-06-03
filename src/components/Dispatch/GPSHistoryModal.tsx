import React, { useState, useEffect, useRef } from 'react';
import { MapPin, X, Calendar, Navigation, AlertCircle, CheckCircle, Ruler } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface GPSHistoryModalProps {
  entry: {
    id: string;
    clock_in: string;
    clock_out: string | null;
    clock_in_latitude: number | null;
    clock_in_longitude: number | null;
    clock_in_address: string | null;
    clock_in_gps_accuracy: number | null;
    clock_in_gps_capture_method: string | null;
    clock_in_gps_attempted_at: string | null;
    clock_in_gps_captured_at: string | null;
    clock_in_gps_duration_ms: number | null;
    clock_out_latitude: number | null;
    clock_out_longitude: number | null;
    clock_out_address: string | null;
    clock_out_gps_accuracy: number | null;
    clock_out_gps_capture_method: string | null;
    clock_out_gps_attempted_at: string | null;
    clock_out_gps_captured_at: string | null;
    clock_out_gps_duration_ms: number | null;
  };
  technicianName: string;
  onClose: () => void;
}

declare global {
  interface Window {
    google: any;
    initGPSMap: () => void;
  }
}

export function GPSHistoryModal({ entry, technicianName, onClose }: GPSHistoryModalProps) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    loadApiKey();
  }, []);

  useEffect(() => {
    if (apiKey && !mapReady && mapRef.current) {
      loadGoogleMapsScript();
    }
  }, [apiKey, mapReady]);

  useEffect(() => {
    if (mapReady && entry.clock_in_latitude && entry.clock_in_longitude) {
      initializeMap();
    }
  }, [mapReady, entry]);

  async function loadApiKey() {
    try {
      const { data: settings } = await supabase
        .from('company_settings')
        .select('google_maps_api_key')
        .single();

      if (settings?.google_maps_api_key) {
        setApiKey(settings.google_maps_api_key);
      }
    } catch (error) {
      console.error('Error loading API key:', error);
    }
  }

  function loadGoogleMapsScript() {
    if (window.google?.maps) {
      setMapReady(true);
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      setMapReady(true);
    };
    document.head.appendChild(script);
  }

  function initializeMap() {
    if (!mapRef.current || !window.google?.maps) return;

    const hasClockIn = entry.clock_in_latitude && entry.clock_in_longitude;
    const hasClockOut = entry.clock_out_latitude && entry.clock_out_longitude;

    if (!hasClockIn && !hasClockOut) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    // Create map centered on clock-in location (or clock-out if no clock-in)
    const centerLat = entry.clock_in_latitude || entry.clock_out_latitude || 39.0;
    const centerLng = entry.clock_in_longitude || entry.clock_out_longitude || -95.7;

    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: Number(centerLat), lng: Number(centerLng) },
      zoom: 13,
      mapTypeControl: true,
      fullscreenControl: true,
    });

    googleMapRef.current = map;

    // Add clock-in marker
    if (hasClockIn) {
      const clockInMarker = new window.google.maps.Marker({
        position: {
          lat: Number(entry.clock_in_latitude),
          lng: Number(entry.clock_in_longitude)
        },
        map: map,
        title: 'Clock In Location',
        label: {
          text: 'IN',
          color: 'white',
          fontWeight: 'bold',
        },
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: '#10b981',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      });

      const clockInInfo = new window.google.maps.InfoWindow({
        content: `
          <div style="padding: 8px;">
            <strong>Clock In</strong><br/>
            ${entry.clock_in_address || 'Address not available'}<br/>
            <small>Accuracy: ${entry.clock_in_gps_accuracy?.toFixed(1) || 'N/A'}m</small>
          </div>
        `,
      });

      clockInMarker.addListener('click', () => {
        clockInInfo.open(map, clockInMarker);
      });

      markersRef.current.push(clockInMarker);
    }

    // Add clock-out marker
    if (hasClockOut) {
      const clockOutMarker = new window.google.maps.Marker({
        position: {
          lat: Number(entry.clock_out_latitude),
          lng: Number(entry.clock_out_longitude)
        },
        map: map,
        title: 'Clock Out Location',
        label: {
          text: 'OUT',
          color: 'white',
          fontWeight: 'bold',
        },
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: '#ef4444',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      });

      const clockOutInfo = new window.google.maps.InfoWindow({
        content: `
          <div style="padding: 8px;">
            <strong>Clock Out</strong><br/>
            ${entry.clock_out_address || 'Address not available'}<br/>
            <small>Accuracy: ${entry.clock_out_gps_accuracy?.toFixed(1) || 'N/A'}m</small>
          </div>
        `,
      });

      clockOutMarker.addListener('click', () => {
        clockOutInfo.open(map, clockOutMarker);
      });

      markersRef.current.push(clockOutMarker);
    }

    // Draw line between locations if both exist
    if (hasClockIn && hasClockOut) {
      const path = [
        { lat: Number(entry.clock_in_latitude), lng: Number(entry.clock_in_longitude) },
        { lat: Number(entry.clock_out_latitude), lng: Number(entry.clock_out_longitude) }
      ];

      new window.google.maps.Polyline({
        path: path,
        geodesic: true,
        strokeColor: '#6366f1',
        strokeOpacity: 0.7,
        strokeWeight: 2,
        map: map,
      });

      // Calculate distance
      const distance = window.google.maps.geometry.spherical.computeDistanceBetween(
        new window.google.maps.LatLng(Number(entry.clock_in_latitude), Number(entry.clock_in_longitude)),
        new window.google.maps.LatLng(Number(entry.clock_out_latitude), Number(entry.clock_out_longitude))
      );

      // Convert to miles
      setDistance(distance * 0.000621371);

      // Fit bounds to show both markers
      const bounds = new window.google.maps.LatLngBounds();
      bounds.extend(path[0]);
      bounds.extend(path[1]);
      map.fitBounds(bounds);
    }
  }

  function formatDateTime(dateStr: string | null) {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  function getAccuracyQuality(accuracy: number | null): { color: string; text: string } {
    if (!accuracy) return { color: 'gray', text: 'Unknown' };
    if (accuracy < 10) return { color: 'green', text: 'Excellent' };
    if (accuracy < 50) return { color: 'yellow', text: 'Good' };
    if (accuracy < 100) return { color: 'orange', text: 'Fair' };
    return { color: 'red', text: 'Poor' };
  }

  function getCaptureMethodText(method: string | null): string {
    if (!method) return 'Unknown';
    switch (method) {
      case 'high_accuracy': return 'High Accuracy GPS';
      case 'network': return 'Network (Wi-Fi/Cell)';
      case 'cached': return 'Cached Location';
      case 'emergency': return 'Emergency Fallback';
      case 'failed': return 'Capture Failed';
      case 'none': return 'GPS Unavailable';
      default: return method;
    }
  }

  const clockInQuality = getAccuracyQuality(entry.clock_in_gps_accuracy);
  const clockOutQuality = getAccuracyQuality(entry.clock_out_gps_accuracy);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">GPS Location History</h2>
            <p className="text-sm text-gray-500 mt-1">{technicianName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Clock In Details */}
            <div className="bg-green-50 border-2 border-green-200 rounded-lg p-6">
              <div className="flex items-center mb-4">
                <div className="bg-green-500 text-white rounded-full p-2 mr-3">
                  <MapPin className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Clock In Location</h3>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600">Time</p>
                  <p className="font-medium text-gray-900">{formatDateTime(entry.clock_in)}</p>
                </div>

                {entry.clock_in_latitude && entry.clock_in_longitude ? (
                  entry.clock_in_address ? (
                    <div>
                      <p className="text-sm text-gray-600">Address</p>
                      <p className="font-medium text-gray-900">{entry.clock_in_address}</p>
                    </div>
                  ) : (
                    <div className="bg-blue-50 border border-blue-200 rounded p-3 flex items-start">
                      <AlertCircle className="h-5 w-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-blue-800">GPS captured, address not yet available</p>
                    </div>
                  )
                ) : (
                  <div className="bg-yellow-100 border border-yellow-300 rounded p-3 flex items-start">
                    <AlertCircle className="h-5 w-5 text-yellow-600 mr-2 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-yellow-800">No GPS location captured at clock-in</p>
                  </div>
                )}

                {entry.clock_in_latitude && entry.clock_in_longitude && (
                  <>
                    <div>
                      <p className="text-sm text-gray-600">Coordinates</p>
                      <p className="font-mono text-sm text-gray-900">
                        {Number(entry.clock_in_latitude).toFixed(6)}, {Number(entry.clock_in_longitude).toFixed(6)}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-sm text-gray-600">Accuracy</p>
                        <div className="flex items-center">
                          <span className={`inline-flex items-center px-2 py-1 rounded text-sm font-medium bg-${clockInQuality.color}-100 text-${clockInQuality.color}-800`}>
                            {entry.clock_in_gps_accuracy?.toFixed(1) || 'N/A'}m
                          </span>
                          <span className="ml-2 text-xs text-gray-500">({clockInQuality.text})</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Method</p>
                        <p className="text-sm text-gray-900">{getCaptureMethodText(entry.clock_in_gps_capture_method)}</p>
                      </div>
                    </div>

                    {entry.clock_in_gps_duration_ms && (
                      <div>
                        <p className="text-sm text-gray-600">Capture Duration</p>
                        <p className="text-sm text-gray-900">{(entry.clock_in_gps_duration_ms / 1000).toFixed(1)}s</p>
                      </div>
                    )}

                    {entry.clock_in_gps_captured_at && (
                      <div>
                        <p className="text-sm text-gray-600">GPS Captured At</p>
                        <p className="text-sm text-gray-900">{formatDateTime(entry.clock_in_gps_captured_at)}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Clock Out Details */}
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6">
              <div className="flex items-center mb-4">
                <div className="bg-red-500 text-white rounded-full p-2 mr-3">
                  <Navigation className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Clock Out Location</h3>
              </div>

              {entry.clock_out ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-gray-600">Time</p>
                    <p className="font-medium text-gray-900">{formatDateTime(entry.clock_out)}</p>
                  </div>

                  {entry.clock_out_latitude && entry.clock_out_longitude ? (
                    entry.clock_out_address ? (
                      <div>
                        <p className="text-sm text-gray-600">Address</p>
                        <p className="font-medium text-gray-900">{entry.clock_out_address}</p>
                      </div>
                    ) : (
                      <div className="bg-blue-50 border border-blue-200 rounded p-3 flex items-start">
                        <AlertCircle className="h-5 w-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-blue-800">GPS captured, address not yet available</p>
                      </div>
                    )
                  ) : (
                    <div className="bg-yellow-100 border border-yellow-300 rounded p-3 flex items-start">
                      <AlertCircle className="h-5 w-5 text-yellow-600 mr-2 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-yellow-800">No GPS location captured at clock-out</p>
                    </div>
                  )}

                  {entry.clock_out_latitude && entry.clock_out_longitude && (
                    <>
                      <div>
                        <p className="text-sm text-gray-600">Coordinates</p>
                        <p className="font-mono text-sm text-gray-900">
                          {Number(entry.clock_out_latitude).toFixed(6)}, {Number(entry.clock_out_longitude).toFixed(6)}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-sm text-gray-600">Accuracy</p>
                          <div className="flex items-center">
                            <span className={`inline-flex items-center px-2 py-1 rounded text-sm font-medium bg-${clockOutQuality.color}-100 text-${clockOutQuality.color}-800`}>
                              {entry.clock_out_gps_accuracy?.toFixed(1) || 'N/A'}m
                            </span>
                            <span className="ml-2 text-xs text-gray-500">({clockOutQuality.text})</span>
                          </div>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Method</p>
                          <p className="text-sm text-gray-900">{getCaptureMethodText(entry.clock_out_gps_capture_method)}</p>
                        </div>
                      </div>

                      {entry.clock_out_gps_duration_ms && (
                        <div>
                          <p className="text-sm text-gray-600">Capture Duration</p>
                          <p className="text-sm text-gray-900">{(entry.clock_out_gps_duration_ms / 1000).toFixed(1)}s</p>
                        </div>
                      )}

                      {entry.clock_out_gps_captured_at && (
                        <div>
                          <p className="text-sm text-gray-600">GPS Captured At</p>
                          <p className="text-sm text-gray-900">{formatDateTime(entry.clock_out_gps_captured_at)}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="bg-gray-100 border border-gray-300 rounded p-4 flex items-center justify-center h-full">
                  <p className="text-gray-600">Not clocked out yet</p>
                </div>
              )}
            </div>
          </div>

          {/* Distance Between Locations */}
          {distance !== null && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 mb-6 flex items-center">
              <Ruler className="h-5 w-5 text-blue-600 mr-3" />
              <div>
                <p className="text-sm text-gray-600">Distance Between Clock In & Clock Out</p>
                <p className="text-lg font-semibold text-gray-900">{distance.toFixed(2)} miles</p>
              </div>
            </div>
          )}

          {/* Map */}
          {apiKey && (entry.clock_in_latitude || entry.clock_out_latitude) ? (
            <div className="bg-gray-100 rounded-lg overflow-hidden border-2 border-gray-300">
              <div ref={mapRef} style={{ height: '400px', width: '100%' }} />
            </div>
          ) : (
            <div className="bg-gray-100 rounded-lg p-8 text-center border-2 border-gray-300">
              <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">
                {!apiKey ? 'Google Maps API key not configured' : 'No GPS coordinates available'}
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
