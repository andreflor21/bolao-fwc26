import { Link } from 'react-router-dom';

export function PaymentCancel() {
  return (
    <div className="max-w-xl mx-auto">
      <div className="card-glow space-y-3">
        <p className="text-xs font-bold tracking-[0.4em] text-gold-400">PAGAMENTO INTERROMPIDO</p>
        <h1 className="font-display text-2xl tracking-wider text-white">
          <span className="text-shimmer">CHECKOUT CANCELADO</span>
        </h1>
        <p className="text-sm text-emerald-100/80">
          Você cancelou o pagamento. Sua inscrição continua{' '}
          <strong>pendente</strong> — você pode tentar de novo a qualquer momento.
        </p>
        <div className="flex gap-2 pt-2">
          <Link to="/pay" className="btn-gold text-sm">
            Tentar de novo
          </Link>
          <Link to="/dashboard" className="btn-secondary text-sm">
            Voltar ao dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
