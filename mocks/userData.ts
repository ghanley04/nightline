import { User, Subscription, GuestPass } from '@/types';

export const mockUser: User = {
  id: 'user-123456',
  email: 'student@missouri.edu',
  name: 'Alex Johnson',
  phone: '555-123-4567',
  photoUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=1974&auto=format&fit=crop',
  userType: 'individual',
  schoolAffiliation: 'University of Missouri',
  subscriptionActive: true,
  subscriptionType: 'individual',
  subscriptionEndDate: '2025-12-31',
  createdAt: '2025-01-15',
  updatedAt: '2025-06-01',
};

export const mockSubscription: Subscription = {
  id: 'sub-123456',
  userId: 'user-123456',
  type: 'individual',
  price: 32.99,
  startDate: '2025-01-15',
  endDate: '2025-12-31',
  autoRenew: true,
  status: 'active',
};

export const mockGuestPasses: GuestPass[] = [
  {
    id: 'guest-1',
    hostUserId: 'user-123456',
    guestName: 'Jamie Smith',
    guestEmail: 'jamie@example.com',
    guestPhone: '555-987-6543',
    validUntil: '2025-06-17T05:00:00Z',
    isUsed: false,
    createdAt: '2025-06-16T18:30:00Z',
  },
];