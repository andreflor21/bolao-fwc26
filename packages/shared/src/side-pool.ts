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

/** Convite de bolão paralelo recebido pelo usuário logado (vira badge no nome). */
export interface SidePoolInviteDto {
  inviteId: string;
  sidePoolId: string;
  sidePoolName: string;
  invitedByName: string;
  memberCount: number;
  maxMembers: number;
  createdAt: string;
}

/** Estado de um bolão paralelo do usuário logado em relação a um participante alvo. */
export type InvitablePoolState = 'member' | 'invited' | 'invitable' | 'full';

export interface InvitablePoolDto {
  sidePoolId: string;
  name: string;
  memberCount: number;
  maxMembers: number;
  state: InvitablePoolState;
  /** Preenchido quando state === 'invited' (permite cancelar o convite). */
  inviteId: string | null;
}
