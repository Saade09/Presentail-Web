import React, { useState } from 'react';
import { Lock, ShieldCheck, Check, ChevronDown, ChevronRight, Edit2, CreditCard } from 'lucide-react';

export default function CardAccordionCheckout() {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  const handleContinue = (step: number) => {
    setCompletedSteps((prev) => [...new Set([...prev, step])]);
    setActiveStep(step + 1);
  };

  const isStepCompleted = (step: number) => completedSteps.includes(step);
  const isStepActive = (step: number) => activeStep === step;
  const isStepUpcoming = (step: number) => !isStepActive(step) && !isStepCompleted(step);

  return (
    <div className="min-h-screen bg-[#f5f5f5] font-sans text-slate-900 pb-20">
      <div className="max-w-5xl mx-auto px-4 pt-12 md:pt-16">
        <h1 className="text-2xl font-semibold mb-8">Checkout</h1>
        
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left Column: Form Steps */}
          <div className="flex-1 space-y-4">
            
            {/* Step 1: Recipient Details */}
            <div className={`bg-white rounded-xl shadow-sm border ${isStepActive(1) ? 'border-slate-300 ring-4 ring-slate-100' : 'border-slate-200'} transition-all duration-300 overflow-hidden`}>
              <button 
                onClick={() => isStepCompleted(1) && setActiveStep(1)}
                className={`w-full px-6 py-5 flex items-center justify-between text-left ${!isStepActive(1) && isStepCompleted(1) ? 'cursor-pointer hover:bg-slate-50' : 'cursor-default'}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold
                    ${isStepCompleted(1) && !isStepActive(1) ? 'bg-green-100 text-green-700' : 
                      isStepActive(1) ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'}`}>
                    {isStepCompleted(1) && !isStepActive(1) ? <Check className="w-4 h-4" /> : '1'}
                  </div>
                  <div>
                    <h2 className={`font-semibold text-lg ${isStepUpcoming(1) ? 'text-slate-400' : 'text-slate-900'}`}>Recipient details</h2>
                    {isStepCompleted(1) && !isStepActive(1) && (
                      <p className="text-sm text-slate-500 mt-0.5">Jane Doe, Beirut, +961 71 123456</p>
                    )}
                  </div>
                </div>
                {isStepCompleted(1) && !isStepActive(1) && (
                  <span className="text-sm font-medium text-blue-600 hover:text-blue-700">Edit</span>
                )}
              </button>
              
              {isStepActive(1) && (
                <div className="px-6 pb-6 pt-2 animate-in slide-in-from-top-4 fade-in duration-300">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">First name</label>
                      <input type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none" defaultValue="Jane" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Last name</label>
                      <input type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none" defaultValue="Doe" />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Phone number</label>
                      <input type="tel" className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none" defaultValue="+961 71 123456" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">District</label>
                      <select className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none bg-white">
                        <option>Beirut</option>
                        <option>Mount Lebanon</option>
                        <option>North</option>
                        <option>South</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Full address</label>
                    <textarea className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none" rows={2} defaultValue="Hamra Street, Building 4, Floor 2" />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Delivery date</label>
                      <input type="date" className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none" defaultValue="2024-06-15" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Time slot</label>
                      <select className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none bg-white">
                        <option>Morning (9 AM - 1 PM)</option>
                        <option>Afternoon (1 PM - 5 PM)</option>
                        <option>Evening (5 PM - 9 PM)</option>
                      </select>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => handleContinue(1)}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    Continue to Sender Details <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Step 2: Sender Details */}
            <div className={`bg-white rounded-xl shadow-sm border ${isStepActive(2) ? 'border-slate-300 ring-4 ring-slate-100' : 'border-slate-200'} transition-all duration-300 overflow-hidden`}>
              <button 
                onClick={() => isStepCompleted(2) && setActiveStep(2)}
                className={`w-full px-6 py-5 flex items-center justify-between text-left ${(isStepCompleted(2) && !isStepActive(2)) || (isStepCompleted(1) && !isStepActive(2)) ? 'cursor-pointer hover:bg-slate-50' : 'cursor-default'}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold
                    ${isStepCompleted(2) && !isStepActive(2) ? 'bg-green-100 text-green-700' : 
                      isStepActive(2) ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'}`}>
                    {isStepCompleted(2) && !isStepActive(2) ? <Check className="w-4 h-4" /> : '2'}
                  </div>
                  <div>
                    <h2 className={`font-semibold text-lg ${isStepUpcoming(2) ? 'text-slate-400' : 'text-slate-900'}`}>Sender details</h2>
                    {isStepCompleted(2) && !isStepActive(2) && (
                      <p className="text-sm text-slate-500 mt-0.5">John Smith, john@example.com</p>
                    )}
                  </div>
                </div>
                {isStepCompleted(2) && !isStepActive(2) && (
                  <span className="text-sm font-medium text-blue-600 hover:text-blue-700">Edit</span>
                )}
              </button>
              
              {isStepActive(2) && (
                <div className="px-6 pb-6 pt-2 animate-in slide-in-from-top-4 fade-in duration-300">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">First name</label>
                      <input type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none" defaultValue="John" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Last name</label>
                      <input type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none" defaultValue="Smith" />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Email address</label>
                      <input type="email" className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none" defaultValue="john@example.com" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Phone number</label>
                      <input type="tel" className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none" defaultValue="+1 234 567 8900" />
                    </div>
                  </div>
                  
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Card message <span className="text-slate-400 font-normal">(Optional)</span></label>
                    <textarea className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none" rows={3} placeholder="Write a special message for the recipient..." defaultValue="Happy Birthday! Wishing you all the best." />
                  </div>
                  
                  <button 
                    onClick={() => handleContinue(2)}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    Continue to Payment <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Step 3: Payment Method */}
            <div className={`bg-white rounded-xl shadow-sm border ${isStepActive(3) ? 'border-slate-300 ring-4 ring-slate-100' : 'border-slate-200'} transition-all duration-300 overflow-hidden`}>
              <button 
                onClick={() => isStepCompleted(3) && setActiveStep(3)}
                className={`w-full px-6 py-5 flex items-center justify-between text-left ${(isStepCompleted(3) && !isStepActive(3)) || (isStepCompleted(2) && !isStepActive(3)) ? 'cursor-pointer hover:bg-slate-50' : 'cursor-default'}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold
                    ${isStepCompleted(3) && !isStepActive(3) ? 'bg-green-100 text-green-700' : 
                      isStepActive(3) ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'}`}>
                    {isStepCompleted(3) && !isStepActive(3) ? <Check className="w-4 h-4" /> : '3'}
                  </div>
                  <div>
                    <h2 className={`font-semibold text-lg ${isStepUpcoming(3) ? 'text-slate-400' : 'text-slate-900'}`}>Payment method</h2>
                  </div>
                </div>
              </button>
              
              {isStepActive(3) && (
                <div className="px-6 pb-6 pt-2 animate-in slide-in-from-top-4 fade-in duration-300">
                  <div className="space-y-3 mb-6">
                    <label className="flex items-center justify-between p-4 border border-slate-900 rounded-lg bg-slate-50 cursor-pointer ring-1 ring-slate-900">
                      <div className="flex items-center gap-3">
                        <input type="radio" name="payment" className="w-4 h-4 text-slate-900 focus:ring-slate-900" defaultChecked />
                        <span className="font-medium text-slate-900">Credit / Debit Card</span>
                      </div>
                      <CreditCard className="w-5 h-5 text-slate-600" />
                    </label>
                    
                    <label className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:border-slate-300 cursor-pointer">
                      <div className="flex items-center gap-3">
                        <input type="radio" name="payment" className="w-4 h-4 text-slate-900 focus:ring-slate-900" />
                        <span className="font-medium text-slate-700">PayPal</span>
                      </div>
                    </label>
                    
                    <label className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:border-slate-300 cursor-pointer">
                      <div className="flex items-center gap-3">
                        <input type="radio" name="payment" className="w-4 h-4 text-slate-900 focus:ring-slate-900" />
                        <span className="font-medium text-slate-700">Whish Money</span>
                      </div>
                    </label>
                    
                    <label className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:border-slate-300 cursor-pointer">
                      <div className="flex items-center gap-3">
                        <input type="radio" name="payment" className="w-4 h-4 text-slate-900 focus:ring-slate-900" />
                        <span className="font-medium text-slate-700">Western Union</span>
                      </div>
                    </label>
                  </div>
                  
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Card number</label>
                        <input type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none" placeholder="0000 0000 0000 0000" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Expiry date</label>
                          <input type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none" placeholder="MM/YY" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">CVC</label>
                          <input type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none" placeholder="123" />
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <button className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-4 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-lg shadow-sm">
                    <Lock className="w-4 h-4" /> Pay $94.00
                  </button>
                </div>
              )}
            </div>

          </div>

          {/* Right Column: Order Summary */}
          <div className="w-full lg:w-96 shrink-0">
            <div className="sticky top-8">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6">
                  <h2 className="text-lg font-semibold mb-4">Order Summary</h2>
                  
                  {/* Items */}
                  <div className="space-y-4 mb-6">
                    <div className="flex gap-4">
                      <div className="w-16 h-16 bg-slate-100 rounded-lg overflow-hidden flex items-center justify-center shrink-0">
                        <img src="/__mockup/images/bloom-eternal.png" alt="Bloom Eternal — Rose Bouquet" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = 'https://placehold.co/100x100?text=Rose' }} />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-medium text-slate-900 leading-tight">Bloom Eternal — Rose Bouquet</h3>
                        <p className="text-sm text-slate-500 mt-1">Qty: 1</p>
                      </div>
                      <div className="text-sm font-medium text-slate-900">
                        $89.00
                      </div>
                    </div>
                  </div>
                  
                  <div className="border-t border-slate-100 pt-4 space-y-3 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Subtotal</span>
                      <span className="text-slate-900 font-medium">$89.00</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Delivery fee</span>
                      <span className="text-slate-900 font-medium">$5.00</span>
                    </div>
                  </div>
                  
                  <div className="border-t border-slate-200 pt-4 mb-6">
                    <div className="flex justify-between items-center">
                      <span className="text-base font-semibold text-slate-900">Total</span>
                      <span className="text-xl font-bold text-slate-900">$94.00</span>
                    </div>
                  </div>
                  
                  <div className="bg-slate-50 rounded-lg p-4 mb-6 flex items-start gap-3 border border-slate-100">
                    <ShieldCheck className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-slate-900">30-day freshness guarantee</p>
                      <p className="text-xs text-slate-500 mt-1">If your flowers aren't perfectly fresh, we'll replace them for free.</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-center gap-2 text-xs font-medium text-slate-500 uppercase tracking-wider mb-4">
                    <Lock className="w-3 h-3" /> Secure Checkout
                  </div>
                  
                  <div className="flex items-center justify-center gap-2">
                     <div className="h-6 w-10 bg-slate-100 rounded border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500">VISA</div>
                     <div className="h-6 w-10 bg-slate-100 rounded border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500">MC</div>
                     <div className="h-6 w-10 bg-slate-100 rounded border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500">AMEX</div>
                     <div className="h-6 w-10 bg-slate-100 rounded border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500">PAYPAL</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
