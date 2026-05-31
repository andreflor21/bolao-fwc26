export function Privacy() {
  return (
    <div className="max-w-2xl mx-auto prose-legal space-y-5 text-emerald-100/85">
      <header>
        <p className="text-xs font-bold tracking-[0.4em] text-gold-400">LEGAL</p>
        <h1 className="font-display text-3xl tracking-wider text-white mt-1">
          Política de Privacidade
        </h1>
        <p className="text-xs text-emerald-200/50 mt-1">Última atualização: junho de 2026</p>
      </header>

      <section className="space-y-3 text-sm leading-relaxed">
        <p>
          Esta política descreve como o <strong>Bolão da Turma — Copa 2026</strong> trata seus
          dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (LGPD, Lei
          13.709/2018). É um bolão recreativo entre amigos, sem fins lucrativos.
        </p>

        <h2 className="text-gold-200 font-semibold text-base pt-2">Dados que coletamos</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Cadastro:</strong> nome e e-mail.</li>
          <li><strong>Opcional:</strong> número de WhatsApp (se você optar por informar).</li>
          <li><strong>Palpites e pontuação</strong> gerados pelo seu uso do app.</li>
          <li>
            <strong>Pagamento:</strong> processado pela <strong>Stripe</strong>; não armazenamos
            dados de cartão — eles ficam apenas com a Stripe.
          </li>
        </ul>

        <h2 className="text-gold-200 font-semibold text-base pt-2">Como usamos</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Operar o bolão (inscrição, palpites, ranking, prêmios).</li>
          <li>Enviar e-mails transacionais (boas-vindas, confirmação, prêmios) e notificações.</li>
          <li>
            Se você autorizar, incluir você no grupo de WhatsApp do bolão usando o número
            informado.
          </li>
        </ul>

        <h2 className="text-gold-200 font-semibold text-base pt-2">Compartilhamento</h2>
        <p>
          Compartilhamos dados apenas com operadores necessários ao serviço:
          <strong> Stripe</strong> (pagamento) e provedor de e-mail. Não vendemos nem cedemos seus
          dados para terceiros com fins de marketing.
        </p>

        <h2 className="text-gold-200 font-semibold text-base pt-2">Seus direitos (LGPD)</h2>
        <p>
          Você pode solicitar acesso, correção ou exclusão dos seus dados, e revogar
          consentimentos (como o do WhatsApp) a qualquer momento, pelo contato abaixo.
        </p>

        <h2 className="text-gold-200 font-semibold text-base pt-2">Contato</h2>
        <p>Dúvidas sobre privacidade: fale com o organizador do bolão.</p>
      </section>
    </div>
  );
}
