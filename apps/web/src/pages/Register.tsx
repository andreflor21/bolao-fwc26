import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { Trophy } from '../components/Trophy';

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!acceptedTerms) {
      setError('Você precisa aceitar os termos e a política de privacidade.');
      return;
    }
    setLoading(true);
    try {
      await register(email, password, name);
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
        <h1 className="font-display text-3xl tracking-wider text-white text-center">ENTRE NO JOGO</h1>
        <p className="mt-2 text-sm text-center text-emerald-200/70">
          Cadastro gratuito. Inscrição no Bolão Geral por{' '}
          <strong className="text-gold-300">R$ 50</strong> via Pix logo após.
        </p>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="label">Nome</label>
            <input
              className="input mt-1"
              required
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
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
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="mt-1 text-xs text-emerald-200/50">Mínimo 8 caracteres.</p>
          </div>
          <label className="flex items-start gap-3 text-sm text-emerald-100/80">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-emerald-500/40 bg-midnight-900 text-gold-500 focus:ring-gold-500"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
            />
            <span>
              Li e aceito os <a className="link-accent" href="#">termos de uso</a> e a{' '}
              <a className="link-accent" href="#">política de privacidade</a>.
            </span>
          </label>
          {error && (
            <p className="text-sm text-red-300 bg-red-950/40 border border-red-500/30 rounded-lg p-3">
              {error}
            </p>
          )}
          <button className="btn-gold w-full text-base py-3" disabled={loading}>
            {loading ? 'Criando...' : 'Criar conta'}
          </button>
        </form>
        <p className="mt-6 text-sm text-center text-emerald-200/70">
          Já tem conta?{' '}
          <Link to="/login" className="link-accent">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
