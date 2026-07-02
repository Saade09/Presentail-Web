import React, { useState } from 'react';
import { Check } from 'lucide-react';

export default function SplitPanelCheckout() {
  const [step, setStep] = useState(1);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap');
        
        .font-serif {
          font-family: 'Cormorant Garamond', serif;
        }
        .font-sans {
          font-family: 'Inter', sans-serif;
        }
        
        .luxury-input {
          width: 100%;
          background: transparent;
          border: none;
          border-bottom: 1px solid #d1d1d1;
          padding: 0.75rem 0;
          font-family: 'Inter', sans-serif;
          font-size: 0.875rem;
          color: #1a1a1a;
          outline: none;
          transition: border-color 0.2s ease;
        }
        
        .luxury-input:focus {
          border-bottom-color: #0d2b1e;
        }
        
        .luxury-input::placeholder {
          color: #a3a3a3;
        }

        .luxury-select {
          width: 100%;
          background: transparent;
          border: none;
          border-bottom: 1px solid #d1d1d1;
          padding: 0.75rem 0;
          font-family: 'Inter', sans-serif;
          font-size: 0.875rem;
          color: #1a1a1a;
          outline: none;
          appearance: none;
          border-radius: 0;
        }
        
        .payment-radio {
          display: flex;
          align-items: center;
          padding: 1rem;
          border: 1px solid #d1d1d1;
          border-radius: 4px;
          margin-bottom: 1rem;
          cursor: pointer;
        }
        .payment-radio input {
          margin-right: 1rem;
        }
      ` }} />
      <div className="flex h-[100dvh] w-full overflow-hidden font-sans text-gray-900 bg-[#fdfcf8]">
        {/* Left Panel - Order Summary */}
        <div className="w-[38%] bg-[#0d2b1e] text-[#fdfcf8] p-12 lg:p-16 flex flex-col justify-between shrink-0 h-full overflow-y-auto">
          <div>
            <h1 className="font-serif text-3xl tracking-widest text-[#e8dcb8] mb-16 uppercase">PRESENTAIL</h1>
            
            <h2 className="font-serif text-2xl mb-8 text-[#fdfcf8]">Order Summary</h2>
            
            <div className="flex items-center gap-6 mb-8 border-b border-white/10 pb-8">
              <div className="w-20 h-24 bg-black/40 overflow-hidden relative shrink-0">
                <img 
                  src="/__mockup/images/bloom-eternal.png" 
                  alt="Bloom Eternal — Rose Bouquet"
                  className="w-full h-full object-cover opacity-90"
                />
              </div>
              <div className="flex-1">
                <h3 className="font-serif text-xl mb-1 text-[#fdfcf8]">Bloom Eternal</h3>
                <p className="text-white/60 text-sm mb-2">Rose Bouquet</p>
                <p className="text-[#e8dcb8] font-medium">$89.00</p>
              </div>
            </div>
            
            <div className="space-y-4 text-sm text-white/80">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>$89.00</span>
              </div>
              <div className="flex justify-between">
                <span>Delivery</span>
                <span>$5.00</span>
              </div>
            </div>
            
            <div className="flex justify-between mt-8 pt-8 border-t border-white/10 font-serif text-2xl text-[#fdfcf8]">
              <span>Total</span>
              <span>$94.00</span>
            </div>
          </div>
          
          <div className="text-xs text-white/40 mt-12">
            <p>Secure Checkout. All transactions are encrypted.</p>
          </div>
        </div>

        {/* Right Panel - Form */}
        <div className="w-[62%] bg-[#fdfcf8] h-full overflow-y-auto relative">
          <div className="max-w-2xl mx-auto py-16 px-12">
            
            {/* Step Indicators */}
            <div className="flex items-center mb-16">
              {/* Step 1 */}
              <div className="flex flex-row items-center bg-[#fdfcf8] pr-2 gap-2 shrink-0">
                <span className={`text-xs font-medium ${step >= 1 ? 'text-[#0d2b1e]' : 'text-gray-400'}`}>Recipient</span>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors shrink-0 ${step >= 1 ? 'bg-[#0d2b1e] text-[#fdfcf8]' : 'bg-gray-100 text-gray-400'}`}>
                  {step > 1 ? <Check size={16} /> : "1"}
                </div>
              </div>

              {/* Connector 1→2 */}
              <div className="flex-1 h-[1px] bg-gray-200 overflow-hidden">
                <div className={`h-full bg-[#0d2b1e] transition-all duration-500 ${step > 1 ? 'w-full' : 'w-0'}`} />
              </div>

              {/* Step 2 */}
              <div className="flex flex-row items-center bg-[#fdfcf8] px-2 gap-2 shrink-0">
                <span className={`text-xs font-medium ${step >= 2 ? 'text-[#0d2b1e]' : 'text-gray-400'}`}>Sender</span>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors shrink-0 ${step >= 2 ? 'bg-[#0d2b1e] text-[#fdfcf8]' : 'bg-gray-100 text-gray-400'}`}>
                  {step > 2 ? <Check size={16} /> : "2"}
                </div>
              </div>

              {/* Connector 2→3 */}
              <div className="flex-1 h-[1px] bg-gray-200 overflow-hidden">
                <div className={`h-full bg-[#0d2b1e] transition-all duration-500 ${step > 2 ? 'w-full' : 'w-0'}`} />
              </div>

              {/* Step 3 */}
              <div className="flex flex-row items-center bg-[#fdfcf8] pl-2 gap-2 shrink-0">
                <span className={`text-xs font-medium ${step >= 3 ? 'text-[#0d2b1e]' : 'text-gray-400'}`}>Payment</span>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors shrink-0 ${step >= 3 ? 'bg-[#0d2b1e] text-[#fdfcf8]' : 'bg-gray-100 text-gray-400'}`}>
                  3
                </div>
              </div>
            </div>

            {/* Step 1: Recipient */}
            {step === 1 && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className="font-serif text-3xl text-[#0d2b1e] mb-8">Recipient Details</h2>
                
                <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">First Name</label>
                    <input type="text" className="luxury-input" placeholder="Jane" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Last Name</label>
                    <input type="text" className="luxury-input" placeholder="Doe" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Phone Number</label>
                    <input type="tel" className="luxury-input" placeholder="+961 XX XXX XXX" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">District</label>
                    <div className="relative">
                      <select className="luxury-select" defaultValue="">
                        <option value="" disabled>Select a district</option>
                        <option value="beirut">Beirut</option>
                        <option value="mount-lebanon">Mount Lebanon</option>
                        <option value="north">North</option>
                        <option value="south">South</option>
                        <option value="bekaa">Bekaa</option>
                      </select>
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                      </div>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Full Address</label>
                    <input type="text" className="luxury-input" placeholder="Street, Building, Floor..." />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Delivery Date</label>
                    <input type="date" className="luxury-input" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Time Slot</label>
                    <div className="relative">
                      <select className="luxury-select" defaultValue="">
                        <option value="" disabled>Select time slot</option>
                        <option value="morning">Morning (9 AM - 1 PM)</option>
                        <option value="afternoon">Afternoon (1 PM - 5 PM)</option>
                        <option value="evening">Evening (5 PM - 9 PM)</option>
                      </select>
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-12 flex justify-end">
                  <button 
                    onClick={() => setStep(2)}
                    className="bg-[#0d2b1e] text-[#fdfcf8] px-10 py-4 font-medium tracking-wide text-sm hover:bg-[#164430] transition-colors"
                  >
                    Continue to Sender
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Sender */}
            {step === 2 && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className="font-serif text-3xl text-[#0d2b1e] mb-8">Sender Details</h2>
                
                <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">First Name</label>
                    <input type="text" className="luxury-input" placeholder="John" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Last Name</label>
                    <input type="text" className="luxury-input" placeholder="Smith" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Email Address</label>
                    <input type="email" className="luxury-input" placeholder="john.smith@example.com" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Phone Number</label>
                    <input type="tel" className="luxury-input" placeholder="+1 XXX XXX XXXX" />
                  </div>
                  <div className="col-span-2 mt-4">
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Card Message (Optional)</label>
                    <textarea 
                      className="w-full bg-transparent border border-[#d1d1d1] p-4 font-sans text-sm mt-2 focus:border-[#0d2b1e] outline-none transition-colors resize-none" 
                      rows={4}
                      placeholder="Write a message to be included with your gift..."
                    ></textarea>
                  </div>
                </div>

                <div className="mt-12 flex justify-between items-center">
                  <button 
                    onClick={() => setStep(1)}
                    className="text-gray-500 text-sm font-medium hover:text-[#0d2b1e] transition-colors"
                  >
                    Back
                  </button>
                  <button 
                    onClick={() => setStep(3)}
                    className="bg-[#0d2b1e] text-[#fdfcf8] px-10 py-4 font-medium tracking-wide text-sm hover:bg-[#164430] transition-colors"
                  >
                    Continue to Payment
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Payment */}
            {step === 3 && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className="font-serif text-3xl text-[#0d2b1e] mb-8">Payment Method</h2>
                
                <div className="space-y-4">
                  <label className="payment-radio hover:border-[#0d2b1e] transition-colors">
                    <input type="radio" name="payment" defaultChecked className="accent-[#0d2b1e]" />
                    <div className="flex-1 flex justify-between items-center">
                      <span className="font-medium">Credit / Debit Card</span>
                      <div className="flex gap-2">
                        <div className="w-8 h-5 bg-gray-200 rounded"></div>
                        <div className="w-8 h-5 bg-gray-200 rounded"></div>
                      </div>
                    </div>
                  </label>
                  
                  <label className="payment-radio hover:border-[#0d2b1e] transition-colors">
                    <input type="radio" name="payment" className="accent-[#0d2b1e]" />
                    <div className="flex-1 flex justify-between items-center">
                      <span className="font-medium">PayPal</span>
                      <div className="w-12 h-5 bg-blue-100 rounded"></div>
                    </div>
                  </label>
                  
                  <label className="payment-radio hover:border-[#0d2b1e] transition-colors">
                    <input type="radio" name="payment" className="accent-[#0d2b1e]" />
                    <div className="flex-1 flex justify-between items-center">
                      <span className="font-medium">Whish Money</span>
                    </div>
                  </label>

                  <label className="payment-radio hover:border-[#0d2b1e] transition-colors">
                    <input type="radio" name="payment" className="accent-[#0d2b1e]" />
                    <div className="flex-1 flex justify-between items-center">
                      <span className="font-medium">Western Union</span>
                    </div>
                  </label>
                </div>

                <div className="mt-12 flex justify-between items-center">
                  <button 
                    onClick={() => setStep(2)}
                    className="text-gray-500 text-sm font-medium hover:text-[#0d2b1e] transition-colors"
                  >
                    Back
                  </button>
                  <button 
                    className="bg-[#0d2b1e] text-[#fdfcf8] px-10 py-4 font-medium tracking-wide text-sm hover:bg-[#164430] transition-colors"
                  >
                    Place Order • $94.00
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}
