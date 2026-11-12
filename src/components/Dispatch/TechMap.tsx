import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { createTimestampInTimezone, formatDateInTimezone, getOrganizationTimezone } from '../../lib/timezoneUtils';
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
  heartbeat_at?: string | null;
  location_source: 'gps' | 'clock_in';
  is_active: boolean;
  technician: {
    full_name: string;
    role: string;
    primary_office_id?: string | null;
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
  const { profile } = useAuth();
  const [roleFilter, setRoleFilter] = useState('all');
  const [officeFilter, setOfficeFilter] = useState('all');
  const [offices, setOffices] = useState<Array<{ id: string; office_name: string }>>([]);
  const [mapError, setMapError] = useState<string | null>(null);
  const hasFittedMap = useRef(false);
  const visibleLocations = techLocations.filter(t =>
    (roleFilter === 'all' || t.technician?.role?.toLowerCase() === roleFilter) &&
    (officeFilter === 'all' || t.technician?.primary_office_id === officeFilter)
  );
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [locationError, setLocationError] = useState<string | null>(null);
  const [clockedInCount, setClockedInCount] = useState(0);
  const latestLocationRequest = useRef(0);
  // The mount-time interval and realtime listeners must use the latest authenticated profile.
  const loadTechLocationsRef = useRef<() => Promise<void>>(async () => {});
  const realtimeRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const initRetryCount = useRef(0);
  const [historyDate, setHistoryDate] = useState(() => formatDateInTimezone(new Date().toISOString(), 'America/Chicago'));
  const [organizationTimezone, setOrganizationTimezone] = useState('America/Chicago');
  const timezoneRef = useRef('America/Chicago');
  const [historyMode, setHistoryMode] = useState(false);
  const [historyPoints, setHistoryPoints] = useState<Array<{ latitude: number; longitude: number; recorded_at: string }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTechnicians, setHistoryTechnicians] = useState<Array<{ id: string; full_name: string }>>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const historyLineRef = useRef<any>(null);
  const historyEndpointsRef = useRef<any[]>([]);

  useEffect(() => {
    mountedRef.current = true;
    loadApiKey();
    void loadTechLocationsRef.current();
    void loadHistoryTechnicians();


    const interval = setInterval(() => {
      void loadTechLocationsRef.current();
    }, 30000); // Refresh every 30 seconds

    // Coalesce GPS bursts into one refresh. Without this, each breadcrumb
    // invalidates the previous request, potentially starving the map forever.
    const scheduleRealtimeRefresh = () => {
      // Schedule at most one refresh per window, measured from the FIRST event.
      // Resetting the timer on every GPS update could postpone refresh forever
      // while devices continuously report more often than every 250ms.
      if (realtimeRefreshTimer.current) return;
      realtimeRefreshTimer.current = setTimeout(() => {
        realtimeRefreshTimer.current = null;
        void loadTechLocationsRef.current();
      }, 250);
    };

    const locationsChannel = supabase
      .channel('tech-locations')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'gps_breadcrumbs'
      }, () => {
        scheduleRealtimeRefresh();
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'enhanced_gps_breadcrumbs'
      }, () => {
        scheduleRealtimeRefresh();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'daily_clock_entries'
      }, () => {
        scheduleRealtimeRefresh();
      })
      .subscribe();

    return () => {
      mountedRef.current = false;
      latestLocationRequest.current += 1;
      clearInterval(interval);
      if (realtimeRefreshTimer.current) clearTimeout(realtimeRefreshTimer.current);
      realtimeRefreshTimer.current = null;
      locationsChannel.unsubscribe();
    };
  }, []);

  // The initial mount can run before AuthContext has loaded the dealer profile.
  // Re-fetch active shifts when the organization becomes available or changes.
  useEffect(() => {
    if (!profile?.organization_id) return;
    void loadTechLocations();
  }, [profile?.organization_id]);

  useEffect(() => {
    if (!profile?.organization_id) return;
    let cancelled = false;
    void supabase.from('company_offices').select('id,office_name').eq('organization_id', profile.organization_id).order('office_name')
      .then(({ data, error }) => {
        if (error) console.error('Unable to load Live Map offices', error);
        if (!cancelled) setOffices(data || []);
      });
    return () => { cancelled = true; };
  }, [profile?.organization_id]);

  useEffect(() => {
    void getOrganizationTimezone().then(timezone => {
      timezoneRef.current = timezone;
      setOrganizationTimezone(timezone);
      void loadTechLocations();
      setHistoryDate(formatDateInTimezone(new Date().toISOString(), timezone));
    });
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
  }, [techLocations, mapReady, historyMode, roleFilter, officeFilter]);

  useEffect(() => {
    if (!historyMode && selectedTech && googleMapRef.current) {
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
  }, [selectedTech, historyMode]);

  useEffect(() => {
    if (!historyMode || !selectedTech) { setHistoryPoints([]); return; }
    let cancelled = false;
    const start = new Date(createTimestampInTimezone(historyDate, '00:00', organizationTimezone));
    const followingDay = new Date(historyDate + 'T12:00:00Z');
    followingDay.setUTCDate(followingDay.getUTCDate() + 1);
    const end = new Date(createTimestampInTimezone(followingDay.toISOString().slice(0, 10), '00:00', organizationTimezone));
    setHistoryLoading(true);
    setHistoryError(null);
    Promise.all([
      supabase.from('enhanced_gps_breadcrumbs').select('latitude,longitude,captured_at').eq('technician_id', selectedTech).gte('captured_at', start.toISOString()).lt('captured_at', end.toISOString()).order('captured_at').limit(5000),
      supabase.from('gps_breadcrumbs').select('latitude,longitude,recorded_at').eq('technician_id', selectedTech).gte('recorded_at', start.toISOString()).lt('recorded_at', end.toISOString()).order('recorded_at').limit(5000)
    ]).then(([native, legacy]) => {
      if (cancelled) return;
      if (native.error || legacy.error) { console.error('GPS history load failed', native.error, legacy.error); setHistoryError('Route unavailable — could not load all GPS sources'); setHistoryPoints([]); }
      else {
        if ((native.data?.length || 0) >= 5000 || (legacy.data?.length || 0) >= 5000) setHistoryError('Route may be incomplete: GPS point limit reached');
        setHistoryPoints([
        ...(native.data || []).map(p => ({ latitude: Number(p.latitude), longitude: Number(p.longitude), recorded_at: p.captured_at })),
        ...(legacy.data || []).map(p => ({ latitude: Number(p.latitude), longitude: Number(p.longitude), recorded_at: p.recorded_at }))
      ].filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)).sort((a,b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at)));
      }
      setHistoryLoading(false);
    }).catch(error => {
      if (cancelled) return;
      console.error('GPS history request failed', error);
      setHistoryError('Route unavailable — please try again');
      setHistoryPoints([]);
      setHistoryLoading(false);
    });
    return () => { cancelled = true; };
  }, [selectedTech, historyDate, historyMode, organizationTimezone]);

  useEffect(() => {
    historyLineRef.current?.setMap(null);
    historyEndpointsRef.current.forEach(marker => marker.setMap(null));
    historyEndpointsRef.current = [];
    if (!historyMode || !mapReady || !historyPoints.length || !window.google?.maps || !googleMapRef.current) return;
    const path = historyPoints.map(p => ({ lat: p.latitude, lng: p.longitude }));
    historyLineRef.current = new window.google.maps.Polyline({ path, map: googleMapRef.current, strokeColor: '#2563eb', strokeWeight: 4 });
    const bounds = new window.google.maps.LatLngBounds();
    path.forEach(p => bounds.extend(p));
    googleMapRef.current.fitBounds(bounds);
    historyEndpointsRef.current = [
      new window.google.maps.Marker({ map: googleMapRef.current, position: path[0], label: 'S', title: 'First recorded GPS point' }),
      new window.google.maps.Marker({ map: googleMapRef.current, position: path[path.length - 1], label: 'E', title: 'Last recorded GPS point' })
    ];
    return () => {
      historyLineRef.current?.setMap(null);
      historyEndpointsRef.current.forEach(marker => marker.setMap(null));
      historyEndpointsRef.current = [];
    };
  }, [historyPoints, mapReady, historyMode]);

  async function loadHistoryTechnicians() {
    const { data, error } = await supabase.from('profiles').select('id,full_name').order('full_name');
    if (error) { console.error('Unable to load technician history selector', error); return; }
    setHistoryTechnicians((data || []).filter(p => p.id && p.full_name));
  }

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
        setMapError('Google Maps is not configured for this dealer.');
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
      setMapError('Google Maps could not load. Check the Maps JavaScript API configuration.');
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
        setMapError('Map container did not initialize. Please reload this page.');
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
        setMapError('Google Maps initialization timed out.');
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
      setMapError('Google Maps failed to initialize.');
    }
  }

  function isStale(timestamp: string): boolean {
    const age = Date.now() - Date.parse(timestamp);
    return !Number.isFinite(age) || age > 5 * 60 * 1000;
  }

  function escapeMapHtml(value: string): string {
    return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character);
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

    console.log(`Updating markers for ${visibleLocations.length} employees`);

    const existingMarkers = new Set(markersRef.current.keys());
    const currentTechs = new Set<string>();

    visibleLocations.forEach(tech => {
      currentTechs.add(tech.technician_id);
      const position = { lat: tech.latitude, lng: tech.longitude };

      if (markersRef.current.has(tech.technician_id)) {
        const marker = markersRef.current.get(tech.technician_id);
        marker.setPosition(position);
        marker.setTitle(`${tech.technician.full_name} — ${tech.location_source === 'clock_in' ? 'Clock-in position only' : isStale(tech.timestamp) ? 'Stale GPS position' : 'Recent GPS position'}`);
        marker.setIcon({
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: isStale(tech.timestamp) || tech.location_source === 'clock_in' ? '#9ca3af' : getMarkerColor(tech.status?.status),
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
            fillColor: isStale(tech.timestamp) || tech.location_source === 'clock_in' ? '#9ca3af' : getMarkerColor(tech.status?.status),
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
          title: `${tech.technician.full_name} — ${tech.location_source === 'clock_in' ? 'Clock-in position only' : isStale(tech.timestamp) ? 'Stale GPS position' : 'Recent GPS position'}`,
        });

        const infoWindow = new window.google.maps.InfoWindow({
          content: `
            <div style="padding: 8px; min-width: 200px;">
              <h3 style="font-weight: bold; margin: 0 0 8px 0; color: #111;">${escapeMapHtml(tech.technician.full_name)}</h3>
              <div style="font-size: 14px; color: #666; margin-bottom: 4px;">
                <strong>Status:</strong> ${escapeMapHtml(tech.status?.status?.replace('_', ' ') || 'Unknown')}
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
                <strong>Updated:</strong> ${getTimeSince(tech.timestamp)} — ${tech.location_source === 'clock_in' ? 'Clock-in location only, not live GPS' : isStale(tech.timestamp) ? 'Stale GPS location' : 'Recent GPS location'}
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

    if (!historyMode && visibleLocations.length > 0 && !hasFittedMap.current) {
      const bounds = new window.google.maps.LatLngBounds();
      visibleLocations.forEach(tech => {
        bounds.extend({ lat: tech.latitude, lng: tech.longitude });
      });
      googleMapRef.current.fitBounds(bounds);

      hasFittedMap.current = true;
      if (visibleLocations.length === 1) {
        googleMapRef.current.setZoom(15);
      }
    }
  }

  async function loadTechLocations() {
    const requestId = ++latestLocationRequest.current;
    const isCurrent = () => mountedRef.current && requestId === latestLocationRequest.current;
    try {
      // Active shifts may cross midnight. Filtering by today's entry_date
      // would make an employee disappear from the map at midnight.
      // Scope by organization, not by the shift's start date.
      if (!profile?.organization_id) return;
      const { data: dailyClocks, error: clockError } = await supabase
        .from('daily_clock_entries')
        .select('id, technician_id, status, clock_in, clock_in_latitude, clock_in_longitude, profiles!technician_id(full_name, role, primary_office_id)')
        .eq('organization_id', profile.organization_id)
        .eq('status', 'clocked_in')
        .is('clock_out', null);
      if (clockError) throw clockError;
      if (!isCurrent()) return;
      setClockedInCount((dailyClocks || []).filter(c => c.status === 'clocked_in').length);

      // Restrict ancillary lookups to the active shifts and employees in this dealer.
      // An unscoped lookup can be expensive and could associate another dealer's job.
      const clockedInTechIds = [...new Set((dailyClocks || []).map(c => c.technician_id))];
      const activeShiftEntryIds = (dailyClocks || []).map(c => c.id);
      const emptyId = '00000000-0000-0000-0000-000000000000';
      const { data: activeBreaks, error: breaksError } = await supabase
        .from('daily_clock_breaks')
        .select('daily_clock_entry_id')
        .in('daily_clock_entry_id', activeShiftEntryIds.length ? activeShiftEntryIds : [emptyId])
        .is('break_end', null);
      if (breaksError) throw breaksError;

      const { data: activeJobs, error: jobsError } = await supabase
        .from('time_entries')
        .select('technician_id, work_order:work_orders(id, title)')
        .in('technician_id', clockedInTechIds.length ? clockedInTechIds : [emptyId])
        .is('clock_out', null).overrideTypes<{ technician_id: string; work_order: { id: string; title: string } | null }[], { merge: false }>();
      if (jobsError) throw jobsError;

      // A global 500-row limit can hide quieter employees when one device
      // uploads many breadcrumbs. Fetch the newest eligible point per active
      // employee from each source, bounded by that employee's clock-in time.
      const latestGps = await Promise.all((dailyClocks || []).map(async clock => {
        const [legacy, native] = await Promise.all([
          supabase.from('gps_breadcrumbs')
            .select('id,technician_id,daily_clock_entry_id,latitude,longitude,accuracy,heading,speed,recorded_at,battery_level')
            .eq('technician_id', clock.technician_id)
            .gte('recorded_at', clock.clock_in)
            .order('recorded_at', { ascending: false }).limit(20),
          supabase.from('enhanced_gps_breadcrumbs')
            .select('id,technician_id,daily_clock_entry_id,latitude,longitude,accuracy,heading,speed,captured_at,battery_level')
            .eq('technician_id', clock.technician_id)
            .gte('captured_at', clock.clock_in)
            .order('captured_at', { ascending: false }).limit(20)
        ]);
        if (legacy.error) throw legacy.error;
        if (native.error) throw native.error;
        return {
          legacy: (legacy.data || []).find(p => !p.daily_clock_entry_id || p.daily_clock_entry_id === clock.id),
          native: (native.data || []).find(p => !p.daily_clock_entry_id || p.daily_clock_entry_id === clock.id)
        };
      }));
      if (!isCurrent()) return;
      const breadcrumbs = latestGps.flatMap(result => result.legacy ? [result.legacy] : []);
      const nativeBreadcrumbs = latestGps.flatMap(result => result.native ? [result.native] : []);

      const { data: heartbeats } = await supabase.from('technician_tracking_heartbeats').select('technician_id,daily_clock_entry_id,last_seen_at').in('technician_id', clockedInTechIds.length ? clockedInTechIds : ['00000000-0000-0000-0000-000000000000']);
      const heartbeatByTech = new Map((heartbeats || []).map(h => [h.technician_id, h]));
      const latestLocations = new Map<string, TechLocation>();
      const latestBreadcrumbs = new Map<string, any>();
      const activeShiftIds = new Map((dailyClocks || []).map(clock => [clock.technician_id, clock.id]));
      const consider = (point: any) => {
        const shiftId = activeShiftIds.get(point.technician_id);
        if (!shiftId || (point.daily_clock_entry_id && point.daily_clock_entry_id !== shiftId)) return;
        const shift = (dailyClocks || []).find(clock => clock.id === shiftId);
        if (!shift || !Number.isFinite(Date.parse(point.recorded_at)) || Date.parse(point.recorded_at) < Date.parse(shift.clock_in)) return;
        const previous = latestBreadcrumbs.get(point.technician_id);
        if (!previous || Date.parse(point.recorded_at) > Date.parse(previous.recorded_at)) latestBreadcrumbs.set(point.technician_id, point);
      };
      breadcrumbs?.forEach(consider);
      nativeBreadcrumbs?.forEach(point => consider({ ...point, recorded_at: point.captured_at }));

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
        if (clock.status === 'clocked_in' && locationData && Number.isFinite(locationData.latitude) && Number.isFinite(locationData.longitude) && Math.abs(locationData.latitude) <= 90 && Math.abs(locationData.longitude) <= 180) {
          latestLocations.set(techId, {
            id: locationData.id,
            technician_id: techId,
            latitude: locationData.latitude,
            longitude: locationData.longitude,
            accuracy: locationData.accuracy,
            heading: locationData.heading,
            speed: locationData.speed,
            timestamp: locationData.timestamp,
            battery_level: breadcrumb?.battery_level ?? null,
            location_source: breadcrumb ? 'gps' : 'clock_in',
            heartbeat_at: heartbeatByTech.get(techId)?.daily_clock_entry_id === clock.id ? heartbeatByTech.get(techId)?.last_seen_at : null,
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

      if (!isCurrent()) return;
      setTechLocations(Array.from(latestLocations.values()));
      setLastUpdate(new Date());
      setLocationError(null);
    } catch (error) {
      if (isCurrent()) {
        console.error('Error loading tech locations:', error);
        setLocationError('Employee locations could not be refreshed. Displayed positions may be outdated.');
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }

  // Refresh the callback each render so long-lived listeners never capture a stale profile.
  loadTechLocationsRef.current = loadTechLocations;

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

    if (!Number.isFinite(seconds)) return 'unknown';
    if (seconds < 0) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">Live Map</h2>
          <p className="hidden sm:block text-gray-300">Clocked-in employee locations</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-xs sm:text-sm text-gray-300">
            <span className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              {loading ? 'Loading...' : `Updated ${getTimeSince(lastUpdate.toISOString())}`}
            </span>
          </div>
          <button
            onClick={() => loadTechLocations()}
            disabled={loading}
            className="hidden sm:flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-2 sm:p-4 text-gray-900">
        {!historyMode && <label className="text-sm">Employee role
          <select aria-label="Filter employees by role" className="block max-w-[180px] rounded border px-2 py-1.5 text-sm" value={roleFilter} onChange={e => { setRoleFilter(e.target.value); hasFittedMap.current = false; }}>
            <option value="all">All employees</option>
            {[...new Set(techLocations.map(t => t.technician?.role?.toLowerCase()).filter(Boolean))].sort().map(role => <option key={role} value={role}>{role}</option>)}
          </select>
        </label>}
        {!historyMode && offices.length > 1 && <label className="text-sm">Office
          <select aria-label="Filter employees by office" className="block max-w-[180px] rounded border px-2 py-1.5 text-sm" value={officeFilter} onChange={e => { setOfficeFilter(e.target.value); hasFittedMap.current = false; }}>
            <option value="all">All offices</option>
            {offices.map(office => <option key={office.id} value={office.id}>{office.office_name}</option>)}
          </select>
        </label>}
        <button type="button" className="rounded border px-2.5 py-1.5 text-sm" onClick={() => setHistoryMode(v => !v)}>{historyMode ? 'Return to live map' : 'View route history'}</button>
        {historyMode && <label>History technician
          <select className="block rounded border p-2" value={selectedTech || ''} onChange={e => setSelectedTech(e.target.value || null)}>
            <option value="">Select technician</option>
            {historyTechnicians.map(tech => <option key={tech.id} value={tech.id}>{tech.full_name}</option>)}
          </select>
        </label>}
        {historyMode && <label>Date <input type="date" className="block rounded border p-2" value={historyDate} onChange={e => setHistoryDate(e.target.value)} /></label>}
        {historyMode && <span className="text-sm">{historyLoading ? 'Loading route…' : historyError || (selectedTech ? historyPoints.length + ' GPS points' : 'Select a technician for route history')}</span>}
      </div>
      {locationError && <div role="alert" className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">{locationError}</div>}
      {!loading && !locationError && clockedInCount > visibleLocations.length && roleFilter === 'all' && officeFilter === 'all' && <p className="text-xs text-gray-300">{clockedInCount - visibleLocations.length} clocked-in employee(s) have no usable GPS or clock-in coordinates.</p>}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-6">
        {/* Map Area */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2 sm:p-6">
            {mapError ? <div role="alert" className="rounded-lg bg-red-50 p-5 text-red-800">{mapError}</div> : !apiKey ? (
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
                  style={{ width: '100%', height: 'min(65dvh, 500px)', minHeight: '320px', backgroundColor: '#e5e7eb' }}
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
            <div className="grid grid-cols-4 gap-2 sm:gap-4 mt-3 sm:mt-6">
              <div className="text-center">
                <div className="text-lg sm:text-2xl font-bold text-green-600">
                  {visibleLocations.filter(t => t.status?.status === 'available').length}
                </div>
                <div className="text-xs text-gray-600">Available</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {visibleLocations.filter(t => t.status?.status === 'on_job').length}
                </div>
                <div className="text-xs text-gray-600">On Job</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">
                  {visibleLocations.filter(t => t.status?.status === 'break').length}
                </div>
                <div className="text-xs text-gray-600">On Break</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600">
                  {visibleLocations.filter(t => t.status?.status === 'off_duty').length}
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
                Active Employees ({visibleLocations.length})
              </h3>
            </div>
            <div className="divide-y divide-gray-200">
              {visibleLocations.map(tech => (
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
                    <div className="text-xs text-gray-600">{tech.location_source === 'clock_in' ? 'Clock-in position only' : isStale(tech.timestamp) ? 'Stale GPS — last known position' : 'Recent GPS position'}</div>
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <Clock className="w-3 h-3" />
                      Last GPS: {getTimeSince(tech.timestamp)}
                      {Date.now() - Date.parse(tech.timestamp) > 5 * 60 * 1000 && (
                        <span className="ml-2 font-semibold text-amber-700">Last GPS is older than 5 minutes; connection status unknown</span>
                      )}
                    </div>
                  </div>

                  <div className="mt-1 text-xs text-gray-600">App connectivity: {tech.heartbeat_at ? (Date.now() - Date.parse(tech.heartbeat_at) <= 180000 ? 'Recently connected' : 'No recent foreground heartbeat; background unknown') : 'Not confirmed'}</div>
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
