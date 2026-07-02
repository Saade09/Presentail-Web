import React, { useState } from 'react';
import { Lock, ShieldCheck, Check, ChevronRight, CreditCard } from 'lucide-react';

const BRAND = '#0d2b1e';
const BRAND_LIGHT = '#e8f0ec';

const PAYMENT_OPTIONS = [
  {
    id: 'apple',
    label: 'Apple Pay',
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-label="Apple Pay">
        <path d="M17.05 12.536c-.03-2.72 2.226-4.044 2.328-4.107-1.272-1.858-3.25-2.112-3.948-2.136-1.672-.171-3.284.991-4.136.991-.862 0-2.17-.972-3.577-.945-1.827.027-3.522 1.07-4.462 2.7-1.91 3.31-.487 8.2 1.37 10.884.918 1.313 2.004 2.784 3.432 2.73 1.385-.055 1.906-.887 3.577-.887 1.66 0 2.143.887 3.593.858 1.49-.028 2.43-1.336 3.334-2.655.654-.946 1.159-1.97 1.463-3.06-.038-.016-2.974-1.138-3.004-4.373zM14.28 4.524C15.015 3.636 15.516 2.42 15.374 1.2c-1.042.042-2.305.695-3.054 1.58-.672.778-1.26 2.024-1.102 3.213 1.162.09 2.35-.593 3.062-1.469z" />
      </svg>
    ),
  },
  {
    id: 'google',
    label: 'Google Pay',
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" aria-label="Google Pay">
        <text y="18" fontSize="10" fontWeight="bold" fill="#4285F4">G</text>
        <text x="8" y="18" fontSize="10" fontWeight="bold" fill="#EA4335">o</text>
        <text x="14" y="18" fontSize="10" fontWeight="bold" fill="#FBBC05">o</text>
        <text x="20" y="18" fontSize="10" fontWeight="bold" fill="#34A853">g</text>
      </svg>
    ),
  },
  {
    id: 'card',
    label: 'Credit / Debit Card',
    icon: <CreditCard className="w-4 h-4 text-slate-500" />,
  },
  {
    id: 'paypal',
    label: 'PayPal',
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#003087" aria-label="PayPal">
        <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 0 0-.607-.541c-.013.076-.026.175-.041.254-.59 3.025-2.568 4.571-5.72 4.571H12.66c-.524 0-.968.382-1.05.9l-1.123 7.118-.314 1.987a.4.4 0 0 0 .394.46h3.282c.46 0 .85-.334.922-.788l.038-.197.733-4.648.047-.256c.073-.454.463-.788.922-.788h.58c3.762 0 6.703-1.528 7.563-5.948.36-1.847.174-3.388-.712-4.474z" />
      </svg>
    ),
  },
  {
    id: 'whish',
    label: 'Whish Money',
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#e31837" aria-label="Whish Money">
        <circle cx="12" cy="12" r="10" />
        <text x="12" y="16" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">W</text>
      </svg>
    ),
  },
];

function PayCta({ payMethod }: { payMethod: string }) {
  if (payMethod === 'apple') {
    return (
      <button className="w-full py-4 rounded-xl text-white font-semibold text-base flex items-center justify-center gap-2 transition-opacity hover:opacity-90 shadow-md bg-black">
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="white">
          <path d="M17.05 12.536c-.03-2.72 2.226-4.044 2.328-4.107-1.272-1.858-3.25-2.112-3.948-2.136-1.672-.171-3.284.991-4.136.991-.862 0-2.17-.972-3.577-.945-1.827.027-3.522 1.07-4.462 2.7-1.91 3.31-.487 8.2 1.37 10.884.918 1.313 2.004 2.784 3.432 2.73 1.385-.055 1.906-.887 3.577-.887 1.66 0 2.143.887 3.593.858 1.49-.028 2.43-1.336 3.334-2.655.654-.946 1.159-1.97 1.463-3.06-.038-.016-2.974-1.138-3.004-4.373zM14.28 4.524C15.015 3.636 15.516 2.42 15.374 1.2c-1.042.042-2.305.695-3.054 1.58-.672.778-1.26 2.024-1.102 3.213 1.162.09 2.35-.593 3.062-1.469z" />
        </svg>
        Pay with Apple Pay
      </button>
    );
  }

  if (payMethod === 'google') {
    return (
      <button className="w-full py-4 rounded-xl font-semibold text-base flex items-center justify-center gap-2 transition-opacity hover:opacity-90 shadow-md border border-slate-200 bg-white text-slate-800">
        <svg viewBox="0 0 48 48" className="w-5 h-5">
          <path fill="#4285F4" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#34A853" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#EA4335" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
        Pay with Google Pay
      </button>
    );
  }

  if (payMethod === 'paypal') {
    return (
      <button className="w-full py-4 rounded-xl font-semibold text-base flex items-center justify-center gap-2 transition-opacity hover:opacity-90 shadow-md text-white" style={{ background: '#003087' }}>
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="white">
          <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 0 0-.607-.541c-.013.076-.026.175-.041.254-.59 3.025-2.568 4.571-5.72 4.571H12.66c-.524 0-.968.382-1.05.9l-1.123 7.118-.314 1.987a.4.4 0 0 0 .394.46h3.282c.46 0 .85-.334.922-.788l.038-.197.733-4.648.047-.256c.073-.454.463-.788.922-.788h.58c3.762 0 6.703-1.528 7.563-5.948.36-1.847.174-3.388-.712-4.474z" />
        </svg>
        Continue with PayPal
      </button>
    );
  }

  if (payMethod === 'whish') {
    return (
      <button className="w-full py-4 rounded-xl font-semibold text-base flex items-center justify-center gap-2 transition-opacity hover:opacity-90 shadow-md text-white" style={{ background: '#e31837' }}>
        Pay with Whish Money
      </button>
    );
  }

  return (
    <button
      className="w-full py-4 rounded-xl text-white font-semibold text-base flex items-center justify-center gap-2 transition-opacity hover:opacity-90 shadow-md"
      style={{ background: BRAND }}
    >
      <Lock className="w-4 h-4" /> Pay $94.00
    </button>
  );
}

export default function CardAccordionCheckout() {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [payMethod, setPayMethod] = useState<string>('card');

  const handleContinue = (step: number) => {
    setCompletedSteps((prev) => [...new Set([...prev, step])]);
    setActiveStep(step + 1);
  };

  const isCompleted = (step: number) => completedSteps.includes(step);
  const isActive = (step: number) => activeStep === step;

  const stepDefs = [
    { n: 1, label: 'Recipient details', summary: 'Jane Doe · Beirut · +961 71 123456' },
    { n: 2, label: 'Sender details',    summary: 'John Smith · john@example.com' },
    { n: 3, label: 'Payment',           summary: '' },
  ];

  return (
    <div className="min-h-screen bg-[#f5f5f5] font-sans text-slate-900 pb-20">
      <div className="max-w-5xl mx-auto px-4 pt-12 md:pt-16">

        {/* Page heading + step counter */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>
          <span className="text-sm text-slate-500">Step {Math.min(activeStep, 3)} of 3</span>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">

          {/* ── Left: form steps ── */}
          <div className="flex-1 space-y-3">

            {stepDefs.map(({ n, label, summary }) => {
              const done = isCompleted(n);
              const active = isActive(n);
              const upcoming = !done && !active;

              if (upcoming) return null;

              /* Completed step — compact summary row */
              if (done && !active) {
                return (
                  <div
                    key={n}
                    className="bg-white rounded-xl border border-slate-200 shadow-sm"
                  >
                    <button
                      onClick={() => setActiveStep(n)}
                      className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors rounded-xl"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className="flex items-center justify-center w-8 h-8 rounded-full"
                          style={{ background: BRAND_LIGHT }}
                        >
                          <Check className="w-4 h-4" style={{ color: BRAND }} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{label}</p>
                          <p className="text-sm text-slate-500 mt-0.5">{summary}</p>
                        </div>
                      </div>
                      <span className="text-sm font-medium" style={{ color: BRAND }}>Edit</span>
                    </button>
                  </div>
                );
              }

              /* Active step — full form card */
              return (
                <div
                  key={n}
                  className="bg-white rounded-xl shadow-sm border-2 overflow-hidden"
                  style={{ borderColor: BRAND }}
                >
                  {/* Card header */}
                  <div className="px-6 py-5 flex items-center justify-between border-b border-slate-100">
                    <h2 className="font-semibold text-lg text-slate-900">{label}</h2>
                    <div
                      className="flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold text-white shrink-0"
                      style={{ background: BRAND }}
                    >
                      {n}
                    </div>
                  </div>

                  {/* Step 1 form */}
                  {n === 1 && (
                    <div className="px-6 pb-6 pt-5 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="First name"><input type="text" defaultValue="Jane" /></Field>
                        <Field label="Last name"><input type="text" defaultValue="Doe" /></Field>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Phone number"><input type="tel" defaultValue="+961 71 123456" /></Field>
                        <Field label="District">
                          <select className="w-full h-10 border border-slate-300 rounded-lg px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:border-transparent" style={{'--tw-ring-color': BRAND} as any}>
                            <option>Beirut</option>
                            <option>Mount Lebanon</option>
                            <option>North</option>
                            <option>South</option>
                          </select>
                        </Field>
                      </div>
                      <Field label="Full address">
                        <textarea className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent resize-none" rows={2} defaultValue="Hamra Street, Building 4, Floor 2" style={{'--tw-ring-color': BRAND} as any} />
                      </Field>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Delivery date"><input type="date" defaultValue="2024-06-15" /></Field>
                        <Field label="Time slot">
                          <select className="w-full h-10 border border-slate-300 rounded-lg px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:border-transparent" style={{'--tw-ring-color': BRAND} as any}>
                            <option>Morning (9 AM – 1 PM)</option>
                            <option>Afternoon (1 PM – 5 PM)</option>
                            <option>Evening (5 PM – 9 PM)</option>
                          </select>
                        </Field>
                      </div>
                      <ContinueBtn onClick={() => handleContinue(1)} label="Continue to Sender" />
                    </div>
                  )}

                  {/* Step 2 form */}
                  {n === 2 && (
                    <div className="px-6 pb-6 pt-5 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="First name"><input type="text" defaultValue="John" /></Field>
                        <Field label="Last name"><input type="text" defaultValue="Smith" /></Field>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Email address"><input type="email" defaultValue="john@example.com" /></Field>
                        <Field label="Phone number"><input type="tel" defaultValue="+1 234 567 8900" /></Field>
                      </div>
                      <Field label={<>Card message <span className="font-normal text-slate-400">(optional)</span></>}>
                        <textarea className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent resize-none" rows={3} defaultValue="Happy Birthday! Wishing you all the best." style={{'--tw-ring-color': BRAND} as any} />
                      </Field>
                      <ContinueBtn onClick={() => handleContinue(2)} label="Continue to Payment" />
                    </div>
                  )}

                  {/* Step 3 form */}
                  {n === 3 && (
                    <div className="px-6 pb-6 pt-5 space-y-4">
                      {/* Payment options */}
                      <div className="space-y-2">
                        {PAYMENT_OPTIONS.map(({ id, label, icon }) => {
                          const selected = payMethod === id;
                          return (
                            <label
                              key={id}
                              className="flex items-center justify-between px-4 py-3.5 border rounded-xl cursor-pointer transition-colors"
                              style={selected ? { borderColor: BRAND, background: BRAND_LIGHT } : { borderColor: '#e2e8f0' }}
                            >
                              <div className="flex items-center gap-3">
                                <input
                                  type="radio"
                                  name="payment"
                                  value={id}
                                  checked={selected}
                                  onChange={() => setPayMethod(id)}
                                  className="w-4 h-4"
                                  style={{ accentColor: BRAND }}
                                />
                                <span className="text-sm font-medium text-slate-900">{label}</span>
                              </div>
                              {icon}
                            </label>
                          );
                        })}
                      </div>

                      {/* Card fields — only shown when credit/debit card is selected */}
                      {payMethod === 'card' && (
                        <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50">
                          <Field label="Card number"><input type="text" placeholder="0000 0000 0000 0000" /></Field>
                          <div className="grid grid-cols-2 gap-3">
                            <Field label="Expiry date"><input type="text" placeholder="MM/YY" /></Field>
                            <Field label="CVC"><input type="text" placeholder="123" /></Field>
                          </div>
                        </div>
                      )}

                      {/* Pay button — adapts per payment method */}
                      <PayCta payMethod={payMethod} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Right: order summary ── */}
          <div className="w-full lg:w-80 shrink-0">
            <div className="sticky top-8 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {/* Summary header */}
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-base font-semibold text-slate-900">Order Summary</h2>
              </div>

              <div className="px-5 py-4 space-y-4">
                {/* Product */}
                <div className="flex gap-3">
                  <div className="w-14 h-14 rounded-lg overflow-hidden bg-slate-100 shrink-0">
                    <img
                      src="/__mockup/images/bloom-eternal.png"
                      alt="Bloom Eternal"
                      className="w-full h-full object-cover"
                      onError={(e) => { e.currentTarget.src = 'https://placehold.co/56x56/0d2b1e/ffffff?text=🌹'; }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 leading-snug">Bloom Eternal — Rose Bouquet</p>
                    <p className="text-xs text-slate-400 mt-0.5">Qty: 1</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 shrink-0">$89.00</p>
                </div>

                {/* Line items */}
                <div className="border-t border-slate-100 pt-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Subtotal</span>
                    <span className="font-medium">$89.00</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Delivery</span>
                    <span className="font-medium">$5.00</span>
                  </div>
                </div>

                {/* Total */}
                <div className="border-t border-slate-200 pt-3">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-slate-900">Total</span>
                    <span className="text-xl font-bold" style={{ color: BRAND }}>$94.00</span>
                  </div>
                </div>

                {/* Freshness guarantee */}
                <div className="rounded-lg p-3 flex items-start gap-2.5" style={{ background: BRAND_LIGHT }}>
                  <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" style={{ color: BRAND }} />
                  <div>
                    <p className="text-xs font-semibold text-slate-900">30-day freshness guarantee</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-snug">Not fresh? We'll replace it for free.</p>
                  </div>
                </div>

                {/* Secure checkout */}
                <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
                  <Lock className="w-3 h-3" />
                  <span>Secure checkout</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

/* ── Helpers ── */

function Field({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
        {label}
      </label>
      {React.cloneElement(children, {
        className: [
          'w-full h-10 border border-slate-300 rounded-lg px-3 text-sm',
          'focus:outline-none focus:ring-2 focus:border-transparent',
          children.props.className ?? '',
        ].join(' '),
        style: { '--tw-ring-color': BRAND, ...children.props.style } as React.CSSProperties,
      })}
    </div>
  );
}

function ContinueBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="w-full py-3 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 transition-opacity hover:opacity-90 mt-2"
      style={{ background: BRAND }}
    >
      {label} <ChevronRight className="w-4 h-4" />
    </button>
  );
}
