import React from 'react';
import { View, StyleSheet } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

const busRouteCoordinates = [
  { latitude: 38.9511, longitude: -92.3260 }, // Broadway & College Ave
  { latitude: 38.9500, longitude: -92.3230 }, // Broadway & 10th St
  { latitude: 38.9465, longitude: -92.3235 }, // Cherry St & 10th St
  { latitude: 38.9465, longitude: -92.3305 }, // Locust St & 7th St
  { latitude: 38.9440, longitude: -92.3390 }, // Locust St & Providence Rd
  { latitude: 38.9415, longitude: -92.3395 }, // Rollins St & Providence Rd
  { latitude: 38.9405, longitude: -92.3335 }, // Rollins St & College Ave
];

const stops = [
  { latitude: 38.9511, longitude: -92.3260, title: "Stop 1" },
  { latitude: 38.9465, longitude: -92.3235, title: "Stop 2" },
  { latitude: 38.9440, longitude: -92.3390, title: "Stop 3" },
  { latitude: 38.9405, longitude: -92.3335, title: "Stop 4" },
];

const MyMapComponent = () => {
  const initialRegion = {
    latitude: 38.945,
    longitude: -92.332,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };

  return (
    <View style={styles.container}>
      <MapView style={styles.map} initialRegion={initialRegion}>
        {/* Polyline for route */}
        <Polyline
          coordinates={busRouteCoordinates}
          strokeColor="yellow"
          strokeWidth={5}
        />

        {/* Markers for stops */}
        {stops.map((stop, idx) => (
          <Marker
            key={idx}
            coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
            title={stop.title}
          />
        ))}
      </MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default MyMapComponent;
