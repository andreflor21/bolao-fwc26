import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { Trophy } from '../components/Trophy';

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      setDone(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="max-w-md mx-auto card-glow text-center">
        <p className="text-emerald-100">Link de redefinição inválido.</p>
        <Link to="/forgot-password" className="link-accent text-sm">
          Solicitar novo link
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="grid place-items-center mb-6">
        <Trophy className="h-20 w-auto drop-shadow-[0_8px_20px_rgba(245,158,11,0.4)]" />
      </div>
      <div className="card-glow">
        <h1 className="font-display text-3xl tracking-wider text-white text-center">NOVA SENHA</h1>
        {done ? (
          <p className="mt-6 text-emerald-200 text-sm bg-emerald-900/40 border border-emerald-500/30 rounded-xl p-4 text-center">
            ✅ Senha redefinida! Redirecionando…
          </p>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="label">Nova senha</label>
              <input
                className="input mt-1"
                type="password"
                required
                minLength={8}
                maxLength={128}
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
              {loading ? 'Salvando...' : 'Redefinir senha'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
