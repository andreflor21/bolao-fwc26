import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { Trophy } from '../components/Trophy';
import { PasswordInput } from '../components/PasswordInput';

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [whatsappGroupOptIn, setWhatsappGroupOptIn] = useState(false);
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
      await register(email, password, name, {
        whatsapp: whatsapp.trim() || undefined,
        whatsappGroupOptIn,
      });
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
            <PasswordInput
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              value={password}
              onChange={setPassword}
            />
            <p className="mt-1 text-xs text-emerald-200/50">Mínimo 8 caracteres.</p>
          </div>
          <div>
            <label className="label">
              WhatsApp <span className="text-emerald-200/50 font-normal">(opcional)</span>
            </label>
            <input
              className="input mt-1"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder="+55 11 90000-0000"
              maxLength={20}
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
            />
          </div>
          <label className="flex items-start gap-3 text-sm text-emerald-100/80">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-emerald-500/40 bg-midnight-900 text-gold-500 focus:ring-gold-500"
              checked={whatsappGroupOptIn}
              onChange={(e) => setWhatsappGroupOptIn(e.target.checked)}
            />
            <span>Quero entrar no grupo do WhatsApp do bolão.</span>
          </label>
          <label className="flex items-start gap-3 text-sm text-emerald-100/80">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-emerald-500/40 bg-midnight-900 text-gold-500 focus:ring-gold-500"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
            />
            <span>
              Li e aceito os <Link className="link-accent" to="/terms">termos de uso</Link> e a{' '}
              <Link className="link-accent" to="/privacy">política de privacidade</Link>.
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
