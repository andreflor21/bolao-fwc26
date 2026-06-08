import { NavLink, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../lib/auth';

/**
 * Wraps every /admin/* route. Refuses access unless the user is an admin
 * AND has the toggle on — keeping admins one click away from "player mode"
 * if they need to see the app the way a subscriber does.
 */
export function AdminRoute() {
  const { user, loading, isAdmin, adminView } = useAuth();
  if (loading) return <div className="p-8 text-center text-emerald-200/70">Carregando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  if (!adminView) return <Navigate to="/dashboard" replace />;
  return <AdminLayout />;
}

function AdminLayout() {
  return (
    <div className="grid gap-4 lg:grid-cols-[220px,1fr] lg:gap-6">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="card-glow !p-2 lg:!p-4 flex flex-row gap-1 overflow-x-auto lg:flex-col lg:space-y-1 border-gold-400/30 bg-gradient-to-br from-midnight-800/90 to-midnight-900/90">
          <p className="hidden lg:block text-[10px] tracking-[0.3em] text-gold-300/80 mb-2 px-2">
            PAINEL ADMIN
          </p>
          <SidebarLink to="/admin/matches" label="Resultados" icon="📊" />
          <SidebarLink to="/admin/knockout" label="Mata-mata" icon="🏟️" />
          <SidebarLink to="/admin/broadcast" label="Broadcast" icon="📣" />
          <SidebarLink to="/admin/prizes" label="Premiação" icon="🏆" />
          <SidebarLink to="/admin/closure" label="Encerramento" icon="🔒" />
          <SidebarLink to="/admin/pix" label="Pix" icon="💸" />
          <SidebarLink to="/admin/reconciliation" label="Reconciliação" icon="🔁" />
        </div>
      </aside>
      <main className="min-w-0">
        <Outlet />
      </main>
    </div>
  );
}

function SidebarLink({ to, label, icon }: { to: string; label: string; icon: string }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition shrink-0 whitespace-nowrap ' +
        (isActive
          ? 'bg-gold-400/20 text-gold-100 ring-1 ring-gold-400/40'
          : 'text-emerald-100/85 hover:bg-emerald-500/10 hover:text-white')
      }
    >
      <span className="text-base leading-none">{icon}</span>
      <span>{label}</span>
    </NavLink>
  );
}
