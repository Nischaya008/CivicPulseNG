import { useState, useEffect } from 'react';

export interface LocationData {
  lat: number;
  lng: number;
  address: string;
  road: string;
  district: string;
  city: string;
  state: string;
  pincode: string;
}

export function useUserLocation() {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check cache first
    const cached = sessionStorage.getItem('civicpulse_user_location');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        // Check if cache is less than 30 minutes old
        if (parsed.timestamp && Date.now() - parsed.timestamp < 30 * 60 * 1000) {
          setLocation(parsed.data);
          setLoading(false);
          return;
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`);
          const data = await res.json();
          
          if (data && data.address) {
            const locData: LocationData = {
              lat: latitude,
              lng: longitude,
              address: data.display_name || '',
              road: data.address.road || data.address.pedestrian || '',
              district: data.address.city_district || data.address.state_district || data.address.county || '',
              city: data.address.city || data.address.town || data.address.village || '',
              state: data.address.state || '',
              pincode: data.address.postcode || '',
            };
            
            setLocation(locData);
            sessionStorage.setItem('civicpulse_user_location', JSON.stringify({
              timestamp: Date.now(),
              data: locData
            }));
          } else {
            setError('Could not reverse geocode location');
          }
        } catch (err) {
          setError('Failed to fetch location details');
          console.error("Geocoding failed", err);
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  return { location, loading, error };
}
