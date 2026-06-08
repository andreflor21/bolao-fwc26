import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailService } from '../src/email/email.service';
import { BroadcastService } from '../src/broadcast/broadcast.service';
import { FIFA_WC_2026_ID } from '@bolao/shared';

/**
 * Reset dos brackets de mata-mata após a correção do chaveamento oficial FIFA
 * 2026 (oitavas/quartas estavam pareadas errado). A correção afeta R16+; quem
 * já gerou o mata-mata fez palpites sobre confrontos que mudaram, então o
 * bracket precisa ser refeito.
 *
 * O que o script faz (para a competição fifa-wc-2026):
 *   1. Identifica os jogadores AFETADOS = que já geraram o mata-mata
 *      (knockoutSubmittedAt != null OU têm algum palpite de fixture R16+).
 *   2. [--apply] Deleta a BracketPrediction inteira desses jogadores e os
 *      KnockoutGuessScore associados. Os palpites de GRUPO (tabela Guess)
 *      permanecem — o jogador só regenera o bracket e refaz o mata-mata.
 *   3. [--apply] Envia o comunicado pedindo pra refazer:
 *        - E-mail individual (EmailService → SMTP) para cada afetado
 *        - 1 broadcast no grupo do WhatsApp (BroadcastService)
 *
 * Uso:
 *   npx ts-node --transpile-only prisma/reset-knockout-brackets.ts            # dry-run: só lista, não muda nada
 *   npx ts-node --transpile-only prisma/reset-knockout-brackets.ts --apply    # deleta + envia e-mail + WhatsApp
 *   ... --apply --no-email        # deleta + WhatsApp, sem e-mail
 *   ... --apply --no-whatsapp     # deleta + e-mail, sem WhatsApp
 *   ... --apply --no-delete       # só envia comunicado (não apaga nada)
 *
 * Drivers reais dependem do ambiente: EMAIL_DRIVER=smtp (+ SMTP_*) para e-mail
 * de verdade; WHATSAPP driver evolution para WhatsApp de verdade. Em mock, o
 * script roda e loga, mas nada sai de fato.
 */

const APPLY = process.argv.includes('--apply');
const NO_EMAIL = process.argv.includes('--no-email');
const NO_WHATSAPP = process.argv.includes('--no-whatsapp');
const NO_DELETE = process.argv.includes('--no-delete');

/** Confrontos cujo pareamento mudou na correção (R16 em diante). */
const AFFECTED_FIXTURE_IDS = new Set<string>([
  'R16-89', 'R16-90', 'R16-91', 'R16-92', 'R16-93', 'R16-94', 'R16-95', 'R16-96',
  'QF-97', 'QF-98', 'QF-99', 'QF-100',
  'SF-101', 'SF-102',
  'TP-103', 'F-104',
]);

interface StoredPayload {
  knockoutScores?: Record<string, unknown>;
  knockoutSubmittedAt?: string | null;
}

/** Um jogador "gerou o mata-mata" se finalizou o KO ou palpitou algum R16+. */
function generatedKnockout(payload: StoredPayload): boolean {
  if (payload?.knockoutSubmittedAt) return true;
  const scores = payload?.knockoutScores ?? {};
  return Object.keys(scores).some((id) => AFFECTED_FIXTURE_IDS.has(id));
}

const WHATSAPP_NOTICE =
  '⚠️ *Atenção, galera!* Corrigimos o chaveamento das fases finais (oitavas em diante) ' +
  'para a chave OFICIAL da FIFA. Por isso, os palpites do mata-mata foram zerados e ' +
  'precisam ser refeitos. Os palpites da fase de grupos continuam salvos! ' +
  'Entrem em /knockout-guesses e refaçam o bracket. Leva poucos minutos. 🙏⚽';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const prisma = app.get(PrismaService);
  const email = app.get(EmailService);
  const broadcast = app.get(BroadcastService);

  try {
    // 1. Levanta os afetados (com e-mail/nome em memória ANTES de deletar).
    const predictions = await prisma.bracketPrediction.findMany({
      where: { competitionId: FIFA_WC_2026_ID },
      select: {
        userId: true,
        payload: true,
        user: { select: { name: true, email: true } },
      },
    });

    const affected = predictions
      .filter((p) => generatedKnockout((p.payload ?? {}) as StoredPayload))
      .map((p) => ({ userId: p.userId, name: p.user.name, email: p.user.email }));

    console.log(`\n📋 Brackets de mata-mata gerados: ${affected.length} (de ${predictions.length} brackets no total)\n`);
    for (const u of affected) {
      console.log(`  - ${u.name} <${u.email}>`);
    }
    console.log('');

    if (affected.length === 0) {
      console.log('✅ Ninguém gerou o mata-mata ainda. Nada a fazer.\n');
      return;
    }

    if (!APPLY) {
      console.log('ℹ️  Dry-run. Nada foi deletado nem enviado. Rode com --apply para executar.\n');
      return;
    }

    const affectedIds = affected.map((u) => u.userId);

    // 2. Deleta os brackets (e os scores de KO). Palpites de grupo ficam.
    if (NO_DELETE) {
      console.log('⏭️  --no-delete: pulando a remoção dos brackets.\n');
    } else {
      const delScores = await prisma.knockoutGuessScore.deleteMany({
        where: { competitionId: FIFA_WC_2026_ID, userId: { in: affectedIds } },
      });
      const delBrackets = await prisma.bracketPrediction.deleteMany({
        where: { competitionId: FIFA_WC_2026_ID, userId: { in: affectedIds } },
      });
      console.log(`🗑️  Removidos: ${delBrackets.count} brackets, ${delScores.count} scores de KO.\n`);
    }

    // 3a. Comunicado por e-mail (individual).
    if (NO_EMAIL) {
      console.log('⏭️  --no-email: pulando o e-mail.\n');
    } else {
      let ok = 0;
      let fail = 0;
      for (const u of affected) {
        try {
          await email.sendBracketResetNotice(u.email, u.name);
          ok++;
        } catch (e) {
          fail++;
          console.warn(`  ✖ e-mail falhou para ${u.email}: ${(e as Error).message}`);
        }
      }
      console.log(`📧 E-mails: ${ok} enviados, ${fail} falharam.\n`);
    }

    // 3b. Comunicado no grupo do WhatsApp (1 mensagem).
    if (NO_WHATSAPP) {
      console.log('⏭️  --no-whatsapp: pulando o broadcast.\n');
    } else {
      const admin = await prisma.user.findFirst({
        where: { role: 'admin' },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
      if (!admin) {
        console.warn('  ✖ Nenhum admin encontrado para registrar o broadcast — WhatsApp pulado.\n');
      } else {
        const res = await broadcast.send(admin.id, WHATSAPP_NOTICE, 'bracket-reset-notice');
        console.log(`📱 WhatsApp: status=${res.status}${res.errorMessage ? ` (${res.errorMessage})` : ''}.\n`);
      }
    }

    console.log('✅ Concluído.\n');
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error('Falhou:', e instanceof Error ? e.message : e);
  process.exit(1);
});
