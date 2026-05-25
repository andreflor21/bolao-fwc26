import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { Trophy } from '../components/Trophy';

export function JoinSidePool() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<'joining' | 'ok' | 'error'>('joining');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage('Link de convite inválido.');
      return;
    }
    api<{ sidePoolId: string; alreadyMember: boolean }>(`/side-pools/join/${token}`, {
      method: 'POST',
    })
      .then((r) => {
        setState('ok');
        setMessage(
          r.alreadyMember
            ? 'Você já participa deste bolão. Redirecionando...'
            : 'Entrada confirmada! Redirecionando...',
        );
        setTimeout(() => navigate('/side-pools'), 1500);
      })
      .catch((err) => {
        setState('error');
        setMessage(
          err instanceof ApiError
            ? err.status === 403
              ? 'Você precisa estar inscrito no Bolão Geral (R$ 50) para entrar em bolões paralelos.'
              : err.message
            : 'Erro ao processar convite.',
        );
      });
  }, [token, navigate]);

  return (
    <div className="max-w-md mx-auto">
      <div className="grid place-items-center mb-6">
        <Trophy
          className={
            'h-20 w-auto drop-shadow-[0_8px_20px_rgba(245,158,11,0.4)] ' +
            (state === 'joining' ? 'animate-float' : '')
          }
        />
      </div>
      <div className="card-glow text-center">
        <h1 className="font-display text-2xl tracking-wider text-white">ENTRANDO NO BOLÃO</h1>
        <p
          className={
            'mt-4 text-sm rounded-xl p-4 border ' +
            (state === 'error'
              ? 'text-red-300 bg-red-950/30 border-red-500/30'
              : state === 'ok'
                ? 'text-emerald-200 bg-emerald-900/30 border-emerald-500/30'
                : 'text-emerald-100/80 bg-emerald-900/20 border-emerald-500/20')
          }
        >
          {message || 'Processando convite...'}
        </p>
      </div>
    </div>
  );
}
