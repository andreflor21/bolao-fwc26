import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface WhatsappSendResult {
  /** ID da mensagem retornado pelo provedor (vazio em mock/falha sem retorno). */
  messageId: string;
}

export interface ParticipantAddResult {
  /** Número E.164 (só dígitos, com país). */
  number: string;
  added: boolean;
  /** Code/status que o provider devolveu (ex.: 200, 403, 408). */
  status: string;
  /** Mensagem do provider quando não adicionado (privacidade, não tem WA, etc.). */
  message?: string;
}

/**
 * Provider WhatsApp — encapsula o envio de uma mensagem de texto para o grupo
 * configurado em `WHATSAPP_GROUP_JID`. Dois drivers:
 *
 *   - `mock`  : loga no console (default em dev/test, evita acoplar testes a API externa)
 *   - `evolution` : Evolution API (self-host). `POST /message/sendText/{instance}`
 *                   com header `apikey`. Postagem em grupo é suportada via JID
 *                   `120363xxx@g.us` (mesmo endpoint que mensagem individual).
 *
 * Toda comunicação de negócio (presets, IA, persistência do log) vive no
 * `BroadcastService` — este aqui só fala HTTP com o provider.
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly driver: 'mock' | 'evolution';
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly instance: string;
  private readonly groupJid: string;
  /** Cache em memória do invite code (Evolution não muda salvo revogar manualmente). */
  private cachedInviteCode: string | null = null;
  private cachedInviteCodeAt = 0;

  constructor(config: ConfigService) {
    const provider = (config.get<string>('WHATSAPP_PROVIDER') ?? 'mock').toLowerCase();
    this.driver = provider === 'evolution' ? 'evolution' : 'mock';
    this.apiUrl = (config.get<string>('EVOLUTION_API_URL') ?? '').replace(/\/+$/, '');
    this.apiKey = config.get<string>('EVOLUTION_API_KEY') ?? '';
    this.instance = config.get<string>('EVOLUTION_INSTANCE') ?? '';
    this.groupJid = config.get<string>('WHATSAPP_GROUP_JID') ?? '';

    if (this.driver === 'evolution') {
      const missing: string[] = [];
      if (!this.apiUrl) missing.push('EVOLUTION_API_URL');
      if (!this.apiKey) missing.push('EVOLUTION_API_KEY');
      if (!this.instance) missing.push('EVOLUTION_INSTANCE');
      if (!this.groupJid) missing.push('WHATSAPP_GROUP_JID');
      if (missing.length > 0) {
        this.logger.warn(
          `WHATSAPP_PROVIDER=evolution mas faltam: ${missing.join(', ')} — caindo para mock`,
        );
        this.driver = 'mock';
      }
    }
    this.logger.log(`WhatsApp driver: ${this.driver}` + (this.driver === 'evolution' ? ` (group=${this.groupJid})` : ''));
  }

  /** Driver efetivo após validação das envs (útil pra UI mostrar "modo demo"). */
  getDriver(): 'mock' | 'evolution' {
    return this.driver;
  }

  /** JID configurado (vazio em mock); útil pra UI mostrar o destino na confirmação. */
  getGroupJid(): string {
    return this.groupJid;
  }

  async sendText(text: string): Promise<WhatsappSendResult> {
    if (!text.trim()) throw new Error('Mensagem vazia');
    if (this.driver === 'mock') {
      this.logger.log(`[mock] WhatsApp ${this.groupJid || '<sem grupo>'}: ${text}`);
      return { messageId: '' };
    }
    return this.sendViaEvolution(this.groupJid, text);
  }

  /**
   * DM (direct message) para um número específico. Usado pelo fluxo de convite
   * pro grupo: para cada opt-in cujo número não pode ser adicionado direto,
   * mandamos uma mensagem com o link do grupo.
   */
  async sendTextTo(number: string, text: string): Promise<WhatsappSendResult> {
    if (!text.trim()) throw new Error('Mensagem vazia');
    const normalized = normalizePhone(number);
    if (!normalized) throw new Error(`Número inválido: ${number}`);
    if (this.driver === 'mock') {
      this.logger.log(`[mock] DM ${normalized}: ${text}`);
      return { messageId: '' };
    }
    return this.sendViaEvolution(normalized, text);
  }

  /**
   * Devolve a URL pública de convite do grupo (`https://chat.whatsapp.com/<code>`).
   * Em driver=mock, devolve uma URL fake — o admin pode editar o template antes
   * de "enviar" pra ver como ficaria. Em evolution, busca o código via
   * `GET /group/inviteCode/{instance}?groupJid=...` e cacheia por 1h.
   *
   * Pré-requisito: o bot precisa ser admin do grupo (Evolution retorna 403 se não for).
   */
  async getGroupInviteUrl(): Promise<string> {
    if (this.driver === 'mock') {
      return 'https://chat.whatsapp.com/MOCK-INVITE-CODE';
    }
    const now = Date.now();
    if (this.cachedInviteCode && now - this.cachedInviteCodeAt < 60 * 60 * 1000) {
      return `https://chat.whatsapp.com/${this.cachedInviteCode}`;
    }
    const url = `${this.apiUrl}/group/inviteCode/${encodeURIComponent(this.instance)}?groupJid=${encodeURIComponent(this.groupJid)}`;
    const response = await fetch(url, { headers: { apikey: this.apiKey } });
    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`Evolution inviteCode ${response.status}: ${bodyText.slice(0, 200)}`);
    }
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      throw new Error(`Evolution inviteCode devolveu não-JSON: ${bodyText.slice(0, 200)}`);
    }
    const code = extractInviteCode(parsed);
    if (!code) {
      throw new Error(`Evolution inviteCode: resposta sem code. body=${bodyText.slice(0, 200)}`);
    }
    this.cachedInviteCode = code;
    this.cachedInviteCodeAt = now;
    return `https://chat.whatsapp.com/${code}`;
  }

  /**
   * Tenta adicionar uma lista de números ao grupo configurado. Retorna o
   * resultado por número — chamadores devem usar isso pra decidir quem cai
   * no fallback (DM com invite link). Evolution responde por participante
   * com `status: "200" | "403" | "408" | ...`:
   *   - 200 = adicionado
   *   - 403 = privacidade do usuário bloqueia adição em grupos
   *   - 408 = número não tem WhatsApp
   */
  async addParticipantsToGroup(numbers: string[]): Promise<ParticipantAddResult[]> {
    const normalized = numbers
      .map((n) => ({ raw: n, e164: normalizePhone(n) }))
      .filter((n): n is { raw: string; e164: string } => n.e164 !== null);

    if (this.driver === 'mock') {
      this.logger.log(`[mock] addParticipants ${this.groupJid || '<sem grupo>'}: ${normalized.map((n) => n.e164).join(', ')}`);
      return normalized.map((n) => ({ number: n.e164, added: true, status: '200' }));
    }

    if (normalized.length === 0) return [];

    const url = `${this.apiUrl}/group/updateParticipant/${encodeURIComponent(this.instance)}?groupJid=${encodeURIComponent(this.groupJid)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.apiKey,
      },
      body: JSON.stringify({
        action: 'add',
        participants: normalized.map((n) => n.e164),
      }),
    });
    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`Evolution updateParticipant ${response.status}: ${bodyText.slice(0, 200)}`);
    }
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      throw new Error(`Evolution updateParticipant: resposta não-JSON`);
    }
    return parseParticipantResults(parsed, normalized.map((n) => n.e164));
  }

  // -------- internos --------

  private async sendViaEvolution(toJidOrNumber: string, text: string): Promise<WhatsappSendResult> {
    const url = `${this.apiUrl}/message/sendText/${encodeURIComponent(this.instance)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.apiKey,
      },
      body: JSON.stringify({ number: toJidOrNumber, text }),
    });
    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`Evolution API ${response.status}: ${bodyText.slice(0, 200)}`);
    }
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      // resposta sem JSON — segue com messageId vazio
    }
    const messageId = extractMessageId(parsed);
    return { messageId };
  }
}

// -------- helpers exportáveis (também usados em testes) --------

/**
 * Normaliza telefones BR para o formato E.164 sem o `+`:
 *   "(11) 99999-9999" → "5511999999999"
 *   "5511999999999"   → "5511999999999"
 *   "+55 11 99999..." → "5511999999999"
 * Devolve null quando não consegue identificar.
 */
export function normalizePhone(raw: string): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) return digits;
  if (digits.length === 12 && digits.startsWith('55')) return digits;
  if (digits.length === 11) return `55${digits}`;
  if (digits.length === 10) return `55${digits}`;
  return null;
}

function extractMessageId(parsed: unknown): string {
  if (!parsed || typeof parsed !== 'object') return '';
  const p = parsed as Record<string, unknown>;
  const key = p.key as Record<string, unknown> | undefined;
  if (key && typeof key.id === 'string') return key.id;
  if (typeof p.messageId === 'string') return p.messageId;
  return '';
}

function extractInviteCode(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Record<string, unknown>;
  if (typeof p.inviteCode === 'string') return p.inviteCode;
  if (typeof p.code === 'string') return p.code;
  if (typeof p.inviteUrl === 'string') {
    const match = (p.inviteUrl as string).match(/chat\.whatsapp\.com\/([\w-]+)/);
    if (match) return match[1] ?? null;
  }
  return null;
}

function parseParticipantResults(parsed: unknown, originals: string[]): ParticipantAddResult[] {
  // Evolution v2 costuma retornar { participants: [{ status: "200", jid: "..." }] }
  // ou diretamente um array. Cobre ambos os formatos.
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { participants?: unknown[] })?.participants)
      ? ((parsed as { participants: unknown[] }).participants)
      : [];
  const byNumber = new Map<string, ParticipantAddResult>();
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const jid = typeof e.jid === 'string' ? e.jid : typeof e.number === 'string' ? e.number : '';
    const number = jid.replace(/@.*/, '');
    if (!number) continue;
    const status = String(e.status ?? '');
    const added = status === '200' || e.added === true;
    byNumber.set(number, {
      number,
      added: Boolean(added),
      status,
      message: typeof e.message === 'string' ? e.message : undefined,
    });
  }
  // Garante 1 entry por número original — se Evolution não devolveu, marca como falha desconhecida.
  return originals.map(
    (n) =>
      byNumber.get(n) ?? {
        number: n,
        added: false,
        status: 'unknown',
        message: 'Evolution não retornou status para esse número',
      },
  );
}
