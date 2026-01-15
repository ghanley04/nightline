export type MembershipResponse = {
  tokens: Token[];
  hasMembership: boolean;
  tokenId?: string;
  groupId?: string;
};

export interface Token {
  token_id: string;
  user_id: string;
  group_id: string;
  // stripe_customer_id: string;
  // created_at: string;
  active: boolean;
}

export type InviteResponse = {
  inviteLink?: string;
};