import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';

interface SidePoolItem {
  id: string;
  name: string;
  description: string | null;
  ownerUserId: string;
  maxMembers: number;
  memberCount: number;
  isOwner: boolean;
  createdAt: string;
}

export function SidePools() {
  const qc = useQueryClient();
  const { data: pools, isLoading } = useQuery({
    queryKey: ['side-pools'],
    queryFn: () => api<SidePoolItem[]>('/side-pools'),
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [maxMembers, setMaxMembers] = useState<number>(100);
  const [createError, setCreateError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      api<SidePoolItem & { inviteToken: string }>('/side-pools', {
        method: 'POST',
        body: JSON.stringify({ name, description: description || undefined, maxMembers }),
      }),
    onSuccess: () => {
      setName('');
      setDescription('');
      setMaxMembers(100);
      setCreateError(null);
      qc.invalidateQueries({ queryKey: ['side-pools'] });
    },
    onError: (err) => {
      setCreateError(err instanceof ApiError ? err.message : 'Erro');
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    createMutation.mutate();
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-bold tracking-[0.4em] text-gold-400">BOLÕES PARALELOS</p>
        <h1 className="font-display text-4xl tracking-wider text-white mt-1">
          REÚNA A <span className="text-shimmer">TORCIDA</span>
        </h1>
        <p className="text-sm text-emerald-200/70 mt-2 max-w-xl">
          Crie bolões com amigos, família ou colegas. Sem cobrança adicional — sua inscrição no Geral já libera tudo.
        </p>
      </header>

      <section className="card-glow">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-gold-300 to-gold-600 grid place-items-center text-midnight-900 text-xl shadow-md">
            ➕
          </div>
          <div>
            <h2 className="font-display text-2xl tracking-wider text-white">CRIAR BOLÃO</h2>
            <p className="text-xs text-emerald-200/60 mt-0.5">Limite de 20 bolões por jogador.</p>
          </div>
        </div>
        <form className="grid sm:grid-cols-3 gap-3" onSubmit={onSubmit}>
          <input
            className="input sm:col-span-1"
            placeholder="Nome do bolão"
            required
            minLength={3}
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="input sm:col-span-1"
            placeholder="Descrição (opcional)"
            maxLength={280}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <input
            className="input sm:col-span-1"
            type="number"
            min={2}
            max={100}
            value={maxMembers}
            onChange={(e) => setMaxMembers(Number(e.target.value))}
            placeholder="Máx. participantes"
          />
          {createError && (
            <p className="sm:col-span-3 text-sm text-red-300 bg-red-950/40 border border-red-500/30 rounded-lg p-3">
              {createError}
            </p>
          )}
          <button className="btn-gold sm:col-span-1" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Criando...' : 'Criar bolão'}
          </button>
        </form>
      </section>

      <section className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-700 grid place-items-center text-white text-xl shadow-md">
            🏟️
          </div>
          <h2 className="font-display text-2xl tracking-wider text-white">MEUS BOLÕES</h2>
        </div>
        {isLoading && <p className="text-sm text-emerald-200/60">Carregando...</p>}
        {!isLoading && pools?.length === 0 && (
          <div className="text-center py-10 px-4 rounded-xl border border-dashed border-emerald-500/20 bg-emerald-900/10">
            <p className="text-4xl mb-3">⚽</p>
            <p className="text-sm text-emerald-200/70 max-w-md mx-auto">
              Você ainda não participa de nenhum bolão paralelo. Crie um acima ou peça um link de convite a
              um amigo.
            </p>
          </div>
        )}
        <ul className="divide-y divide-emerald-500/10">
          {pools?.map((p) => (
            <li key={p.id} className="py-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="shrink-0 h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 grid place-items-center text-emerald-300 font-bold">
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-emerald-50 truncate">{p.name}</p>
                  <p className="text-xs text-emerald-200/60">
                    👥 {p.memberCount}/{p.maxMembers} participantes
                    {p.isOwner && (
                      <span className="ml-2 text-gold-300 font-semibold">· você é o criador</span>
                    )}
                  </p>
                </div>
              </div>
              {p.isOwner && <CopyInviteButton sidePoolId={p.id} />}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function CopyInviteButton({ sidePoolId }: { sidePoolId: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      const r = await api<{ inviteToken: string }>(`/side-pools/${sidePoolId}/invite`);
      const url = `${window.location.origin}/join/${r.inviteToken}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  }
  return (
    <button className="btn-secondary text-xs" onClick={copy}>
      {copied ? '✓ Copiado!' : '🔗 Copiar convite'}
    </button>
  );
}
