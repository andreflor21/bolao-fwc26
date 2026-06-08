import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminModal } from '../../components/admin/AdminModal';
import { GroupInviteSection } from './GroupInviteSection';
import type { MatchDto } from '@bolao/shared';

type PresetKey =
  | 'top-guesses-today'
  | 'win-draw-probabilities'
  | 'match-result-recap'
  | 'reminder-lock-soon';

interface PresetMeta {
  key: PresetKey;
  emoji: string;
  label: string;
  description: string;
  needsMatch: boolean;
  /** Filtra os jogos elegíveis no select de matchId. */
  matchFilter: 'upcoming' | 'finished' | 'any';
}

const PRESETS: PresetMeta[] = [
  {
    key: 'top-guesses-today',
    emoji: '📊',
    label: 'Palpites mais jogados',
    description: 'Lista os 3–5 placares mais palpitados pelo grupo para o jogo escolhido.',
    needsMatch: true,
    matchFilter: 'upcoming',
  },
  {
    key: 'win-draw-probabilities',
    emoji: '🎯',
    label: '% Vitória x Empate x Visitante',
    description: 'Mostra como a galera está dividida: % por casa, empate e visitante.',
    needsMatch: true,
    matchFilter: 'upcoming',
  },
  {
    key: 'match-result-recap',
    emoji: '🏆',
    label: 'Resultado do jogo + cravadores',
    description: 'Comemora o placar oficial recém-cadastrado e cita a quantidade de cravadores.',
    needsMatch: true,
    matchFilter: 'finished',
  },
  {
    key: 'reminder-lock-soon',
    emoji: '⏰',
    label: 'Lembrete: jogos travando',
    description: 'Lista 1–3 jogos das próximas horas com horário em BRT.',
    needsMatch: false,
    matchFilter: 'any',
  },
];

interface PreviewResponse {
  text: string;
  source: 'claude' | 'template';
  whatsappDriver: 'mock' | 'evolution';
  context: unknown;
}

interface SendResponse {
  id: string;
  status: 'sent' | 'failed';
  providerId: string | null;
  errorMessage: string | null;
}

interface HistoryItem {
  id: string;
  presetKey: string | null;
  text: string;
  status: string;
  providerId: string | null;
  errorMessage: string | null;
  sentByUserId: string;
  sentByName: string;
  createdAt: string;
}

const BRT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function AdminBroadcast() {
  const qc = useQueryClient();
  const [presetKey, setPresetKey] = useState<PresetKey>('top-guesses-today');
  const [matchId, setMatchId] = useState<string>('');
  const [text, setText] = useState<string>('');
  const [source, setSource] = useState<PreviewResponse['source'] | null>(null);
  const [whatsappDriver, setWhatsappDriver] = useState<PreviewResponse['whatsappDriver']>('mock');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const preset = PRESETS.find((p) => p.key === presetKey)!;

  const matchesQuery = useQuery({
    queryKey: ['matches', 'group-stage'],
    queryFn: () => api<MatchDto[]>('/matches/group-stage'),
  });

  const filteredMatches = useMemo(() => {
    const all = matchesQuery.data ?? [];
    const now = new Date();
    if (preset.matchFilter === 'upcoming') {
      return all
        .filter((m) => new Date(m.kickoffAt) >= now && m.homeGoalsOfficial === null)
        .slice(0, 30);
    }
    if (preset.matchFilter === 'finished') {
      return all.filter((m) => m.homeGoalsOfficial !== null).slice(-30);
    }
    return all;
  }, [matchesQuery.data, preset.matchFilter]);

  const previewMutation = useMutation({
    mutationFn: () =>
      api<PreviewResponse>('/admin/broadcast/preview', {
        method: 'POST',
        body: JSON.stringify({ presetKey, matchId: matchId || undefined }),
      }),
    onSuccess: (data) => {
      setText(data.text);
      setSource(data.source);
      setWhatsappDriver(data.whatsappDriver);
      setError(null);
    },
    onError: (e: unknown) => {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    },
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      api<SendResponse>('/admin/broadcast/send', {
        method: 'POST',
        body: JSON.stringify({ text, presetKey }),
      }),
    onSuccess: (data) => {
      setConfirmOpen(false);
      if (data.status === 'sent') {
        setToast(
          whatsappDriver === 'mock'
            ? '✅ Mensagem registrada (driver=mock — não foi pro WhatsApp)'
            : '✅ Mensagem enviada pro grupo do WhatsApp!',
        );
        setText('');
        setSource(null);
      } else {
        setError(`Falha ao enviar: ${data.errorMessage ?? 'erro desconhecido'}`);
      }
      qc.invalidateQueries({ queryKey: ['broadcast-history'] });
      setTimeout(() => setToast(null), 4000);
    },
    onError: (e: unknown) => {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    },
  });

  const historyQuery = useQuery({
    queryKey: ['broadcast-history'],
    queryFn: () => api<HistoryItem[]>('/admin/broadcast/history?limit=20'),
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="BROADCAST"
        subtitle="Dispare mensagens para o grupo do WhatsApp do bolão usando presets gerados por IA. Edite o texto antes de enviar."
        actions={
          <span
            className={
              'chip text-[10px] ' +
              (whatsappDriver === 'evolution'
                ? 'border-emerald-400/40 text-emerald-200'
                : 'border-amber-400/40 text-amber-200')
            }
            title={
              whatsappDriver === 'evolution'
                ? 'Conectado à Evolution API — envios chegam no grupo.'
                : 'Modo mock: nada vai pro WhatsApp; só log + auditoria.'
            }
          >
            {whatsappDriver === 'evolution' ? '🟢 ONLINE' : '🟡 MOCK'}
          </span>
        }
      />

      {toast && (
        <div className="card border-emerald-400/40 bg-emerald-500/10 text-emerald-100 text-sm">
          {toast}
        </div>
      )}
      {error && (
        <div className="card border-red-400/40 bg-red-500/10 text-red-200 text-sm flex items-start justify-between gap-3">
          <span className="break-words">{error}</span>
          <button onClick={() => setError(null)} className="text-xs text-red-100/70 hover:text-red-100 shrink-0">
            fechar
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr,1.2fr]">
        {/* Coluna esquerda: preset + jogo + botão gerar */}
        <section className="card-glow space-y-4">
          <div>
            <p className="text-[10px] tracking-[0.3em] text-gold-300/80 mb-2">PRESET</p>
            <div className="flex flex-col gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => {
                    setPresetKey(p.key);
                    setMatchId('');
                  }}
                  className={
                    'text-left rounded-xl border px-3 py-2 transition ' +
                    (presetKey === p.key
                      ? 'border-gold-400/60 bg-gold-400/10'
                      : 'border-emerald-500/20 bg-midnight-900/30 hover:border-emerald-400/50')
                  }
                >
                  <p className="text-sm font-semibold text-emerald-100">
                    <span className="mr-1.5">{p.emoji}</span>
                    {p.label}
                  </p>
                  <p className="text-xs text-emerald-200/60 mt-0.5">{p.description}</p>
                </button>
              ))}
            </div>
          </div>

          {preset.needsMatch && (
            <div>
              <label className="label">
                Jogo {preset.matchFilter === 'finished' ? '(já encerrado)' : '(próximos)'}
              </label>
              <select
                className="input w-full"
                value={matchId}
                onChange={(e) => setMatchId(e.target.value)}
              >
                <option value="">— Selecione (ou deixe em branco para detectar) —</option>
                {filteredMatches.map((m) => (
                  <option key={m.id} value={m.id}>
                    {BRT.format(new Date(m.kickoffAt))} · {m.homeTeamName ?? m.homeTeamCode} x{' '}
                    {m.awayTeamName ?? m.awayTeamCode}
                    {m.homeGoalsOfficial !== null
                      ? ` (${m.homeGoalsOfficial}x${m.awayGoalsOfficial})`
                      : ''}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-emerald-200/50 mt-1">
                Se deixar em branco, o backend escolhe o jogo mais provável (próximo kickoff ou
                último resultado).
              </p>
            </div>
          )}

          <button
            className="btn-gold w-full text-sm"
            disabled={previewMutation.isPending}
            onClick={() => previewMutation.mutate()}
          >
            {previewMutation.isPending ? 'Gerando...' : '✨ Gerar com IA'}
          </button>
        </section>

        {/* Coluna direita: textarea + enviar */}
        <section className="card-glow space-y-3 flex flex-col">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] tracking-[0.3em] text-gold-300/80">MENSAGEM</p>
            {source && (
              <span className="text-[10px] text-emerald-200/60">
                gerado via{' '}
                <strong className={source === 'claude' ? 'text-gold-200' : 'text-emerald-200'}>
                  {source === 'claude' ? 'Claude' : 'template'}
                </strong>
              </span>
            )}
          </div>
          <textarea
            className="input w-full min-h-[220px] font-mono text-sm leading-relaxed"
            placeholder="Clique em 'Gerar com IA' para começar, ou cole/escreva uma mensagem manualmente."
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={4000}
          />
          <div className="flex items-center justify-between text-[11px] text-emerald-200/50">
            <span>{text.length}/4000 caracteres</span>
            {text && (
              <button
                onClick={() => navigator.clipboard?.writeText(text)}
                className="text-emerald-200/80 hover:text-emerald-100"
              >
                📋 Copiar
              </button>
            )}
          </div>
          <button
            className="btn-gold text-sm"
            disabled={!text.trim() || sendMutation.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            {sendMutation.isPending ? 'Enviando...' : '📣 Enviar para o grupo'}
          </button>
        </section>
      </div>

      {/* Convites para o grupo (DM/add) */}
      <GroupInviteSection />

      {/* Histórico */}
      <section>
        <h2 className="font-display text-xl tracking-wider text-emerald-100/80 mb-3">
          Histórico recente
        </h2>
        {historyQuery.isLoading ? (
          <p className="text-sm text-emerald-200/60">Carregando...</p>
        ) : (historyQuery.data ?? []).length === 0 ? (
          <p className="text-sm text-emerald-200/60">Nenhum envio ainda.</p>
        ) : (
          <ul className="space-y-2">
            {(historyQuery.data ?? []).map((h) => (
              <li
                key={h.id}
                className={
                  'rounded-xl border px-3 py-2 ' +
                  (h.status === 'sent'
                    ? 'border-emerald-500/20 bg-midnight-900/40'
                    : 'border-red-400/30 bg-red-500/5')
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-emerald-200/60 mb-1">
                  <span>
                    {h.status === 'sent' ? '✅' : '❌'} {h.presetKey ?? 'manual'} · {h.sentByName}
                  </span>
                  <span>{BRT.format(new Date(h.createdAt))}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap break-words text-emerald-50">{h.text}</p>
                {h.errorMessage && (
                  <p className="text-[11px] text-red-200/80 mt-1">{h.errorMessage}</p>
                )}
                <div className="mt-2 flex justify-end">
                  <button
                    className="btn-secondary text-[11px] py-1"
                    onClick={() => {
                      setText(h.text);
                      setSource(null);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  >
                    ✏️ Reusar texto
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AdminModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={<span className="font-display text-xl text-white tracking-wider">CONFIRMAR ENVIO</span>}
        footer={
          <>
            <button className="btn-secondary text-sm" onClick={() => setConfirmOpen(false)}>
              Revisar
            </button>
            <button
              className="btn-gold text-sm"
              disabled={sendMutation.isPending}
              onClick={() => sendMutation.mutate()}
            >
              {sendMutation.isPending ? 'Enviando...' : '📣 Enviar agora'}
            </button>
          </>
        }
      >
        <p className="text-sm text-emerald-100/80">
          Destino: <strong>Grupo do WhatsApp do bolão</strong>{' '}
          <span
            className={
              'ml-1 text-[10px] uppercase ' +
              (whatsappDriver === 'evolution' ? 'text-emerald-300' : 'text-amber-300')
            }
          >
            ({whatsappDriver})
          </span>
        </p>
        <div className="rounded-xl border border-emerald-500/20 bg-midnight-900/40 p-3 text-sm whitespace-pre-wrap break-words text-emerald-50">
          {text}
        </div>
        <p className="text-[11px] text-emerald-200/60">
          {whatsappDriver === 'evolution'
            ? 'Essa mensagem vai pro grupo agora.'
            : 'Modo mock: registramos o envio no histórico mas nada vai pro WhatsApp.'}
        </p>
      </AdminModal>
    </div>
  );
}
