import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

export type BroadcastPresetKey =
  | 'top-guesses-today'
  | 'top-guesses-knockout'
  | 'win-draw-probabilities'
  | 'match-result-recap'
  | 'reminder-lock-soon'
  | 'who-is-nailing';

export interface BroadcastDraft {
  text: string;
  /** Driver real usado para gerar o texto: 'claude' (IA) ou 'template' (fallback). */
  source: 'claude' | 'template';
}

const SYSTEM_PROMPT = `Você é a pessoa que solta as mensagens no grupo de WhatsApp do bolão da Copa 2026. Escreve como gente de verdade mandando zap, não como robô narrador.
Como escrever:
- Português do Brasil, tom de bar/grupo de amigos. Pode usar gíria de torcida na medida (sem ofensa, sem zoeira pesada, sem prometer prêmio em dinheiro).
- Mensagem curta: 1 a 4 linhas. Sem enrolação, sem introduçãozinha.
- No máximo 1 ou 2 emojis, e só quando cair bem. Mensagem sem emoji nenhum também tá ótima.
- Varie o jeito de começar. Nada de "E aí galera", "Olá pessoal", "Atenção:" nem frase de efeito genérica.
- Não use travessão pra dar aquele ar de texto de IA; escreve direto.
- Só use números e nomes que estão no contexto. Se algo veio zerado, comenta de leve ("ninguém arriscou ainda").
- Pode citar nomes SE eles vierem no contexto (ex.: lista de quem cravou). Sem contexto, fala do coletivo ("a galera", "o pessoal").
- Sem links, sem hashtag.
- Responda SÓ com o texto da mensagem (sem aspas, sem markdown, sem rótulo).`;

const PROMPTS: Record<BroadcastPresetKey, (ctx: unknown) => string> = {
  'top-guesses-today': (ctx) => `Os palpites do grupo pro próximo jogo.
Dados (JSON):
${JSON.stringify(ctx, null, 2)}

Escreva avisando qual é o confronto e listando TODOS os placares que foram palpitados, do mais escolhido pro menos, com quantas pessoas em cada um (o array vem em "guesses"). Pode usar uma linha por placar tipo "2x1 — 5 pessoas". Fecha com um gancho pro jogo. Mantém curto e natural.`,

  'top-guesses-knockout': (ctx) => `Os palpites do grupo pro próximo jogo do mata-mata.
Dados (JSON):
${JSON.stringify(ctx, null, 2)}

Escreva avisando o confronto e o horário ("kickoffLabel", BRT). Diz quantas pessoas acertaram o confronto (campo "confrontoCount"). Depois lista os placares que ESSA galera cravou, do mais escolhido pro menos, com quantas pessoas em cada um (array "guesses"), uma linha por placar tipo "2x1 — 5 pessoas". Se ninguém acertou o confronto (confrontoCount 0), comenta de leve e não inventa placar. Mantém curto e natural.`,

  'win-draw-probabilities': (ctx) => `Como o grupo dividiu os palpites desse jogo (em %).
Dados (JSON):
${JSON.stringify(ctx, null, 2)}

Escreva dizendo pra onde a galera tá pendendo, com as três porcentagens (casa, empate, visitante). Se uma se destaca, aponta o favorito do grupo numa frase. Nada de fórmula pronta.`,

  'match-result-recap': (ctx) => `Resultado oficial que acabou de sair.
Dados (JSON):
${JSON.stringify(ctx, null, 2)}

Escreva o fim de jogo com o placar e quantas pessoas cravaram o placar exato (só o número, sem nomes). Se ninguém cravou, brinca com isso. Curto e direto.`,

  'reminder-lock-soon': (ctx) => `Jogos travando nas próximas horas.
Dados (JSON):
${JSON.stringify(ctx, null, 2)}

Escreva lembrando que o palpite trava quando a bola rola, citando os jogos e os horários (BRT). Tom de "corre que vai fechar", sem ser dramático.`,

  'who-is-nailing': (ctx) => `Quem está cravando o placar do jogo que tá rolando agora.
Dados (JSON):
${JSON.stringify(ctx, null, 2)}

O admin passou o placar do momento. Escreve dizendo quais nomes (vêm em "nailers") estão exatamente nesse placar agora, citando os nomes. Se a lista vier vazia, comenta que ninguém tá nesse placar ainda. Lembra que ainda dá pra virar até o apito final. Curto e empolgado.`,
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
      const all = Array.isArray(c.guesses) ? (c.guesses as Array<{ homeGoals: number; awayGoals: number; count: number }>) : [];
      const lines = all.map((g) => `${g.homeGoals}x${g.awayGoals} — ${g.count} ${g.count === 1 ? 'pessoa' : 'pessoas'}`);
      return `Como o grupo palpitou ${home} x ${away}:\n${lines.join('\n') || 'Ninguém palpitou ainda.'}`;
    }
    if (presetKey === 'top-guesses-knockout') {
      const home = String(c.homeTeamName ?? c.homeTeamCode ?? '?');
      const away = String(c.awayTeamName ?? c.awayTeamCode ?? '?');
      const kickoff = c.kickoffLabel ? String(c.kickoffLabel) : '';
      const confronto = Number(c.confrontoCount ?? 0);
      const all = Array.isArray(c.guesses)
        ? (c.guesses as Array<{ homeGoals: number; awayGoals: number; count: number }>)
        : [];
      const head = `${home} x ${away}${kickoff ? ` — ${kickoff}` : ''}`;
      if (confronto === 0) {
        return `${head}\nNinguém cravou esse confronto no chaveamento.`;
      }
      const acertaram = `${confronto} ${confronto === 1 ? 'jogador acertou' : 'jogadores acertaram'} o confronto`;
      const lines = all.map(
        (g) => `${g.homeGoals} x ${g.awayGoals} — ${g.count} ${g.count === 1 ? 'pessoa' : 'pessoas'}`,
      );
      return `${head}\n${acertaram}${lines.length ? `\n\n${lines.join('\n')}` : ''}`;
    }
    if (presetKey === 'win-draw-probabilities') {
      const home = String(c.homeTeamName ?? c.homeTeamCode ?? 'Casa');
      const away = String(c.awayTeamName ?? c.awayTeamCode ?? 'Visitante');
      const homePct = Math.round(Number(c.homeWinPct ?? 0));
      const drawPct = Math.round(Number(c.drawPct ?? 0));
      const awayPct = Math.round(Number(c.awayWinPct ?? 0));
      return `Como o grupo vê ${home} x ${away}:\nVitória ${home}: ${homePct}%\nEmpate: ${drawPct}%\nVitória ${away}: ${awayPct}%`;
    }
    if (presetKey === 'match-result-recap') {
      const home = String(c.homeTeamName ?? c.homeTeamCode ?? '?');
      const away = String(c.awayTeamName ?? c.awayTeamCode ?? '?');
      const hg = c.homeGoalsOfficial;
      const ag = c.awayGoalsOfficial;
      const exact = Number(c.exactScoreCount ?? 0);
      return `Deu ${home} ${hg}x${ag} ${away}.\n${exact > 0 ? `${exact} ${exact === 1 ? 'pessoa cravou' : 'pessoas cravaram'} o placar exato.` : 'Dessa vez ninguém cravou o placar.'}`;
    }
    if (presetKey === 'who-is-nailing') {
      const home = String(c.homeTeamName ?? c.homeTeamCode ?? '?');
      const away = String(c.awayTeamName ?? c.awayTeamCode ?? '?');
      const hg = c.homeGoals;
      const ag = c.awayGoals;
      const nailers = Array.isArray(c.nailers) ? (c.nailers as string[]) : [];
      if (nailers.length === 0) {
        return `Tá ${home} ${hg}x${ag} ${away} e ninguém tá cravando esse placar agora. Bora ver se vira até o fim.`;
      }
      return `Como tá agora, ${home} ${hg}x${ag} ${away}, quem tá cravando: ${nailers.join(', ')}. Ainda dá tempo de mudar tudo até o apito final.`;
    }
    // reminder-lock-soon
    const fixtures = Array.isArray(c.fixtures) ? (c.fixtures as Array<{ label: string; kickoffLabel: string }>) : [];
    const lines = fixtures.slice(0, 3).map((f) => `${f.label} — ${f.kickoffLabel}`);
    return `Os palpites travam quando a bola rolar:\n${lines.join('\n') || 'Nenhum jogo nas próximas horas.'}`;
  }
}
