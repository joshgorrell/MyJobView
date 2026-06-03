import { useState, useEffect } from 'react';
import { Calculator, MapPin, Navigation, DollarSign, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { AddressAutocomplete } from '../Shared/AddressAutocomplete';

interface Office {
  id: string;
  office_name: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  zip: string;
  latitude: number | null;
  longitude: number | null;
}

interface TravelSettings {
  radius_miles: number;
  default_rate_per_mile: number;
  calculation_method: 'round_trip' | 'one_way';
}

interface EstimateResult {
  distance: number;
  withinRadius: boolean;
  eligibleMiles: number;
  bonusAmount: number;
  method: string;
  radiusMiles: number;
  ratePerMile: number;
  excessMiles: number;
}

export function TripEstimator() {
  const [offices, setOffices] = useState<Office[]>([]);
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>('');
  const [jobAddress, setJobAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadOffices();
  }, []);

  async function loadOffices() {
    try {
      const { data, error } = await supabase
        .from('company_offices')
        .select('*')
        .order('office_name');

      if (error) throw error;
      setOffices(data || []);
    } catch (err) {
      console.error('Error loading offices:', err);
    }
  }

  function getFullAddress(office: Office): string {
    const parts = [
      office.address_line1,
      office.address_line2,
      `${office.city}, ${office.state} ${office.zip}`
    ].filter(Boolean);
    return parts.join(', ');
  }

  async function mapsProxy(endpoint: 'geocode' | 'distancematrix', params: Record<string, string>) {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const qs = new URLSearchParams({ endpoint, ...params });
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-maps-proxy?${qs}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Maps proxy error (${res.status})`);
    }

    return res.json();
  }

  async function calculateEstimate() {
    if (!selectedOfficeId || !jobAddress) {
      setError('Please select an office and enter a job address');
      return;
    }

    setLoading(true);
    setError(null);
    setEstimate(null);

    try {
      const office = offices.find(o => o.id === selectedOfficeId);
      if (!office) throw new Error('Office not found');

      let officeLat = office.latitude;
      let officeLon = office.longitude;

      if (!officeLat || !officeLon) {
        const officeFullAddress = getFullAddress(office);
        if (!officeFullAddress.trim()) {
          throw new Error('Office coordinates are not set and the address is incomplete. Please update the office settings.');
        }
        const officeGeoData = await mapsProxy('geocode', { address: officeFullAddress });
        if (officeGeoData.status !== 'OK' || !officeGeoData.results[0]) {
          throw new Error('Could not resolve office coordinates from its address. Please add coordinates in Admin > Settings > Office Locations.');
        }
        officeLat = officeGeoData.results[0].geometry.location.lat;
        officeLon = officeGeoData.results[0].geometry.location.lng;
      }

      const { data: settings, error: settingsError } = await supabase
        .from('office_travel_settings')
        .select('*')
        .eq('office_id', selectedOfficeId)
        .maybeSingle();

      if (settingsError) throw settingsError;

      const travelSettings: TravelSettings = settings || {
        radius_miles: 15.0,
        default_rate_per_mile: 0.50,
        calculation_method: 'round_trip'
      };

      const geocodeData = await mapsProxy('geocode', { address: jobAddress });

      if (geocodeData.status !== 'OK' || !geocodeData.results[0]) {
        const reason = geocodeData.error_message || geocodeData.status || 'unknown';
        throw new Error(`Could not find the job address (${reason}). Try including city and state.`);
      }

      const jobLocation = geocodeData.results[0].geometry.location;

      const distanceData = await mapsProxy('distancematrix', {
        origins: `${officeLat},${officeLon}`,
        destinations: `${jobLocation.lat},${jobLocation.lng}`,
        units: 'imperial',
      });

      if (distanceData.status !== 'OK' || !distanceData.rows[0]?.elements[0]) {
        const reason = distanceData.error_message || distanceData.status || 'unknown';
        throw new Error(`Distance Matrix error: ${reason}`);
      }

      const element = distanceData.rows[0].elements[0];
      if (element.status !== 'OK') {
        throw new Error(`Could not calculate distance for this route (${element.status}). Make sure both addresses are valid and reachable.`);
      }

      const distanceInMiles = element.distance.value / 1609.34;
      const withinRadius = distanceInMiles <= travelSettings.radius_miles;

      let eligibleMiles = 0;
      let bonusAmount = 0;

      const excessMiles = withinRadius ? 0 : distanceInMiles - travelSettings.radius_miles;

      if (!withinRadius) {
        eligibleMiles = travelSettings.calculation_method === 'round_trip'
          ? excessMiles * 2
          : excessMiles;
        bonusAmount = eligibleMiles * travelSettings.default_rate_per_mile;
      }

      setEstimate({
        distance: distanceInMiles,
        withinRadius,
        eligibleMiles,
        bonusAmount,
        method: travelSettings.calculation_method,
        radiusMiles: travelSettings.radius_miles,
        ratePerMile: travelSettings.default_rate_per_mile,
        excessMiles,
      });
    } catch (err: unknown) {
      console.error('Error calculating estimate:', err);
      setError(err instanceof Error ? err.message : 'Failed to calculate estimate');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-gray-800 rounded-lg shadow-xl border border-gray-700 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-500/20 rounded-lg">
          <Calculator className="w-6 h-6 text-blue-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Trip Estimator</h2>
          <p className="text-sm text-gray-400">Calculate estimated travel bonus for a job</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            <MapPin className="w-4 h-4 inline mr-1" />
            Office Location
          </label>
          <select
            value={selectedOfficeId}
            onChange={(e) => setSelectedOfficeId(e.target.value)}
            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Select an office...</option>
            {offices.map(office => (
              <option key={office.id} value={office.id}>
                {office.office_name} - {getFullAddress(office)}
                {(!office.latitude || !office.longitude) ? ' (no coordinates — will auto-resolve)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            <Navigation className="w-4 h-4 inline mr-1" />
            Job Address
          </label>
          <AddressAutocomplete
            value={jobAddress}
            onChange={setJobAddress}
            placeholder="Enter job address..."
            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <button
          onClick={calculateEstimate}
          disabled={loading || !selectedOfficeId || !jobAddress}
          className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              Calculating...
            </>
          ) : (
            <>
              <Calculator className="w-5 h-5" />
              Calculate Estimate
            </>
          )}
        </button>

        {error && (
          <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-200">{error}</div>
          </div>
        )}

        {estimate && (
          <div className="mt-6 p-6 bg-gray-900/50 border border-gray-700 rounded-lg space-y-4">
            <h3 className="text-lg font-semibold text-white mb-4">Estimate Results</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-gray-400 mb-1">Distance from Office</div>
                <div className="text-2xl font-bold text-white">
                  {estimate.distance.toFixed(1)} mi
                </div>
              </div>

              <div>
                <div className="text-sm text-gray-400 mb-1">Calculation Method</div>
                <div className="text-lg font-semibold text-white capitalize">
                  {estimate.method.replace('_', ' ')}
                </div>
              </div>
            </div>

            {estimate.withinRadius ? (
              <div className="space-y-3">
                <div className="p-4 bg-green-500/20 border border-green-500/50 rounded-lg flex items-start gap-3">
                  <CheckCircle className="w-6 h-6 text-green-400 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-green-400 mb-1">
                      Within Office Service Area
                    </div>
                    <div className="text-sm text-green-200">
                      This job is within the office's service radius. No travel bonus applies.
                    </div>
                  </div>
                </div>
                <div className="px-3 py-2 bg-gray-800/60 border border-gray-700 rounded text-xs text-gray-400 space-y-0.5">
                  <div className="font-medium text-gray-300 mb-1">How we calculated this:</div>
                  <div>{estimate.distance.toFixed(2)} mi (actual distance) &le; {estimate.radiusMiles} mi (service radius) &rarr; no bonus</div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-4 bg-yellow-500/20 border border-yellow-500/50 rounded-lg flex items-start gap-3">
                  <AlertCircle className="w-6 h-6 text-yellow-400 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-yellow-400 mb-1">
                      Outside Service Area
                    </div>
                    <div className="text-sm text-yellow-200">
                      This job qualifies for a travel bonus.
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
                    <div className="text-sm text-gray-400 mb-1">Eligible Miles</div>
                    <div className="text-2xl font-bold text-blue-400">
                      {estimate.eligibleMiles.toFixed(1)} mi
                    </div>
                  </div>

                  <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
                    <div className="text-sm text-gray-400 mb-1">Estimated Bonus</div>
                    <div className="text-2xl font-bold text-green-400 flex items-center gap-1">
                      <DollarSign className="w-6 h-6" />
                      {estimate.bonusAmount.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="px-3 py-2 bg-gray-800/60 border border-gray-700 rounded text-xs text-gray-400 space-y-0.5">
                  <div className="font-medium text-gray-300 mb-1">How we calculated this:</div>
                  <div>{estimate.distance.toFixed(2)} mi (actual) &minus; {estimate.radiusMiles} mi (radius) = {estimate.excessMiles.toFixed(2)} mi excess</div>
                  {estimate.method === 'round_trip' && (
                    <div>{estimate.excessMiles.toFixed(2)} mi &times; 2 (round trip) = {estimate.eligibleMiles.toFixed(2)} eligible miles</div>
                  )}
                  <div>{estimate.eligibleMiles.toFixed(2)} mi &times; ${estimate.ratePerMile.toFixed(2)}/mi = <span className="text-green-400 font-medium">${estimate.bonusAmount.toFixed(2)}</span></div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
