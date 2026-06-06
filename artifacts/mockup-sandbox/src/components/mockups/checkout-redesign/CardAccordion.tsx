import React, { useState } from 'react';
import { Lock, ShieldCheck, Check, ChevronRight, CreditCard } from 'lucide-react';

const BRAND = '#0d2b1e';
const BRAND_LIGHT = '#e8f0ec';

export default function CardAccordionCheckout() {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

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

              if (upcoming) return null; // hide steps not yet reached

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
                  <div className="px-6 py-5 flex items-center gap-4 border-b border-slate-100">
                    <div
                      className="flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold text-white shrink-0"
                      style={{ background: BRAND }}
                    >
                      {n}
                    </div>
                    <h2 className="font-semibold text-lg text-slate-900">{label}</h2>
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
                        {[
                          { id: 'card',    label: 'Credit / Debit Card', icon: <CreditCard className="w-4 h-4 text-slate-500" /> },
                          { id: 'paypal',  label: 'PayPal',              icon: null },
                          { id: 'whish',   label: 'Whish Money',         icon: null },
                          { id: 'western', label: 'Western Union',       icon: null },
                        ].map(({ id, label, icon }, i) => (
                          <label
                            key={id}
                            className="flex items-center justify-between px-4 py-3.5 border rounded-xl cursor-pointer transition-colors"
                            style={i === 0 ? { borderColor: BRAND, background: BRAND_LIGHT } : { borderColor: '#e2e8f0' }}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="radio"
                                name="payment"
                                defaultChecked={i === 0}
                                className="w-4 h-4"
                                style={{ accentColor: BRAND }}
                              />
                              <span className="text-sm font-medium text-slate-900">{label}</span>
                            </div>
                            {icon}
                          </label>
                        ))}
                      </div>

                      {/* Card fields */}
                      <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50">
                        <Field label="Card number"><input type="text" placeholder="0000 0000 0000 0000" /></Field>
                        <div className="grid grid-cols-2 gap-3">
                          <Field label="Expiry date"><input type="text" placeholder="MM/YY" /></Field>
                          <Field label="CVC"><input type="text" placeholder="123" /></Field>
                        </div>
                      </div>

                      {/* Pay button */}
                      <button
                        className="w-full py-4 rounded-xl text-white font-semibold text-base flex items-center justify-center gap-2 transition-opacity hover:opacity-90 shadow-md"
                        style={{ background: BRAND }}
                      >
                        <Lock className="w-4 h-4" /> Pay $94.00
                      </button>
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
