import { Bus, BusStop } from '@/types';

export const mockBuses: Bus[] = [
  {
    id: 'bus-1',
    name: 'Bus 1',
    currentLocation: {
      latitude: 38.9517,
      longitude: -92.3341,
    },
    route: 'Main Route',
    isActive: true,
    capacity: 30,
    currentRiders: 12,
  },
  {
    id: 'bus-2',
    name: 'Bus 2',
    currentLocation: {
      latitude: 38.9487,
      longitude: -92.3281,
    },
    route: 'Main Route',
    isActive: true,
    capacity: 30,
    currentRiders: 18,
  },
  {
    id: 'bus-3',
    name: 'Bus 3',
    currentLocation: {
      latitude: 38.9447,
      longitude: -92.3301,
    },
    route: 'Greek Row',
    isActive: true,
    capacity: 30,
    currentRiders: 22,
  },
];

export const mockBusStops: BusStop[] = [
  {
    id: 'stop-1',
    name: 'Student Center',
    location: {
      latitude: 38.9447,
      longitude: -92.3261,
    },
    routes: ['Main Route', 'Greek Row'],
    eta: [3, 12, 24],
  },
  {
    id: 'stop-2',
    name: 'Memorial Union',
    location: {
      latitude: 38.9457,
      longitude: -92.3251,
    },
    routes: ['Main Route'],
    eta: [5, 18, 30],
  },
  {
    id: 'stop-3',
    name: 'Ellis Library',
    location: {
      latitude: 38.9437,
      longitude: -92.3271,
    },
    routes: ['Main Route'],
    eta: [8, 21, 33],
  },
  {
    id: 'stop-4',
    name: 'Greek Town',
    location: {
      latitude: 38.9427,
      longitude: -92.3291,
    },
    routes: ['Greek Row'],
    eta: [2, 15, 27],
  },
  {
    id: 'stop-5',
    name: 'Downtown',
    location: {
      latitude: 38.9517,
      longitude: -92.3281,
    },
    routes: ['Main Route', 'Greek Row'],
    eta: [10, 23, 35],
  },
];