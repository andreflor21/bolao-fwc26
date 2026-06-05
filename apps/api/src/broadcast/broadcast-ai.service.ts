import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

export type BroadcastPresetKey =
  | 'top-guesses-today'
  | 'win-draw-probabilities'
  | 'match-result-recap'
  | 'reminder-lock-soon';

export interface BroadcastDraft {
  text: string;
  /** Driver real usado para gerar o texto: 'claude' (IA) ou 'template' (fallback). */
  source: 'claude' | 'template';
}

const SYSTEM_PROMPT = `Você é um narrador animado de um grupo de WhatsApp do bolão da Copa do Mundo FIFA 2026.
Seu tom é descontraído, com gírias leves de torcida brasileira (sem ofensas, sem zoeira pesada, sem promessas, sem prêmios em dinheiro).
Sua função é redigir UMA mensagem curta de 2 a 5 linhas para postar no grupo, baseada nos dados fornecidos.
Regras inegociáveis:
- Português do Brasil. Tom de voz amigável e empolgado.
- Inclua 1–3 emojis pertinentes (⚽🇧🇷🏆📊🔥) — nunca exagere.
- Nunca invente dados que não estão no contexto. Se um número está zerado, faça uma observação leve ("ninguém arriscou ainda 👀").
- Nunca cite usuários específicos. Fale do coletivo ("a galera", "o pessoal").
- Não inclua links nem hashtags.
- Não comece com "Olá pessoal", "E aí galera" — vá direto ao assunto.
- Devolva SOMENTE o texto da mensagem (sem aspas, sem markdown, sem prefixo).`;

const PROMPTS: Record<BroadcastPresetKey, (ctx: unknown) => string> = {
  'top-guesses-today': (ctx) => `Preset: palpites mais jogados para o jogo de hoje.
Dados (JSON):
${JSON.stringify(ctx, null, 2)}

Monte uma mensagem destacando o confronto, listando os 3 placares mais palpitados pelo grupo (com a contagem de cada um) e provocando expectativa pro apito inicial.`,

  'win-draw-probabilities': (ctx) => `Preset: probabilidades implícitas pelos palpites do grupo.
Dados (JSON):
${JSON.stringify(ctx, null, 2)}

Monte uma mensagem dizendo o que a galera está achando do jogo, com as três porcentagens (casa, empate, visitante) baseadas nos palpites do grupo. Comente brevemente quem é o "favorito da galera" se houver diferença clara.`,

  'match-result-recap': (ctx) => `Preset: recap do resultado oficial recém-cadastrado.
Dados (JSON):
${JSON.stringify(ctx, null, 2)}

Monte uma mensagem comemorando os "cravadores" (quem acertou o placar exato), citando a quantidade — sem nomes, só o número. Se ninguém cravou, dê o tom de "ninguém acertou esse aí".`,

  'reminder-lock-soon': (ctx) => `Preset: lembrete de jogos travando em breve.
Dados (JSON):
${JSON.stringify(ctx, null, 2)}

Monte uma mensagem alertando que os palpites travam quando o jogo começa, listando 1–3 jogos das próximas horas e horário (BRT). Tom: amigável e urgente, sem desespero.`,
};

/**
 * Geração de frases pelo Claude para os disparos do admin. Reusa a chave
 * ANTHROPIC_API_KEY já configurada (pix-fallback). Em caso de erro/sem chave,
 * cai para um template estático com os mesmos dados — admin sempre pode editar
 * antes de enviar.
 */
@Injectable()
export class BroadcastAIService {
  private readonly logger = new Logger(BroadcastAIService.name);
  private readonly anthropic: Anthropic | null;
  private readonly model: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('ANTHROPIC_API_KEY');
    this.anthropic = apiKey ? new Anthropic({ apiKey }) : null;
    this.model = config.get<string>('ANTHROPIC_MODEL') ?? 'claude-haiku-4-5-20251001';
  }

  async generate(presetKey: BroadcastPresetKey, context: unknown): Promise<BroadcastDraft> {
    const promptBuilder = PROMPTS[presetKey];
    if (!promptBuilder) {
      throw new ServiceUnavailableException(`Preset desconhecido: ${presetKey}`);
    }
    if (!this.anthropic) {
      this.logger.warn(`ANTHROPIC_API_KEY ausente — devolvendo template para ${presetKey}`);
      return { text: this.template(presetKey, context), source: 'template' };
    }
    try {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: promptBuilder(context) }],
      });
      const textBlock = response.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('Claude não retornou texto');
      }
      const cleaned = textBlock.text.trim().replace(/^["“]+|["”]+$/g, '');
      return { text: cleaned, source: 'claude' };
    } catch (e) {
      this.logger.warn(`Claude falhou (${(e as Error).message}) — caindo para template`);
      return { text: this.template(presetKey, context), source: 'template' };
    }
  }

  /**
   * Fallback determinístico — caso a API esteja fora do ar ou sem chave.
   * Texto bem cru de propósito: admin edita antes de enviar.
   */
  private template(presetKey: BroadcastPresetKey, raw: unknown): string {
    const c = (raw ?? {}) as Record<string, unknown>;
    if (presetKey === 'top-guesses-today') {
      const home = String(c.homeTeamName ?? c.homeTeamCode ?? '?');
      const away = String(c.awayTeamName ?? c.awayTeamCode ?? '?');
      const top = Array.isArray(c.topGuesses) ? (c.topGuesses as Array<{ homeGoals: number; awayGoals: number; count: number }>) : [];
      const lines = top
        .slice(0, 3)
        .map((g, i) => `${i + 1}. ${g.homeGoals}x${g.awayGoals} — ${g.count} palpite${g.count !== 1 ? 's' : ''}`);
      return `⚽ ${home} x ${away} hoje!\nPalpites mais jogados pelo grupo:\n${lines.join('\n') || '(nenhum palpite registrado)'}`;
    }
    if (presetKey === 'win-draw-probabilities') {
      const home = String(c.homeTeamName ?? c.homeTeamCode ?? 'Casa');
      const away = String(c.awayTeamName ?? c.awayTeamCode ?? 'Visitante');
      const homePct = Math.round(Number(c.homeWinPct ?? 0));
      const drawPct = Math.round(Number(c.drawPct ?? 0));
      const awayPct = Math.round(Number(c.awayWinPct ?? 0));
      return `📊 O grupo já palpitou para ${home} x ${away}:\n• Vitória ${home}: ${homePct}%\n• Empate: ${drawPct}%\n• Vitória ${away}: ${awayPct}%`;
    }
    if (presetKey === 'match-result-recap') {
      const home = String(c.homeTeamName ?? c.homeTeamCode ?? '?');
      const away = String(c.awayTeamName ?? c.awayTeamCode ?? '?');
      const hg = c.homeGoalsOfficial;
      const ag = c.awayGoalsOfficial;
      const exact = Number(c.exactScoreCount ?? 0);
      return `🏆 Fim de jogo: ${home} ${hg}x${ag} ${away}\n${exact > 0 ? `${exact} pessoa(s) cravaram o placar exato!` : 'Ninguém cravou o placar exato dessa vez.'}`;
    }
    // reminder-lock-soon
    const fixtures = Array.isArray(c.fixtures) ? (c.fixtures as Array<{ label: string; kickoffLabel: string }>) : [];
    const lines = fixtures.slice(0, 3).map((f) => `• ${f.label} — ${f.kickoffLabel}`);
    return `⏰ Última chance pra palpitar:\n${lines.join('\n') || '(nenhum jogo nas próximas horas)'}`;
  }
}
