import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class SendGroupInvitesBody {
  /** IDs de usuários alvo. Vazio = todos os opt-ins elegíveis. */
  @IsArray()
  @IsUUID('all', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  userIds!: string[];

  /**
   * Template da mensagem. Suporta placeholders `{nome}` e `{linkConvite}`.
   * Se vazio, usa o template default do service.
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  template?: string;

  /**
   * Quando true (default), tenta adicionar diretamente ao grupo primeiro.
   * Quem falhar (privacidade do WhatsApp) recebe DM com o link.
   * Quando false, todos recebem DM direto.
   */
  @IsOptional()
  @IsBoolean()
  tryAddDirect?: boolean;
}
