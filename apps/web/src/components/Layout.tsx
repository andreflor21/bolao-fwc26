import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { AdminToggle } from './AdminToggle';
import { Trophy } from './Trophy';

const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/guesses', label: 'Palpites' },
  { to: '/bracket', label: 'Chaveamento' },
  { to: '/knockout-guesses', label: 'Mata-mata' },
  { to: '/ranking', label: 'Ranking' },
  { to: '/participantes', label: 'Participantes' },
  { to: '/prizes', label: 'Prêmios' },
  { to: '/side-pools', label: 'Meus bolões' },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAdmin, adminView } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);
  const doLogout = async () => {
    closeMenu();
    await logout();
    navigate('/');
  };

  const navLinkClass =
    'px-3 py-2 rounded-lg text-emerald-100/90 hover:text-white hover:bg-emerald-500/10 transition';

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-30 border-b border-emerald-500/15 bg-midnight-900/70 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-3 group" onClick={closeMenu}>
            <Trophy className="h-10 sm:h-12 w-auto drop-shadow-[0_4px_12px_rgba(245,158,11,0.4)] transition-transform group-hover:-translate-y-0.5" />
            <div className="leading-tight border-l border-emerald-500/25 pl-3 hidden sm:block">
              <p className="font-display text-xl tracking-wider text-shimmer">BOLÃO</p>
              <p className="text-[10px] font-bold tracking-[0.3em] text-emerald-300/80">DA TURMA</p>
            </div>
          </Link>

          {/* Nav desktop (lg+) */}
          <nav className="hidden lg:flex items-center gap-2 text-sm">
            {user ? (
              <>
                {NAV_LINKS.map((l) => (
                  <Link key={l.to} to={l.to} className={navLinkClass}>
                    {l.label}
                  </Link>
                ))}
                {isAdmin && adminView && (
                  <Link
                    to="/admin"
                    className="px-3 py-2 rounded-lg text-gold-200 hover:text-gold-100 hover:bg-gold-500/10 transition font-semibold"
                  >
                    Admin
                  </Link>
                )}
                <div className="pl-2 ml-1 border-l border-emerald-500/20 flex items-center gap-2">
                  <AdminToggle />
                </div>
                <div className="flex items-center gap-2 pl-3 ml-1 border-l border-emerald-500/20">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-gold-300 to-gold-600 grid place-items-center text-midnight-900 font-bold text-sm shadow-md">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-emerald-100 text-sm font-medium">
                    {user.name.split(' ')[0]}
                  </span>
                </div>
                <button className="btn-secondary text-xs ml-1" onClick={doLogout}>
                  Sair
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className={navLinkClass}>
                  Entrar
                </Link>
                <Link to="/register" className="btn-gold text-sm">
                  Quero participar
                </Link>
              </>
            )}
          </nav>

          {/* Ações mobile (< lg): toggle admin + hambúrguer (logado) ou CTA (deslogado) */}
          <div className="flex items-center gap-2 lg:hidden">
            {user ? (
              <>
                {isAdmin && <AdminToggle />}
                <button
                  type="button"
                  aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((v) => !v)}
                  className="h-11 w-11 grid place-items-center rounded-lg text-emerald-100 hover:bg-emerald-500/10 transition"
                >
                  {menuOpen ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M4 7h16M4 12h16M4 17h16" />
                    </svg>
                  )}
                </button>
              </>
            ) : (
              <Link to="/register" className="btn-gold text-sm">
                Participar
              </Link>
            )}
          </div>
        </div>

        {/* Drawer mobile */}
        {user && menuOpen && (
          <nav className="lg:hidden border-t border-emerald-500/15 bg-midnight-900/95 backdrop-blur-xl px-4 py-3 flex flex-col gap-1">
            <div className="flex items-center gap-3 pb-3 mb-2 border-b border-emerald-500/15">
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-gold-300 to-gold-600 grid place-items-center text-midnight-900 font-bold shadow-md">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-emerald-100 font-medium">{user.name.split(' ')[0]}</span>
            </div>
            {NAV_LINKS.map((l) => (
              <Link key={l.to} to={l.to} onClick={closeMenu} className={`${navLinkClass} text-base`}>
                {l.label}
              </Link>
            ))}
            {isAdmin && adminView && (
              <Link
                to="/admin"
                onClick={closeMenu}
                className="px-3 py-2 rounded-lg text-base text-gold-200 hover:bg-gold-500/10 transition font-semibold"
              >
                Admin
              </Link>
            )}
            <button className="btn-secondary mt-2 w-full" onClick={doLogout}>
              Sair
            </button>
          </nav>
        )}
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 sm:py-10">{children}</main>

      <footer className="border-t border-emerald-500/15 bg-midnight-900/60 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-emerald-200/60 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <Trophy className="h-7 w-auto opacity-90" />
            <span>Bolão recreativo entre amigos — Copa do Mundo FIFA 2026</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link to="/privacy" className="hover:text-emerald-100 transition">
              Privacidade
            </Link>
            <Link to="/terms" className="hover:text-emerald-100 transition">
              Termos
            </Link>
          </nav>
          <p>
            Palpites travam às <span className="text-gold-300 font-semibold">16:00 (BRT) de 11/06/2026</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
