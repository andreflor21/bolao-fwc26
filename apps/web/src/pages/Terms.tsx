export function Terms() {
  return (
    <div className="max-w-2xl mx-auto space-y-5 text-emerald-100/85">
      <header>
        <p className="text-xs font-bold tracking-[0.4em] text-gold-400">LEGAL</p>
        <h1 className="font-display text-3xl tracking-wider text-white mt-1">
          Termos & Condições
        </h1>
        <p className="text-xs text-emerald-200/50 mt-1">Última atualização: junho de 2026</p>
      </header>

      <section className="space-y-3 text-sm leading-relaxed">
        <p>
          O <strong>Bolão da Turma — Copa 2026</strong> é uma brincadeira recreativa entre amigos
          sobre a Copa do Mundo FIFA 2026. Ao se inscrever, você concorda com estes termos.
        </p>

        <h2 className="text-gold-200 font-semibold text-base pt-2">Inscrição e pagamento</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            A inscrição custa <strong>R$ 50,00</strong> mais a <strong>taxa de processamento</strong>{' '}
            da operadora de pagamento; o valor da inscrição compõe o bolo de prêmios.
          </li>
          <li>O pagamento é processado pela Stripe (cartão, Link ou boleto).</li>
          <li>
            Reembolso disponível até o início da competição (antes do travamento dos palpites);
            após o travamento, a inscrição não é reembolsável.
          </li>
        </ul>

        <h2 className="text-gold-200 font-semibold text-base pt-2">Palpites e pontuação</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Os palpites travam no apito do 1º jogo e não podem ser editados depois.</li>
          <li>A pontuação segue as regras exibidas no app e é a mesma para todos.</li>
          <li>Os prêmios são distribuídos conforme o ranking final, ao encerramento.</li>
        </ul>

        <h2 className="text-gold-200 font-semibold text-base pt-2">Conduta e responsabilidade</h2>
        <p>
          É uma brincadeira entre amigos: jogue de forma justa. O organizador não se
          responsabiliza por indisponibilidades de terceiros (provedores de pagamento, e-mail) nem
          por mudanças no calendário oficial da competição.
        </p>

        <h2 className="text-gold-200 font-semibold text-base pt-2">Contato</h2>
        <p>
          Dúvidas sobre os termos, pagamentos ou reembolsos:{' '}
          <a className="link-accent" href="mailto:contato@af-solutions.dev">
            contato@af-solutions.dev
          </a>
          .
        </p>
      </section>
    </div>
  );
}
