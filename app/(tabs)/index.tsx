import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { RefreshCw, Search, MapPin } from 'lucide-react-native';
import { useBusStore } from '@/store/busStore';
import { mockBuses, mockBusStops } from '@/mocks/busData';
import { BusStop } from '@/types';
import BusStopCard from '@/components/BusStopCard';
import colors from '../../constants/colors';
import MyMapComponent from '@/map/MyMapComponent.native';


export default function MapScreen() {
  const router = useRouter();
  const { buses, stops, selectedStop, setBuses, setStops, setSelectedStop } = useBusStore();

  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredStops, setFilteredStops] = useState(mockBusStops);

  useEffect(() => {
    // Load initial data
    setBuses(mockBuses);
    setStops(mockBusStops);
  }, []);

  useEffect(() => {
    // Filter stops based on search query
    if (searchQuery) {
      const filtered = mockBusStops.filter(stop =>
        stop.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredStops(filtered);
    } else {
      setFilteredStops(mockBusStops);
    }
  }, [searchQuery]);

  const handleRefresh = () => {
    setIsLoading(true);

    // Simulate refreshing data
    setTimeout(() => {
      // Update ETAs with random values
      const updatedStops = mockBusStops.map(stop => ({
        ...stop,
        eta: [
          Math.floor(Math.random() * 10) + 1,
          Math.floor(Math.random() * 15) + 10,
          Math.floor(Math.random() * 15) + 25,
        ],
      }));

      setStops(updatedStops);
      setFilteredStops(updatedStops);
      setIsLoading(false);
    }, 1000);
  };

  const handleSelectStop = (stop: BusStop) => {
    setSelectedStop(stop);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.mapContainer}>
        {/* This would be a real map in production */}
        <MyMapComponent/>

        {/* Refresh button
        <TouchableOpacity 
          style={styles.refreshButton}
          onPress={handleRefresh}
          disabled={isLoading}
        >
          <RefreshCw 
            size={20} 
            color={colors.background} 
            style={isLoading ? styles.rotating : undefined} 
          />
        </TouchableOpacity> */}
      </View>

      <View style={styles.stopsContainer}>
        <View style={styles.stopsHeader}>
          <Text style={styles.stopsTitle}>Nearby Stops</Text>
          <TouchableOpacity
            style={styles.searchButton}
            onPress={() => { }}
          >
            <Search size={20} color={colors.textLight} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.stopsList}
          showsVerticalScrollIndicator={false}
        >
          {filteredStops.map((stop) => (
            <BusStopCard
              key={stop.id}
              stop={stop}
              onPress={handleSelectStop}
              isSelected={selectedStop?.id === stop.id}
            />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mapContainer: {
    height: '50%',
    width: '100%',
    position: 'relative',
  },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  busMarker: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  busMarkerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginRight: 4,
  },
  busMarkerText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
  },
  refreshButton: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: colors.primary,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  rotating: {
    transform: [{ rotate: '45deg' }],
  },
  stopsContainer: {
    flex: 1,
    padding: 16,
    backgroundColor: colors.background,
  },
  stopsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  stopsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  searchButton: {
    padding: 8,
  },
  stopsList: {
    flex: 1,
  },
});