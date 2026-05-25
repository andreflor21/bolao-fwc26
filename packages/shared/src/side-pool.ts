export const MAX_SIDE_POOLS_PER_OWNER = 20;
export const DEFAULT_SIDE_POOL_MAX_MEMBERS = 100;

export interface SidePoolDto {
  id: string;
  name: string;
  description: string | null;
  ownerUserId: string;
  maxMembers: number;
  memberCount: number;
  inviteToken: string;
  createdAt: string;
}

export interface SidePoolMemberDto {
  id: string;
  userId: string;
  name: string;
  joinedAt: string;
}
