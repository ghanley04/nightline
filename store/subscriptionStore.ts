import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Subscription, GuestPass } from '@/types';

interface SubscriptionState {
  subscription: Subscription | null;
  guestPasses: GuestPass[];
  isLoading: boolean;
  error: string | null;
  setSubscription: (subscription: Subscription | null) => void;
  setGuestPasses: (passes: GuestPass[]) => void;
  addGuestPass: (pass: GuestPass) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useSubscriptionStore = create<SubscriptionState>()(
  persist(
    (set) => ({
      subscription: null,
      guestPasses: [],
      isLoading: false,
      error: null,
      setSubscription: (subscription) => set({ subscription }),
      setGuestPasses: (guestPasses) => set({ guestPasses }),
      addGuestPass: (pass) => set((state) => ({ 
        guestPasses: [...state.guestPasses, pass] 
      })),
      setIsLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
    }),
    {
      name: 'subscription-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);