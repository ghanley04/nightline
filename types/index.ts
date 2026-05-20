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

export type SubscriptionStatus =
  | 'active'
  | 'read_only'
  | 'suspended'
  | 'deleted'
  | 'expired'
  | 'canceled';

export interface Subscription {
  id: string;
  userId: string;
  type: 'individual' | 'greek' | 'summer';
  price: number;
  startDate: string;
  endDate: string;
  /**
   * Ownership is split in two:
   *   billing_owner_user_id — user who paid; receives reminders; may opt out of reminders.
   *   admin_owner_user_id   — user who can administer / delete the workspace.
   * On creation both are the purchaser. On a Path A transfer only admin moves.
   * On a Path B transfer both move after the invitee accepts.
   */
  billingOwnerUserId: string;
  adminOwnerUserId: string;
  autoRenew: boolean;
  status: SubscriptionStatus;
  /** ISO timestamp. For Greek subs: createdAt + 1 year. */
  expiresAt?: string;
  /** ISO timestamp at which the subscription moves from active → read_only. */
  readOnlyAt?: string;
  /** ISO timestamp at which the subscription moves from read_only → suspended. */
  suspendedAt?: string;
  /** ISO timestamp at which the record will be hard-deleted. */
  purgeAt?: string;
  /** If true, billing owner has opted out of expiry reminder emails. */
  optOutReminders?: boolean;
}

/**
 * Entry written to GroupData when a user accepts a transfer-ownership warning (Path A)
 * or a Path B invitation, providing an auditable timestamp + the exact warning text
 * the user agreed to.
 */
export interface TransferLogEntry {
  groupId: string;
  path: 'A' | 'B';
  initiatedByUserId: string;
  acceptedByUserId: string;
  warningTextShown: string;
  acceptedAt: string;
}

/**
 * Pending Path B invitation record written to GroupData while awaiting the new
 * owner's acceptance. Keyed by INVITE_TRANSFER#<token>. Expires after 7 days.
 */
export interface PendingTransfer {
  groupId: string;
  token: string;
  fromUserId: string;
  toUserEmail: string;
  path: 'B';
  createdAt: string;
  expiresAt: string;
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