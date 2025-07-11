import { create } from 'zustand';
import { Bus, BusStop } from '@/types';

interface BusState {
  buses: Bus[];
  stops: BusStop[];
  selectedStop: BusStop | null;
  isLoading: boolean;
  error: string | null;
  setBuses: (buses: Bus[]) => void;
  setStops: (stops: BusStop[]) => void;
  setSelectedStop: (stop: BusStop | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useBusStore = create<BusState>((set) => ({
  buses: [],
  stops: [],
  selectedStop: null,
  isLoading: false,
  error: null,
  setBuses: (buses) => set({ buses }),
  setStops: (stops) => set({ stops }),
  setSelectedStop: (stop) => set({ selectedStop: stop }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));