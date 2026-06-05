import { WhatsappService, normalizePhone } from './whatsapp.service';

function configWith(env: Record<string, string | undefined>) {
  return {
    get: jest.fn(<T = unknown>(key: string): T | undefined => env[key] as T | undefined),
  } as never;
}

describe('WhatsappService', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('usa driver mock quando WHATSAPP_PROVIDER=mock', async () => {
    const svc = new WhatsappService(configWith({ WHATSAPP_PROVIDER: 'mock' }));
    const fetchMock = jest.fn();
    global.fetch = fetchMock as never;
    const res = await svc.sendText('oi');
    expect(svc.getDriver()).toBe('mock');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.messageId).toBe('');
  });

  it('cai para mock se faltar configuração do Evolution', () => {
    const svc = new WhatsappService(
      configWith({ WHATSAPP_PROVIDER: 'evolution', EVOLUTION_API_URL: 'https://x.com' }),
    );
    // chave/instância/grupo ausentes — degrada para mock
    expect(svc.getDriver()).toBe('mock');
  });

  it('faz POST na Evolution API com headers e body corretos', async () => {
    const svc = new WhatsappService(
      configWith({
        WHATSAPP_PROVIDER: 'evolution',
        EVOLUTION_API_URL: 'https://evo.example.com/',
        EVOLUTION_API_KEY: 'k123',
        EVOLUTION_INSTANCE: 'bolao-bot',
        WHATSAPP_GROUP_JID: '120363@g.us',
      }),
    );
    const fetchMock = jest.fn(async () =>
      new Response(JSON.stringify({ key: { id: 'wamid.abc' } }), { status: 200 }),
    );
    global.fetch = fetchMock as never;

    const res = await svc.sendText('oi galera');
    expect(svc.getDriver()).toBe('evolution');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('https://evo.example.com/message/sendText/bolao-bot');
    expect(call[1].method).toBe('POST');
    const headers = call[1].headers as Record<string, string>;
    expect(headers.apikey).toBe('k123');
    const body = JSON.parse((call[1].body as string) ?? '{}');
    expect(body).toEqual({ number: '120363@g.us', text: 'oi galera' });
    expect(res.messageId).toBe('wamid.abc');
  });

  it('lança erro com corpo do provider quando HTTP != 2xx', async () => {
    const svc = new WhatsappService(
      configWith({
        WHATSAPP_PROVIDER: 'evolution',
        EVOLUTION_API_URL: 'https://evo.example.com',
        EVOLUTION_API_KEY: 'k',
        EVOLUTION_INSTANCE: 'i',
        WHATSAPP_GROUP_JID: 'g@g.us',
      }),
    );
    global.fetch = jest.fn(async () => new Response('boom', { status: 502 })) as never;
    await expect(svc.sendText('x')).rejects.toThrow(/Evolution API 502/);
  });

  it('rejeita mensagens vazias antes de qualquer chamada externa', async () => {
    const svc = new WhatsappService(configWith({ WHATSAPP_PROVIDER: 'mock' }));
    await expect(svc.sendText('   ')).rejects.toThrow('Mensagem vazia');
  });

  it('mock getGroupInviteUrl devolve URL fake (não chama Evolution)', async () => {
    const svc = new WhatsappService(configWith({ WHATSAPP_PROVIDER: 'mock' }));
    const url = await svc.getGroupInviteUrl();
    expect(url).toContain('chat.whatsapp.com/');
  });
});

describe('normalizePhone (BR)', () => {
  it('aceita formatos comuns de telefone BR', () => {
    expect(normalizePhone('11999999999')).toBe('5511999999999');       // 11 dígitos sem DDI
    expect(normalizePhone('5511999999999')).toBe('5511999999999');     // já E.164
    expect(normalizePhone('+55 (11) 99999-9999')).toBe('5511999999999');
    expect(normalizePhone('(11) 9999-9999')).toBe('551199999999');     // fixo 10 dígitos
  });

  it('rejeita números muito curtos ou muito longos', () => {
    expect(normalizePhone('999')).toBeNull();
    expect(normalizePhone('99999999999999999')).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });
});
