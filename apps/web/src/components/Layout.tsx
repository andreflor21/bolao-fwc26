import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Trophy } from './Trophy';

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-30 border-b border-emerald-500/15 bg-midnight-900/70 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-3 group">
            <Trophy className="h-12 w-auto drop-shadow-[0_4px_12px_rgba(245,158,11,0.4)] transition-transform group-hover:-translate-y-0.5" />
            <div className="leading-tight border-l border-emerald-500/25 pl-3 hidden sm:block">
              <p className="font-display text-xl tracking-wider text-shimmer">BOLÃO</p>
              <p className="text-[10px] font-bold tracking-[0.3em] text-emerald-300/80">DA TURMA</p>
            </div>
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            {user ? (
              <>
                <Link
                  to="/dashboard"
                  className="px-3 py-2 rounded-lg text-emerald-100/90 hover:text-white hover:bg-emerald-500/10 transition"
                >
                  Dashboard
                </Link>
                <Link
                  to="/side-pools"
                  className="px-3 py-2 rounded-lg text-emerald-100/90 hover:text-white hover:bg-emerald-500/10 transition"
                >
                  Meus bolões
                </Link>
                <div className="hidden sm:flex items-center gap-2 pl-3 ml-1 border-l border-emerald-500/20">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-gold-300 to-gold-600 grid place-items-center text-midnight-900 font-bold text-sm shadow-md">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-emerald-100 text-sm font-medium">
                    {user.name.split(' ')[0]}
                  </span>
                </div>
                <button
                  className="btn-secondary text-xs ml-1"
                  onClick={async () => {
                    await logout();
                    navigate('/');
                  }}
                >
                  Sair
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="px-3 py-2 rounded-lg text-emerald-100/90 hover:text-white hover:bg-emerald-500/10 transition"
                >
                  Entrar
                </Link>
                <Link to="/register" className="btn-gold text-sm">
                  Quero participar
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-10">{children}</main>

      <footer className="border-t border-emerald-500/15 bg-midnight-900/60 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-emerald-200/60">
          <div className="flex items-center gap-2">
            <Trophy className="h-7 w-auto opacity-90" />
            <span>Bolão recreativo entre amigos — Copa do Mundo FIFA 2026</span>
          </div>
          <p>
            Palpites travam às <span className="text-gold-300 font-semibold">16:00 (BRT) de 11/06/2026</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
