import { useAuth } from '../lib/auth';

/**
 * Switch in the header that flips an admin user between "player mode" (sees
 * the app exactly as a subscriber) and "admin mode" (unlocks the /admin/*
 * sidebar). Hidden for non-admin users. Persists via the AuthProvider.
 */
export function AdminToggle() {
  const { isAdmin, adminView, toggleAdminView } = useAuth();
  if (!isAdmin) return null;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={adminView}
      onClick={toggleAdminView}
      title={adminView ? 'Voltar ao modo jogador' : 'Entrar no modo admin'}
      className={
        'group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ' +
        (adminView
          ? 'border-gold-400/60 bg-gold-400/15 text-gold-100 shadow-[inset_0_0_12px_rgba(245,158,11,0.25)]'
          : 'border-emerald-500/30 bg-midnight-900/40 text-emerald-200/80 hover:border-emerald-400/60 hover:text-emerald-100')
      }
    >
      <span
        className={
          'relative inline-flex h-4 w-7 rounded-full transition-colors ' +
          (adminView ? 'bg-gold-400' : 'bg-emerald-500/30')
        }
      >
        <span
          className={
            'absolute top-0.5 h-3 w-3 rounded-full bg-midnight-900 shadow transition-transform ' +
            (adminView ? 'translate-x-3.5' : 'translate-x-0.5')
          }
        />
      </span>
      <span className="hidden sm:inline">{adminView ? 'Admin' : 'Jogador'}</span>
    </button>
  );
}
