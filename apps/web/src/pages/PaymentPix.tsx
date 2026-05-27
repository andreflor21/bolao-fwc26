import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, apiUpload, ApiError } from '../lib/api';

interface PixDetails {
  enabled: boolean;
  amountCents: number;
  payload: string;
  qrCodeDataUrl: string;
  pixKey: string;
  recipientName: string;
  receiptStatus: 'none' | 'analyzing' | 'auto_confirmed' | 'manual_review' | 'rejected';
  subscriptionStatus: 'pending_payment' | 'active' | 'refunded';
}

interface ReceiptVerdict {
  status: 'auto_confirmed' | 'manual_review' | 'rejected';
  reason: string;
  extracted: {
    amountCents: number | null;
    pixKey: string | null;
    recipientName: string | null;
    recipientTaxId: string | null;
    paidAtIso: string | null;
  };
}

interface SubmitResult {
  status: PixDetails['receiptStatus'];
  subscriptionStatus: PixDetails['subscriptionStatus'];
  verdict: ReceiptVerdict;
}

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
const MAX_SIZE = 5 * 1024 * 1024;

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function uploadReceipt(file: File): Promise<SubmitResult> {
  const form = new FormData();
  form.append('file', file);
  return apiUpload<SubmitResult>('/subscription/pix-fallback/receipt', form);
}

export function PaymentPix() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const detailsQuery = useQuery({
    queryKey: ['pix-fallback-details'],
    queryFn: () => api<PixDetails>('/subscription/pix-fallback'),
    retry: false,
  });

  useEffect(() => {
    if (detailsQuery.error instanceof ApiError && detailsQuery.error.status === 404) {
      navigate('/pay', { replace: true });
    }
    if (detailsQuery.data?.subscriptionStatus === 'active') {
      navigate('/dashboard', { replace: true });
    }
  }, [detailsQuery.error, detailsQuery.data?.subscriptionStatus, navigate]);

  const submit = useMutation({
    mutationFn: (f: File) => uploadReceipt(f),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['pix-fallback-details'] });
      qc.invalidateQueries({ queryKey: ['subscription-status'] });
      if (result.status === 'auto_confirmed') {
        setTimeout(() => navigate('/dashboard'), 2_000);
      }
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : 'Falha no envio do comprovante');
    },
  });

  const details = detailsQuery.data;

  function pickFile(f: File | null) {
    setError(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (!ALLOWED_TYPES.includes(f.type)) {
      setError('Envie PNG, JPEG, WebP ou PDF.');
      return;
    }
    if (f.size > MAX_SIZE) {
      setError('Arquivo maior que 5MB.');
      return;
    }
    setFile(f);
  }

  async function copyCode() {
    if (!details?.payload) return;
    try {
      await navigator.clipboard.writeText(details.payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 1_600);
    } catch {
      setError('Não consegui copiar — selecione e copie manualmente.');
    }
  }

  if (detailsQuery.isLoading) {
    return (
      <div className="text-center text-emerald-200/70 py-12">
        Carregando dados do Pix...
      </div>
    );
  }
  if (!details) {
    return (
      <div className="text-center text-red-200 py-12">
        Pix fallback indisponível.
      </div>
    );
  }

  const verdict = submit.data?.verdict;
  const lastStatus = submit.data?.status ?? details.receiptStatus;

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <header>
        <p className="text-xs font-bold tracking-[0.4em] text-gold-400">PAGAMENTO</p>
        <h1 className="font-display text-4xl tracking-wider text-white mt-1">
          <span className="text-shimmer">PIX · COMPROVANTE</span>
        </h1>
        <p className="text-sm text-emerald-200/70 mt-2">
          Pague <strong>{formatBRL(details.amountCents)}</strong> via Pix usando o QR code
          abaixo e anexe o comprovante. Verificamos automaticamente e ativamos sua inscrição.
        </p>
      </header>

      {error && (
        <div className="card text-red-200 border-red-400/40 bg-red-500/10">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-xs text-red-100/70 hover:text-red-100"
            >
              fechar
            </button>
          </div>
        </div>
      )}

      <section className="card-glow space-y-5">
        <div className="grid sm:grid-cols-[200px,1fr] gap-5 items-start">
          <div className="rounded-xl bg-white p-3 grid place-items-center w-full aspect-square">
            <img
              src={details.qrCodeDataUrl}
              alt="QR Code Pix"
              className="w-full h-full object-contain"
            />
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-xs text-emerald-300/70 tracking-wider uppercase mb-1">
                Recebedor
              </p>
              <p className="text-sm text-emerald-100">{details.recipientName}</p>
              <p className="text-[11px] text-emerald-200/60 font-mono break-all">
                Chave: {details.pixKey}
              </p>
            </div>

            <div>
              <p className="text-xs text-emerald-300/70 tracking-wider uppercase mb-1">
                Pix copia e cola
              </p>
              <div className="flex gap-2 items-start">
                <textarea
                  readOnly
                  value={details.payload}
                  rows={3}
                  className="flex-1 text-[11px] font-mono bg-black/30 border border-emerald-500/20 rounded-md px-2 py-1.5 text-emerald-100 resize-none"
                />
                <button
                  type="button"
                  onClick={copyCode}
                  className="btn-gold text-xs px-3 py-2 whitespace-nowrap"
                >
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <ol className="text-sm text-emerald-100/80 space-y-1 list-decimal list-inside border-t border-emerald-500/15 pt-4">
          <li>Abra o app do seu banco e pague usando o QR code ou o código copia-e-cola.</li>
          <li>
            Salve o comprovante (print, foto ou PDF do banco, até 5MB) com{' '}
            <strong>valor, chave Pix e recebedor visíveis</strong>.
          </li>
          <li>Anexe abaixo — confirmamos sua inscrição automaticamente em segundos.</li>
        </ol>
      </section>

      <section className="card-glow space-y-4">
        <div>
          <p className="text-xs text-emerald-300/70 tracking-wider uppercase mb-2">
            Enviar comprovante
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED_TYPES.join(',')}
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-emerald-100 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-emerald-500/20 file:text-emerald-100 file:hover:bg-emerald-500/30 file:cursor-pointer"
          />
          {file && (
            <p className="text-[11px] text-emerald-200/60 mt-1">
              {file.name} · {(file.size / 1024).toFixed(0)} KB
            </p>
          )}
        </div>

        <button
          type="button"
          disabled={!file || submit.isPending}
          onClick={() => file && submit.mutate(file)}
          className="btn-gold text-base px-6 py-3 w-full sm:w-auto"
        >
          {submit.isPending ? 'Analisando comprovante...' : '🔍 Verificar e ativar'}
        </button>

        {submit.isPending && (
          <p className="text-xs text-emerald-200/60">
            A IA está conferindo o valor, a chave Pix e o recebedor. Leva ~10 segundos.
          </p>
        )}

        {verdict && lastStatus === 'auto_confirmed' && (
          <div className="card border-emerald-400/40 bg-emerald-500/10 text-emerald-100">
            <p className="font-semibold">✅ Pagamento confirmado!</p>
            <p className="text-sm text-emerald-100/80 mt-1">
              {verdict.reason} Redirecionando para o dashboard…
            </p>
          </div>
        )}

        {verdict && lastStatus === 'manual_review' && (
          <div className="card border-amber-400/40 bg-amber-500/10 text-amber-100">
            <p className="font-semibold">⏳ Em análise manual</p>
            <p className="text-sm text-amber-100/80 mt-1">{verdict.reason}</p>
            <p className="text-xs text-amber-100/60 mt-2">
              Avise o admin pelo WhatsApp ou tente um comprovante mais nítido.
            </p>
          </div>
        )}

        {verdict && lastStatus === 'rejected' && (
          <div className="card border-red-400/40 bg-red-500/10 text-red-100">
            <p className="font-semibold">❌ Comprovante recusado</p>
            <p className="text-sm text-red-100/80 mt-1">{verdict.reason}</p>
            {verdict.extracted.amountCents != null && (
              <p className="text-[11px] text-red-100/60 mt-2">
                Valor lido: {formatBRL(verdict.extracted.amountCents)} · esperado:{' '}
                {formatBRL(details.amountCents)}
              </p>
            )}
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={() => navigate('/pay')}
        className="text-xs text-emerald-200/60 hover:text-emerald-100 underline"
      >
        ← voltar para opções de pagamento
      </button>
    </div>
  );
}
