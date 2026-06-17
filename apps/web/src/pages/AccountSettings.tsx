import { FormEvent, useState } from 'react';
import { useAuth } from '../lib/auth';
import { api, ApiError } from '../lib/api';
import { PasswordInput } from '../components/PasswordInput';

export function AccountSettings() {
  const { user, refreshMe } = useAuth();

  // --- Alterar senha ---
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    setPwdError(null);
    setPwdSuccess(false);
    if (newPassword.length < 8) {
      setPwdError('A nova senha precisa ter ao menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError('A confirmação não confere com a nova senha.');
      return;
    }
    setPwdLoading(true);
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setPwdSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwdError(err instanceof ApiError ? err.message : 'Erro inesperado');
    } finally {
      setPwdLoading(false);
    }
  }

  // --- Chave Pix ---
  const [pixKey, setPixKey] = useState(user?.pixKey ?? '');
  const [pixError, setPixError] = useState<string | null>(null);
  const [pixSuccess, setPixSuccess] = useState(false);
  const [pixLoading, setPixLoading] = useState(false);

  async function onSavePix(e: FormEvent) {
    e.preventDefault();
    setPixError(null);
    setPixSuccess(false);
    setPixLoading(true);
    try {
      await api('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ pixKey }),
      });
      await refreshMe();
      setPixSuccess(true);
    } catch (err) {
      setPixError(err instanceof ApiError ? err.message : 'Erro inesperado');
    } finally {
      setPixLoading(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-3xl tracking-wider text-white">CONFIGURAÇÕES</h1>
        <p className="mt-1 text-sm text-emerald-200/70">
          {user?.name} · {user?.email}
        </p>
      </div>

      {/* Chave Pix */}
      <div className="card-glow">
        <h2 className="font-display text-2xl tracking-wide text-white">CHAVE PIX</h2>
        <p className="mt-1 text-sm text-emerald-200/70">
          Usamos sua chave Pix para enviar os prêmios caso você fature no bolão.
        </p>
        <form className="mt-5 space-y-4" onSubmit={onSavePix}>
          <div>
            <label className="label">Chave Pix</label>
            <input
              className="input mt-1"
              type="text"
              maxLength={140}
              placeholder="CPF, e-mail, telefone ou chave aleatória"
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
            />
          </div>
          {pixError && (
            <p className="text-sm text-red-300 bg-red-950/40 border border-red-500/30 rounded-lg p-3">
              {pixError}
            </p>
          )}
          {pixSuccess && (
            <p className="text-sm text-emerald-200 bg-emerald-950/40 border border-emerald-500/30 rounded-lg p-3">
              Chave Pix salva com sucesso.
            </p>
          )}
          <button className="btn-gold w-full text-base py-3" disabled={pixLoading}>
            {pixLoading ? 'Salvando...' : 'Salvar chave Pix'}
          </button>
        </form>
      </div>

      {/* Alterar senha */}
      <div className="card-glow">
        <h2 className="font-display text-2xl tracking-wide text-white">ALTERAR SENHA</h2>
        <p className="mt-1 text-sm text-emerald-200/70">
          Informe sua senha atual e escolha uma nova senha.
        </p>
        <form className="mt-5 space-y-4" onSubmit={onChangePassword}>
          <div>
            <label className="label">Senha atual</label>
            <PasswordInput
              autoComplete="current-password"
              required
              minLength={8}
              value={currentPassword}
              onChange={setCurrentPassword}
            />
          </div>
          <div>
            <label className="label">Nova senha</label>
            <PasswordInput
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              value={newPassword}
              onChange={setNewPassword}
            />
          </div>
          <div>
            <label className="label">Confirmar nova senha</label>
            <PasswordInput
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              value={confirmPassword}
              onChange={setConfirmPassword}
            />
          </div>
          {pwdError && (
            <p className="text-sm text-red-300 bg-red-950/40 border border-red-500/30 rounded-lg p-3">
              {pwdError}
            </p>
          )}
          {pwdSuccess && (
            <p className="text-sm text-emerald-200 bg-emerald-950/40 border border-emerald-500/30 rounded-lg p-3">
              Senha alterada com sucesso.
            </p>
          )}
          <button className="btn-gold w-full text-base py-3" disabled={pwdLoading}>
            {pwdLoading ? 'Salvando...' : 'Alterar senha'}
          </button>
        </form>
      </div>
    </div>
  );
}
