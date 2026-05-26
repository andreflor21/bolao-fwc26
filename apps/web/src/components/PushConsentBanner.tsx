import { useAuth } from '../lib/auth';
import { usePush } from '../lib/push';

/**
 * Banner that asks subscribed users if they want browser push notifications.
 * Shown only after sign-in, once the user has an active subscription, and
 * only while the consent state is `unknown` (i.e. they never answered).
 * "Talvez depois" stores `dismissed` so the banner stays hidden — they can
 * re-enable later from settings (TODO when that page exists).
 */
export function PushConsentBanner() {
  const { user } = useAuth();
  const push = usePush();

  // Show only to users who already paid in (subscriber/admin). Free players
  // never see the prompt — push for them would be marketing-only and that's
  // not the audience for the bolão.
  const isPaying = user?.role === 'subscriber' || user?.role === 'admin';
  if (!user || !isPaying) return null;
  if (!push.available) return null;
  if (push.consent !== 'unknown') return null;
  if (push.permission === 'denied') return null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="card-glow border-gold-400/40 bg-gold-400/5 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-xs font-bold tracking-[0.4em] text-gold-400 mb-1">
              NOTIFICAÇÕES
            </p>
            <p className="text-sm text-emerald-100/85">
              Quer receber alertas quando jogos começarem, palpites estiverem prestes
              a fechar ou sua posição no ranking mudar?
            </p>
            <p className="text-[10px] text-emerald-200/50 mt-1">
              Você pode desligar a qualquer momento. Nenhum dado pessoal é enviado.
            </p>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              className="btn-secondary text-xs"
              onClick={push.dismiss}
              disabled={push.busy}
            >
              Talvez depois
            </button>
            <button
              className="btn-gold text-xs"
              onClick={() => void push.subscribe()}
              disabled={push.busy}
            >
              {push.busy ? 'Ativando...' : '🔔 Ativar'}
            </button>
          </div>
        </div>
        {push.error && (
          <p className="text-xs text-red-200 mt-2 border-t border-red-400/20 pt-2">
            {push.error}
          </p>
        )}
      </div>
    </div>
  );
}
