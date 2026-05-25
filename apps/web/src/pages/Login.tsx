import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { Trophy } from '../components/Trophy';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="grid place-items-center mb-6">
        <Trophy className="h-20 w-auto drop-shadow-[0_8px_20px_rgba(245,158,11,0.4)]" />
      </div>
      <div className="card-glow">
        <h1 className="font-display text-3xl tracking-wider text-white text-center">BEM-VINDO DE VOLTA</h1>
        <p className="mt-1 text-sm text-center text-emerald-200/70">
          Entre e siga firme rumo ao título
        </p>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="label">E-mail</label>
            <input
              className="input mt-1"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Senha</label>
            <input
              className="input mt-1"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p className="text-sm text-red-300 bg-red-950/40 border border-red-500/30 rounded-lg p-3">
              {error}
            </p>
          )}
          <button className="btn-gold w-full text-base py-3" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar no jogo'}
          </button>
        </form>
        <div className="mt-6 flex justify-between text-sm">
          <Link to="/forgot-password" className="link-accent">
            Esqueci a senha
          </Link>
          <Link to="/register" className="link-accent">
            Criar conta →
          </Link>
        </div>
      </div>
    </div>
  );
}
