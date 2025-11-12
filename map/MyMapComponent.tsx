import React, { useEffect, useRef } from "react";
import { View, Dimensions } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import colors from '../constants/colors';

//uses map markers
export default function MyMapComponent() {
  const mapRef = useRef<MapView>(null);

  const waypoints = [
    { latitude: 38.951418, longitude: -92.321882 }, //starts at top right corner and goes clockwise
    { latitude: 38.942153, longitude: -92.322040 },
    { latitude: 38.942203, longitude: -92.328516 },
    { latitude: 38.942738, longitude: -92.333157 },
    { latitude: 38.942778, longitude: -92.333680 },
    { latitude: 38.943660, longitude: -92.334343 },
    { latitude: 38.944235, longitude: -92.334585 },
    { latitude: 38.949575, longitude: -92.334189 },
    { latitude: 38.949530, longitude: -92.329766 },
    { latitude: 38.950551, longitude: -92.329743 },
    { latitude: 38.950478, longitude: -92.326516 },
    { latitude: 38.951537, longitude: -92.326469 },
    { latitude: 38.951418, longitude: -92.321882 }, //same as the first so it will be a loop
  ];

  // Function to calculate perpendicular offset
  const getPerpendicularOffset = (p1: { latitude: number, longitude: number }, p2: { latitude: number, longitude: number }, distance: number) => {
    const dx = p2.longitude - p1.longitude;
    const dy = p2.latitude - p1.latitude;
    const length = Math.sqrt(dx * dx + dy * dy);

    // Perpendicular vector (rotated 90 degrees to the right)
    const perpX = -dy / length * distance;
    const perpY = dx / length * distance;

    return { lat: perpY, lng: perpX };
  };

  // Calculate parallel waypoints with proper miter joints
  const offset = 0.00015; // about 30 meters
  const waypointsParallel = waypoints.map((point, index) => {
    if (index === 0) {
      // First point: use direction to next point
      const perp = getPerpendicularOffset(waypoints[0], waypoints[1], offset);
      return { latitude: point.latitude + perp.lat, longitude: point.longitude + perp.lng };
    } else if (index === waypoints.length - 1) {
      // Last point: use direction from previous point
      const perp = getPerpendicularOffset(waypoints[index - 1], waypoints[index], offset);
      return { latitude: point.latitude + perp.lat, longitude: point.longitude + perp.lng };
    } else {
      // Middle points: use miter join calculation
      const perp1 = getPerpendicularOffset(waypoints[index - 1], waypoints[index], offset);
      const perp2 = getPerpendicularOffset(waypoints[index], waypoints[index + 1], offset);

      // Calculate the bisector angle for proper miter
      const angle1 = Math.atan2(perp1.lat, perp1.lng);
      const angle2 = Math.atan2(perp2.lat, perp2.lng);
      const avgAngle = (angle1 + angle2) / 2;

      // Calculate miter length (compensates for acute angles)
      const angleDiff = Math.abs(angle2 - angle1);
      const miterLength = offset / Math.cos(angleDiff / 2);

      // Limit miter length to avoid extreme spikes at very sharp turns
      const limitedMiterLength = Math.min(miterLength, offset * 3);

      return {
        latitude: point.latitude + Math.sin(avgAngle) * limitedMiterLength,
        longitude: point.longitude + Math.cos(avgAngle) * limitedMiterLength
      };
    }
  });

  const getMapCenter = (coordinates: { latitude: number, longitude: number }[]) => {
    const latitudes = coordinates.map(coord => coord.latitude);
    const longitudes = coordinates.map(coord => coord.longitude);

    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);

    return {
      latitude: (minLat + maxLat) / 2 - 0.008, // Add offset to move map up
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: (maxLat - minLat) * 1.4,
      longitudeDelta: (maxLng - minLng) * 1.4,
    };
  };

  // Use it in your component
  const mapCenter = getMapCenter(waypoints);

  // useEffect(() => {
  //   if (mapRef.current) {
  //     mapRef.current.fitToCoordinates(waypoints, {
  //       edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
  //       animated: true,
  //     });
  //   }
  // }, []);

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={{ width: Dimensions.get("window").width, height: Dimensions.get("window").height }}
        initialRegion={mapCenter}
        provider="google"
      >
        <Marker coordinate={waypoints[2]} title="MU Student Center" />
        <Marker coordinate={waypoints[0]} title="Uprise Bakery" />
        <Marker coordinate={waypoints[1]} title="Shiloh Bar & Grill" />

        <Polyline
          coordinates={waypoints}
          strokeWidth={4}
          strokeColor={colors.text}
        />
        <Polyline
          coordinates={waypointsParallel}
          strokeWidth={4}
          strokeColor={colors.primary}
        />
      </MapView>
    </View>
  );
}