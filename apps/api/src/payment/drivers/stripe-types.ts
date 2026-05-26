// Localized deep import so the rest of the codebase doesn't reach into Stripe's
// CJS internals. The default `import Stripe from 'stripe'` only exposes the
// constructor and class type — not the rich namespace with PaymentIntent etc.
// which lives in stripe.core.d.ts.
export type { Stripe as StripeApi } from 'stripe/cjs/stripe.core.js';
