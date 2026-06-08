import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { AdminModal } from '../../components/admin/AdminModal';

interface Candidate {
  userId: string;
  name: string;
  whatsapp: string | null;
  whatsappNormalized: string | null;
  lastInvitedAt: string | null;
  lastInviteStatus: 'added' | 'dm_sent' | 'failed' | null;
}

interface InviteResultRow {
  userId: string;
  name: string;
  outcome: 'added' | 'dm_sent' | 'failed' | 'skipped';
  reason?: string;
}

interface SendInvitesResult {
  total: number;
  added: number;
  dmSent: number;
  failed: number;
  skipped: number;
  groupInviteUrl: string;
  whatsappDriver: 'mock' | 'evolution';
  results: InviteResultRow[];
}

const DEFAULT_TEMPLATE = `Oi {nome}! 👋

Você marcou no app que quer participar do grupo do bolão da Copa do Mundo 2026 no WhatsApp.

Entra pelo link: {linkConvite}

Lá a gente compartilha os palpites mais jogados, % de vitória/empate e a zoeira da galera. Bora! ⚽🏆`;

const STATUS_LABEL: Record<NonNullable<Candidate['lastInviteStatus']>, { label: string; cls: string }> = {
  added: { label: '✓ adicionado', cls: 'text-emerald-300' },
  dm_sent: { label: '✉️ DM enviada', cls: 'text-emerald-200/70' },
  failed: { label: '⚠️ falhou', cls: 'text-amber-200' },
};

const BRT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function GroupInviteSection() {
  const qc = useQueryClient();
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [tryAddDirect, setTryAddDirect] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState<SendInvitesResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const candidatesQuery = useQuery({
    queryKey: ['broadcast-invite-candidates'],
    queryFn: () => api<Candidate[]>('/admin/broadcast/group-invite/candidates'),
    refetchInterval: 60_000,
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      api<SendInvitesResult>('/admin/broadcast/group-invite/send', {
        method: 'POST',
        body: JSON.stringify({
          userIds: Array.from(selected),
          template,
          tryAddDirect,
        }),
      }),
    onSuccess: (data) => {
      setConfirmOpen(false);
      setResultOpen(data);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['broadcast-invite-candidates'] });
      qc.invalidateQueries({ queryKey: ['broadcast-history'] });
    },
    onError: (e: unknown) => {
      setConfirmOpen(false);
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    },
  });

  const candidates = useMemo(() => candidatesQuery.data ?? [], [candidatesQuery.data]);
  const counts = useMemo(() => {
    let neverInvited = 0;
    let invalidPhone = 0;
    for (const c of candidates) {
      if (!c.whatsappNormalized) invalidPhone += 1;
      if (c.lastInviteStatus === null) neverInvited += 1;
    }
    return { total: candidates.length, neverInvited, invalidPhone };
  }, [candidates]);

  function toggle(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function selectAllNew() {
    setSelected(new Set(candidates.filter((c) => c.lastInviteStatus === null && c.whatsappNormalized).map((c) => c.userId)));
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl tracking-wider text-emerald-100/80">
            📲 Convites para o grupo
          </h2>
          <p className="text-sm text-emerald-200/70 mt-1 max-w-2xl">
            Para participantes que marcaram <strong>opt-in</strong> no app + têm número cadastrado.
            Tenta adicionar direto ao grupo e, pra quem o WhatsApp bloquear por privacidade, envia
            DM com o link.
          </p>
        </div>
        <div className="text-[11px] text-emerald-200/60 text-right">
          <p>
            <span className="text-emerald-200">{counts.total}</span> opt-ins ·{' '}
            <span className="text-gold-200">{counts.neverInvited}</span> nunca convidados
          </p>
          {counts.invalidPhone > 0 && (
            <p className="text-amber-200/80">
              ⚠ {counts.invalidPhone} com número inválido
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="card border-red-400/40 bg-red-500/10 text-red-200 text-sm flex items-start justify-between gap-3">
          <span className="break-words">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-xs text-red-100/70 hover:text-red-100 shrink-0"
          >
            fechar
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.2fr,1fr]">
        {/* Lista de candidatos */}
        <div className="card-glow space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] tracking-[0.3em] text-gold-300/80">PARTICIPANTES OPT-IN</p>
            <div className="flex gap-2">
              <button
                onClick={selectAllNew}
                className="btn-secondary text-[11px] py-1"
                disabled={counts.neverInvited === 0}
              >
                ✓ Selecionar não-convidados ({counts.neverInvited})
              </button>
              {selected.size > 0 && (
                <button
                  onClick={() => setSelected(new Set())}
                  className="text-[11px] text-emerald-200/70 hover:text-emerald-100"
                >
                  limpar
                </button>
              )}
            </div>
          </div>

          {candidatesQuery.isLoading ? (
            <p className="text-sm text-emerald-200/60">Carregando...</p>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-emerald-200/60">
              Nenhum participante marcou opt-in pro grupo ainda.
            </p>
          ) : (
            <ul className="divide-y divide-emerald-500/10 max-h-[420px] overflow-y-auto -mx-1">
              {candidates.map((c) => {
                const checked = selected.has(c.userId);
                const disabled = !c.whatsappNormalized;
                return (
                  <li key={c.userId} className={'flex items-center gap-2 px-1 py-2 ' + (disabled ? 'opacity-50' : '')}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggle(c.userId)}
                      className="h-4 w-4 shrink-0 accent-gold-400"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-emerald-50 truncate">{c.name}</p>
                      <p className="text-[11px] text-emerald-200/50 truncate">
                        {c.whatsappNormalized
                          ? `+${c.whatsappNormalized}`
                          : `⚠ ${c.whatsapp ?? '(sem número)'}`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {c.lastInviteStatus ? (
                        <p className={'text-[10px] ' + STATUS_LABEL[c.lastInviteStatus].cls}>
                          {STATUS_LABEL[c.lastInviteStatus].label}
                        </p>
                      ) : (
                        <p className="text-[10px] text-emerald-300/50">novo</p>
                      )}
                      {c.lastInvitedAt && (
                        <p className="text-[10px] text-emerald-200/40">
                          {BRT.format(new Date(c.lastInvitedAt))}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Template + opções */}
        <div className="card-glow space-y-3 flex flex-col">
          <div>
            <p className="text-[10px] tracking-[0.3em] text-gold-300/80 mb-2">TEMPLATE</p>
            <p className="text-[11px] text-emerald-200/60 mb-2">
              Placeholders disponíveis: <code className="text-gold-300">{'{nome}'}</code> e{' '}
              <code className="text-gold-300">{'{linkConvite}'}</code>.
            </p>
            <textarea
              className="input w-full min-h-[180px] font-mono text-sm leading-relaxed"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              maxLength={2000}
            />
            <p className="text-[10px] text-emerald-200/50 mt-1">
              {template.length}/2000 caracteres
            </p>
          </div>

          <label className="flex items-start gap-2 text-xs text-emerald-100/80 cursor-pointer">
            <input
              type="checkbox"
              checked={tryAddDirect}
              onChange={(e) => setTryAddDirect(e.target.checked)}
              className="mt-0.5 accent-gold-400"
            />
            <span>
              <strong>Tentar adicionar direto ao grupo primeiro.</strong> Quem o WhatsApp bloquear
              por privacidade recebe DM. Requer que o bot seja admin do grupo.
            </span>
          </label>

          <button
            className="btn-gold text-sm"
            disabled={selected.size === 0 || sendMutation.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            {sendMutation.isPending
              ? 'Enviando...'
              : `📲 Convidar ${selected.size} ${selected.size === 1 ? 'pessoa' : 'pessoas'}`}
          </button>
        </div>
      </div>

      {/* Modal de confirmação */}
      <AdminModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={<span className="font-display text-xl text-white tracking-wider">CONFIRMAR CONVITES</span>}
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
              {sendMutation.isPending ? 'Enviando...' : `📲 Enviar ${selected.size}`}
            </button>
          </>
        }
      >
        <p className="text-sm text-emerald-100/80">
          {selected.size} {selected.size === 1 ? 'participante será contactado' : 'participantes serão contactados'}.
        </p>
        <ul className="text-xs text-emerald-200/70 list-disc list-inside space-y-1">
          {tryAddDirect && <li>Vamos tentar adicionar direto ao grupo.</li>}
          <li>Quem não puder ser adicionado recebe DM com o link.</li>
          <li>Cada envio é registrado no histórico (preset <code>group-invite-*</code>).</li>
        </ul>
      </AdminModal>

      {/* Modal de resultado */}
      <AdminModal
        open={resultOpen !== null}
        onClose={() => setResultOpen(null)}
        maxWidth="xl"
        title={<span className="font-display text-xl text-white tracking-wider">RESULTADO DOS CONVITES</span>}
        footer={
          <button className="btn-gold text-sm" onClick={() => setResultOpen(null)}>
            Fechar
          </button>
        }
      >
        {resultOpen && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="Adicionados" value={resultOpen.added} cls="text-emerald-200" />
              <Stat label="DMs" value={resultOpen.dmSent} cls="text-gold-200" />
              <Stat label="Falhas" value={resultOpen.failed} cls="text-amber-200" />
              <Stat label="Ignorados" value={resultOpen.skipped} cls="text-emerald-300/50" />
            </div>
            {resultOpen.whatsappDriver === 'mock' && (
              <p className="text-xs text-amber-200/80 border border-amber-400/30 bg-amber-500/5 rounded-xl p-2">
                ⚠️ Modo mock: nada foi enviado de verdade. Configure WHATSAPP_PROVIDER=evolution
                para envios reais.
              </p>
            )}
            <p className="text-[11px] text-emerald-200/60">
              Link do grupo: <code className="text-gold-300 break-all">{resultOpen.groupInviteUrl}</code>
            </p>
            <details className="text-xs">
              <summary className="cursor-pointer text-emerald-200/70">
                Detalhes por participante ({resultOpen.results.length})
              </summary>
              <ul className="mt-2 space-y-1 max-h-72 overflow-y-auto">
                {resultOpen.results.map((r) => (
                  <li
                    key={r.userId + r.outcome}
                    className={
                      'flex items-start justify-between gap-2 py-1 border-b border-emerald-500/10 ' +
                      (r.outcome === 'failed' || r.outcome === 'skipped' ? 'text-amber-200/80' : 'text-emerald-100/85')
                    }
                  >
                    <span className="truncate">{r.name}</span>
                    <span className="text-[10px] uppercase tracking-wider shrink-0">{r.outcome}</span>
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </AdminModal>
    </section>
  );
}

function Stat({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="rounded-lg border border-emerald-500/15 bg-midnight-900/40 px-3 py-2 text-center">
      <p className={'font-display text-2xl ' + cls}>{value}</p>
      <p className="text-[10px] tracking-widest text-emerald-300/60 uppercase">{label}</p>
    </div>
  );
}
