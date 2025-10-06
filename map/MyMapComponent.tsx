import React, { useEffect, useRef, useState } from "react";
import { View, Dimensions } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { LatLng } from "react-native-maps";
import Constants from 'expo-constants';
// import { GOOGLE_MAPS_API_KEY } from "@env";
//const API_KEY = Constants.android.config.googleMaps.apiKey;
//const API_KEY = Constants.expoConfig?.extra?.googleMapsApiKey;
import MapViewDirections from "react-native-maps-directions";


// const API_KEY = Constants.android.config.googleMapsApiKey;
//console.log("Loaded OLD API key:", API_KEY);

// Polyline decoder (Google-compatible)
// function decodePolyline(encoded: string) {
//   let points = [];
//   let index = 0, len = encoded.length;
//   let lat = 0, lng = 0;

//   while (index < len) {
//     let b, shift = 0, result = 0;
//     do {
//       b = encoded.charCodeAt(index++) - 63;
//       result |= (b & 0x1f) << shift;
//       shift += 5;
//     } while (b >= 0x20);
//     let dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
//     lat += dlat;

//     shift = 0;
//     result = 0;
//     do {
//       b = encoded.charCodeAt(index++) - 63;
//       result |= (b & 0x1f) << shift;
//       shift += 5;
//     } while (b >= 0x20);
//     let dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
//     lng += dlng;

//     points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
//   }

//   return points;
// }


//needs permissions from google maps api - get rid of all restrictions
// export default function MyMapComponent() {
// const [routeCoords, setRouteCoords] = useState<LatLng[]>([]);

//   useEffect(() => {
//     const fetchRoute = async () => {
//       try {
//         const origin = "MU+Student+Center,Columbia,MO";
//         const destination = "MU+Student+Center,Columbia,MO";
//         const waypoints = "Uprise+Bakery,Columbia,MO|Shiloh+Bar+and+Grill,Columbia,MO";
//         const apiKey = API_KEY;

//         const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&waypoints=${waypoints}&mode=driving&key=${apiKey}`;

//         const response = await fetch(url);
//         const data = await response.json();
// console.log("Directions API response:", data);

//         if (data.routes.length) {
//           const points = decodePolyline(data.routes[0].overview_polyline.points);
//           setRouteCoords(points);
//         }
//       } catch (err) {
//         console.error("Error fetching route:", err);
//       }
//     };

//     fetchRoute();
//   }, []);

//   return (
//     <View style={{ flex: 1 }}>
//       <MapView
//         style={{ width: Dimensions.get("window").width, height: Dimensions.get("window").height }}
//         initialRegion={{
//           latitude: 38.9457, // MU Student Center area
//           longitude: -92.3280,
//           latitudeDelta: 0.01,
//           longitudeDelta: 0.01,
//         }}
//       >
//         {routeCoords.length > 0 && (
//           <Polyline
//             coordinates={routeCoords}
//             strokeColor="#FF0000"
//             strokeWidth={4}
//           />
//         )}
//       </MapView>
//     </View>
//   );
// }

//uses map markers
export default function MyMapComponent() {
  const mapRef = useRef<MapView>(null);
  const [apiKey, setApiKey] = useState<string>("");

  useEffect(() => {
    setApiKey(Constants.expoConfig?.extra?.googleMapsApiKey);
  }, []);

  const origin = { latitude: 38.9457, longitude: -92.3280 }; // MU Student Center
  const destination = { latitude: 38.9457, longitude: -92.3280 }; // same for round trip
  const waypoints = [
    { latitude: 38.9481, longitude: -92.3265 }, // Uprise Bakery
    { latitude: 38.9465, longitude: -92.3230 }, // Shiloh Bar & Grill
  ];

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={{ width: Dimensions.get("window").width, height: Dimensions.get("window").height }}
        initialRegion={{
          latitude: origin.latitude,
          longitude: origin.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        provider="google"
      >
        <Marker coordinate={origin} title="MU Student Center" />
        <Marker coordinate={waypoints[0]} title="Uprise Bakery" />
        <Marker coordinate={waypoints[1]} title="Shiloh Bar & Grill" />
        {apiKey ? (

          <MapViewDirections
            origin={origin}
            destination={destination}
            waypoints={waypoints}
            apikey={apiKey}
            strokeWidth={4}
            strokeColor="red"
            optimizeWaypoints={true}
            onReady={result => {
              // Auto-fit route in map
              mapRef.current?.fitToCoordinates(result.coordinates, {
                edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
                animated: true,
              });
            }}
            onError={(errorMessage) => {
              console.error("MapViewDirections error:", errorMessage);
            }}
          />
        ) : (
          <View>Loading map...</View> // optional loading indicator
        )}
      </MapView>
    </View>
  );
}