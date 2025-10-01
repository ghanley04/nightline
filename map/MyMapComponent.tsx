import Constants from 'expo-constants';
import React, { useState, useEffect } from 'react';
import MapView, { Polyline, Marker } from 'react-native-maps';
import polyline from '@mapbox/polyline';
// ... other imports ...

// Access the key directly from the `extra` field defined in app.json
const API_KEY = Constants.android.config.googleMapsApiKey;

// ------------------------------------------------------------------
// The rest of your constant setup remains the same, but the API_KEY
// variable is now dynamic!
// ------------------------------------------------------------------

const START_END = { lat: 38.9426691, lng: -92.3267708 }; 
// ... WAYPOINTS and helper functions ...

const DIRECTIONS_API_URL = 
  `https://maps.googleapis.com/maps/api/directions/json?` +
  `origin=${formatCoord(START_END)}&` +
  `destination=${formatCoord(START_END)}&` + 
  `waypoints=${WAYPOINTS_STRING}&` +
  `mode=driving&` +
  // The key is now referenced from the Constants module
  `key=${API_KEY}`;

// ... The rest of your BusLoopMap component logic ...

 // You need to install this: npm install @mapbox/polyline

const BusLoopMap = () => {
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAndDecodeRoute = async () => {
    try {
      const response = await fetch(DIRECTIONS_API_URL);
      const json = await response.json();
      
      // Ensure the API returned a valid route
      if (json.routes.length === 0) {
        console.error('No route found.');
        return;
      }

      // 1. Get the encoded string
      const encodedPolyline = json.routes[0].overview_polyline.points;

      // 2. Decode the string into an array of [lat, lng] arrays
      const decoded = polyline.decode(encodedPolyline);
      
      // 3. Convert to the { latitude, longitude } format required by react-native-maps
      const coordinates = decoded.map(point => ({
        latitude: point[0],
        longitude: point[1],
      }));

      setRouteCoordinates(coordinates);
    } catch (error) {
      console.error("Error fetching directions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAndDecodeRoute();
  }, []);

  const allStops = [
    { name: "MU Student Center (Start/End)", lat: START_END.lat, lng: START_END.lng },
    ...WAYPOINTS
  ];

  const initialRegion = {
    latitude: START_END.lat,
    longitude: START_END.lng,
    latitudeDelta: 0.05, // Zoom level for the area
    longitudeDelta: 0.05,
  };

  return (
    <MapView
      provider="google"
      initialRegion={initialRegion}
      style={{ flex: 1 }}
      // You can add a ref here for programmatic map control (e.g., fitting the entire route)
    >
      {/* 🛑 RENDER THE BUS LOOP 🛑 */}
      {routeCoordinates.length > 0 && (
        <Polyline
          coordinates={routeCoordinates}
          strokeColor="#34495E" // Dark blue for the route line
          strokeWidth={6}
          lineCap="round"
        />
      )}

      {/* RENDER MARKERS FOR EACH STOP */}
      {allStops.map((stop, index) => (
        <Marker
          key={index}
          coordinate={{ latitude: stop.lat, longitude: stop.lng }}
          title={stop.name}
        />
      ))}
      
      {isLoading && <Text style={{ position: 'absolute', top: 50 }}>Loading Route...</Text>}
    </MapView>
  );
};