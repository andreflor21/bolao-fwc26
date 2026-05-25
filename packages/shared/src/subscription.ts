export type SubscriptionStatus = 'pending_payment' | 'active' | 'refunded';

export interface SubscriptionDto {
  id: string;
  competitionId: string;
  status: SubscriptionStatus;
  amountCents: number;
  createdAt: string;
  paidAt: string | null;
}

export const REFUND_WINDOW_DAYS = 7;
