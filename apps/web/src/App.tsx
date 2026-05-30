import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { Dashboard } from './pages/Dashboard';
import { SidePools } from './pages/SidePools';
import { JoinSidePool } from './pages/JoinSidePool';
import { Guesses } from './pages/Guesses';
import { BracketPreview } from './pages/BracketPreview';
import { KnockoutGuesses } from './pages/KnockoutGuesses';
import { Payment } from './pages/Payment';
import { PaymentSuccess } from './pages/PaymentSuccess';
import { PaymentCancel } from './pages/PaymentCancel';
import { PaymentPix } from './pages/PaymentPix';
import { Ranking } from './pages/Ranking';
import { Prizes } from './pages/Prizes';
import { AdminRoute } from './pages/admin/AdminLayout';
import { AdminMatches } from './pages/admin/AdminMatches';
import { AdminPrizes } from './pages/admin/AdminPrizes';
import { AdminClosure } from './pages/admin/AdminClosure';
import { AdminReconciliation } from './pages/admin/AdminReconciliation';
import { useAuth } from './lib/auth';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-center text-slate-500">Carregando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  // Gatilho de diagnóstico do Sentry front: /?sentry-test=1 lança um erro no
  // render → capturado pelo Sentry.ErrorBoundary (em main.tsx). No-op sem o
  // param. Remover depois de validar.
  if (new URLSearchParams(window.location.search).get('sentry-test') === '1') {
    throw new Error('Sentry front test error — disparado via ?sentry-test=1 (ignorar)');
  }
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/side-pools"
          element={
            <ProtectedRoute>
              <SidePools />
            </ProtectedRoute>
          }
        />
        <Route
          path="/join/:token"
          element={
            <ProtectedRoute>
              <JoinSidePool />
            </ProtectedRoute>
          }
        />
        <Route
          path="/guesses"
          element={
            <ProtectedRoute>
              <Guesses />
            </ProtectedRoute>
          }
        />
        <Route
          path="/bracket"
          element={
            <ProtectedRoute>
              <BracketPreview />
            </ProtectedRoute>
          }
        />
        <Route
          path="/knockout-guesses"
          element={
            <ProtectedRoute>
              <KnockoutGuesses />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pay"
          element={
            <ProtectedRoute>
              <Payment />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pay/success"
          element={
            <ProtectedRoute>
              <PaymentSuccess />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pay/mock-success"
          element={
            <ProtectedRoute>
              <PaymentSuccess />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pay/cancel"
          element={
            <ProtectedRoute>
              <PaymentCancel />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pay/pix"
          element={
            <ProtectedRoute>
              <PaymentPix />
            </ProtectedRoute>
          }
        />
        <Route
          path="/ranking"
          element={
            <ProtectedRoute>
              <Ranking />
            </ProtectedRoute>
          }
        />
        <Route
          path="/prizes"
          element={
            <ProtectedRoute>
              <Prizes />
            </ProtectedRoute>
          }
        />
        <Route path="/admin" element={<AdminRoute />}>
          <Route index element={<Navigate to="matches" replace />} />
          <Route path="matches" element={<AdminMatches />} />
          <Route path="prizes" element={<AdminPrizes />} />
          <Route path="closure" element={<AdminClosure />} />
          <Route path="reconciliation" element={<AdminReconciliation />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
