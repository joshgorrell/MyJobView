import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { supabase } from '../../lib/supabase';

// Declare google maps types
declare global {
  interface Window {
    google: any;
  }
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string, addressComponents?: {
    city?: string;
    state?: string;
    zip?: string;
  }) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

export function AddressAutocomplete({
  value,
  onChange,
  placeholder = 'Enter address',
  className = '',
  required = false
}: AddressAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    loadApiKey();
  }, []);

  async function loadApiKey() {
    try {
      console.log('AddressAutocomplete: Loading Google Maps API key...');
      const { data, error } = await supabase
        .from('company_settings')
        .select('google_maps_api_key')
        .maybeSingle();

      if (error) {
        console.error('AddressAutocomplete: Error loading API key:', error);
        setHasError(true);
        return;
      }

      if (data?.google_maps_api_key) {
        console.log('AddressAutocomplete: API key loaded successfully');
        setApiKey(data.google_maps_api_key);
      } else {
        console.warn('AddressAutocomplete: No API key found in settings');
        setHasError(true);
      }
    } catch (error) {
      console.error('AddressAutocomplete: Error loading Google Maps API key:', error);
      setHasError(true);
    }
  }

  useEffect(() => {
    if (!apiKey) return;

    // Check if already loaded
    if (window.google?.maps?.places?.Autocomplete) {
      setIsScriptLoaded(true);
      return;
    }

    const existingScript = document.querySelector(
      `script[src*="maps.googleapis.com"]`
    );

    let checkInterval: NodeJS.Timeout | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    const waitForGoogleMaps = () => {
      // Wait for google.maps.places to be available
      checkInterval = setInterval(() => {
        if (window.google?.maps?.places?.Autocomplete) {
          if (checkInterval) clearInterval(checkInterval);
          if (timeoutId) clearTimeout(timeoutId);
          setIsScriptLoaded(true);
        }
      }, 100);

      // Timeout after 10 seconds
      timeoutId = setTimeout(() => {
        if (checkInterval) clearInterval(checkInterval);
        console.error('Google Maps Places API failed to load within 10 seconds');
        setHasError(true);
      }, 10000);
    };

    if (existingScript) {
      waitForGoogleMaps();
      return () => {
        if (checkInterval) clearInterval(checkInterval);
        if (timeoutId) clearTimeout(timeoutId);
      };
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', waitForGoogleMaps);
    script.addEventListener('error', () => {
      console.error('Failed to load Google Maps script');
      setHasError(true);
    });
    document.head.appendChild(script);

    return () => {
      script.removeEventListener('load', waitForGoogleMaps);
      if (checkInterval) clearInterval(checkInterval);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [apiKey]);

  useEffect(() => {
    if (!isScriptLoaded || !containerRef.current) {
      return;
    }

    // Wait for google.maps.places to be available
    if (!window.google?.maps?.places?.Autocomplete) {
      console.warn('Google Places Autocomplete not yet available');
      return;
    }

    try {
      // Create input element
      const inputElement = document.createElement('input');
      inputElement.type = 'text';
      inputElement.value = value || '';
      inputElement.placeholder = placeholder;
      inputElement.className = className;
      if (required) {
        inputElement.required = true;
      }

      // Clear container and append input
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(inputElement);

      // Create autocomplete
      const autocomplete = new window.google.maps.places.Autocomplete(inputElement, {
        types: ['address'],
        componentRestrictions: { country: 'us' }
      });

      // Handle manual input
      const handleInput = (e: Event) => {
        const target = e.target as HTMLInputElement;
        onChange(target.value);
      };

      // Handle place selection
      const handlePlaceChanged = () => {
        const place = autocomplete.getPlace();

        if (!place.address_components) {
          return;
        }

        let streetNumber = '';
        let route = '';
        let city = '';
        let state = '';
        let zip = '';

        place.address_components.forEach((component) => {
          const types = component.types;

          if (types.includes('street_number')) {
            streetNumber = component.long_name;
          }
          if (types.includes('route')) {
            route = component.long_name;
          }
          if (types.includes('locality')) {
            city = component.long_name;
          }
          if (types.includes('sublocality_level_1') && !city) {
            city = component.long_name;
          }
          if (types.includes('administrative_area_level_1')) {
            state = component.short_name;
          }
          if (types.includes('postal_code')) {
            zip = component.long_name;
          }
          if (types.includes('postal_code_suffix')) {
            zip = zip ? `${zip}-${component.long_name}` : component.long_name;
          }
        });

        const streetAddress = `${streetNumber} ${route}`.trim();
        const finalAddress = streetAddress || (place.formatted_address?.split(',')[0] || '');

        console.log('Google Places extracted:', { finalAddress, city, state, zip });

        onChange(finalAddress, {
          city: city || undefined,
          state: state || undefined,
          zip: zip || undefined
        });
      };

      inputElement.addEventListener('input', handleInput);
      autocomplete.addListener('place_changed', handlePlaceChanged);

      return () => {
        inputElement.removeEventListener('input', handleInput);
        window.google.maps.event.clearInstanceListeners(autocomplete);
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
        }
      };
    } catch (error) {
      console.error('Error creating place autocomplete:', error);
      setHasError(true);
    }
  }, [isScriptLoaded, placeholder, className, required]);

  // Separate effect to update value without recreating the input
  useEffect(() => {
    if (!containerRef.current) return;

    const inputElement = containerRef.current.querySelector('input');
    if (inputElement && inputElement !== document.activeElement) {
      // Only update if the input is not focused (to avoid interfering with user typing)
      inputElement.value = value || '';
    }
  }, [value]);

  if (!apiKey) {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
        required={required}
      />
    );
  }

  if (hasError) {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
        required={required}
      />
    );
  }

  return (
    <div ref={containerRef} className={className}>
      {!isScriptLoaded && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={className}
          required={required}
        />
      )}
    </div>
  );
}
