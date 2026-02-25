import React, { useEffect, useRef } from "react";
import { View, Dimensions, Platform } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, PROVIDER_DEFAULT } from "react-native-maps";
import colors from '../constants/colors';

export default function MyMapComponent() {
  const mapRef = useRef<MapView>(null);

  const waypoints = [
    { latitude: 38.951418, longitude: -92.321882 },
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
    { latitude: 38.951418, longitude: -92.321882 },
  ];

  const getPerpendicularOffset = (p1: { latitude: number, longitude: number }, p2: { latitude: number, longitude: number }, distance: number) => {
    const dx = p2.longitude - p1.longitude;
    const dy = p2.latitude - p1.latitude;
    const length = Math.sqrt(dx * dx + dy * dy);
    const perpX = -dy / length * distance;
    const perpY = dx / length * distance;
    return { lat: perpY, lng: perpX };
  };

  const offset = 0.00015;
  const waypointsParallel = waypoints.map((point, index) => {
    if (index === 0) {
      const perp = getPerpendicularOffset(waypoints[0], waypoints[1], offset);
      return { latitude: point.latitude + perp.lat, longitude: point.longitude + perp.lng };
    } else if (index === waypoints.length - 1) {
      const perp = getPerpendicularOffset(waypoints[index - 1], waypoints[index], offset);
      return { latitude: point.latitude + perp.lat, longitude: point.longitude + perp.lng };
    } else {
      const perp1 = getPerpendicularOffset(waypoints[index - 1], waypoints[index], offset);
      const perp2 = getPerpendicularOffset(waypoints[index], waypoints[index + 1], offset);
      const angle1 = Math.atan2(perp1.lat, perp1.lng);
      const angle2 = Math.atan2(perp2.lat, perp2.lng);
      const avgAngle = (angle1 + angle2) / 2;
      const angleDiff = Math.abs(angle2 - angle1);
      const miterLength = offset / Math.cos(angleDiff / 2);
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
      latitude: (minLat + maxLat) / 2 - 0.008,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: (maxLat - minLat) * 1.4,
      longitudeDelta: (maxLng - minLng) * 1.4,
    };
  };

  const mapCenter = getMapCenter(waypoints);

  // Use Apple Maps in Expo Go (iOS), Google Maps everywhere else
  const mapProvider = Platform.OS === 'ios' && __DEV__ 
    ? PROVIDER_DEFAULT 
    : PROVIDER_GOOGLE;

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={{ width: Dimensions.get("window").width, height: Dimensions.get("window").height }}
        initialRegion={mapCenter}
        provider={mapProvider}
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