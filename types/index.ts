export type UserType = 'individual' | 'greek' | 'guest';

export interface User {
  id: string;
  email: string;
  name: string;
  phone: string;
  photoUrl: string;
  userType: UserType;
  schoolAffiliation: string;
  subscriptionActive: boolean;
  subscriptionType?: string;
  subscriptionEndDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Bus {
  id: string;
  name: string;
  currentLocation: {
    latitude: number;
    longitude: number;
  };
  route: string;
  isActive: boolean;
  capacity: number;
  currentRiders: number;
}

export interface BusStop {
  id: string;
  name: string;
  location: {
    latitude: number;
    longitude: number;
  };
  routes: string[];
  eta: number[];
}

export interface Subscription {
  id: string;
  userId: string;
  type: 'individual' | 'greek' | 'summer';
  price: number;
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  status: 'active' | 'expired' | 'canceled';
}

export interface GuestPass {
  id: string;
  hostUserId: string;
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  validUntil: string;
  isUsed: boolean;
  createdAt: string;
}

export interface BusRental {
  id: string;
  userId: string;
  date: string;
  startTime: string;
  endTime: string;
  pickupLocation: string;
  dropoffLocation: string;
  numberOfBuses: number;
  totalPrice: number;
  status: 'pending' | 'confirmed' | 'canceled' | 'completed';
  paymentStatus: 'pending' | 'paid';
  createdAt: string;
}

export interface GreekOrganization {
  id: string;
  name: string;
  type: 'fraternity' | 'sorority';
  adminUserId: string;
  memberCount: number;
  subscribedMembers: number;
  createdAt: string;
}