import { EmailService } from './email.service';
import type { EmailMessage, IEmailDriver } from './drivers/email-driver.interface';

class CaptureDriver implements IEmailDriver {
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

// ConfigService stub — força os defaults (EMAIL_FROM/WEB_ORIGIN).
const config = { get: () => undefined } as never;

describe('EmailService (templates)', () => {
  let driver: CaptureDriver;
  let email: EmailService;

  beforeEach(() => {
    driver = new CaptureDriver();
    email = new EmailService(driver, config);
  });

  it('sendPalpitesLocked envia html + text com link de ranking', async () => {
    await email.sendPalpitesLocked('a@b.com', 'Ana Silva');
    expect(driver.sent).toHaveLength(1);
    const msg = driver.sent[0];
    expect(msg.to).toBe('a@b.com');
    expect(msg.subject).toContain('travados');
    expect(msg.html).toContain('Ana Silva');
    expect(msg.html).toContain('/ranking');
    expect(msg.text).toContain('/ranking');
  });

  it('sendRankingPositionChanged diferencia entrar/sair do top 10', async () => {
    await email.sendRankingPositionChanged('a@b.com', 'Ana', 3, true);
    await email.sendRankingPositionChanged('a@b.com', 'Ana', 12, false);
    expect(driver.sent[0].subject).toContain('entrou no top 10');
    expect(driver.sent[1].subject).toContain('saiu do top 10');
    expect(driver.sent[0].html).toContain('3ª posição');
    expect(driver.sent[1].html).toContain('12ª posição');
  });

  it('sendPrizeAwarded formata o valor em BRL', async () => {
    await email.sendPrizeAwarded('a@b.com', 'Ana', 'Campeão do Bolão', 250000);
    const msg = driver.sent[0];
    expect(msg.subject).toContain('premiado');
    expect(msg.html).toContain('Campeão do Bolão');
    expect(msg.html).toContain('2.500,00');
  });

  it('sendPrizePaid inclui chave Pix e referência quando presentes', async () => {
    await email.sendPrizePaid('a@b.com', 'Ana', '2º lugar', 100000, 'ana@pix.com', 'txid-123');
    const msg = driver.sent[0];
    expect(msg.html).toContain('ana@pix.com');
    expect(msg.html).toContain('txid-123');
    expect(msg.text).toContain('ana@pix.com');
  });

  it('sendPrizePaid omite a chave Pix quando ausente', async () => {
    await email.sendPrizePaid('a@b.com', 'Ana', '2º lugar', 100000, null, null);
    const msg = driver.sent[0];
    expect(msg.html).not.toContain('chave Pix');
    expect(msg.html).toContain('1.000,00');
  });
});
