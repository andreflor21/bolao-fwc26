import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { Trophy } from '../components/Trophy';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSent(true);
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
        <h1 className="font-display text-3xl tracking-wider text-white text-center">RECUPERAR SENHA</h1>
        {sent ? (
          <p className="mt-6 text-sm text-emerald-100/80 bg-emerald-900/30 border border-emerald-500/20 rounded-xl p-4">
            Se este e-mail estiver cadastrado, você receberá instruções para redefinir a senha em alguns
            minutos. O link expira em <strong className="text-gold-300">1 hora</strong>.
          </p>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="label">E-mail</label>
              <input
                className="input mt-1"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {error && (
              <p className="text-sm text-red-300 bg-red-950/40 border border-red-500/30 rounded-lg p-3">
                {error}
              </p>
            )}
            <button className="btn-gold w-full text-base py-3" disabled={loading}>
              {loading ? 'Enviando...' : 'Enviar link de recuperação'}
            </button>
          </form>
        )}
        <p className="mt-6 text-sm text-center">
          <Link to="/login" className="link-accent">
            ← Voltar para login
          </Link>
        </p>
      </div>
    </div>
  );
}
