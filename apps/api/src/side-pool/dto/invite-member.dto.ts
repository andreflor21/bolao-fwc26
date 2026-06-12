import { IsUUID } from 'class-validator';

export class InviteMemberDto {
  /** Participante que receberá o convite para o bolão paralelo. */
  @IsUUID()
  inviteeUserId!: string;
}
