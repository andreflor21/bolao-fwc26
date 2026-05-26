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
import { PaymentPix } from './pages/PaymentPix';
import { Ranking } from './pages/Ranking';
import { Prizes } from './pages/Prizes';
import { useAuth } from './lib/auth';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-center text-slate-500">Carregando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
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
          path="/pay"
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
