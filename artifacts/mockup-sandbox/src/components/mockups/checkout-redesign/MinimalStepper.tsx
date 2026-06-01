import React, { useState } from "react";
import { Check, ChevronDown, ChevronUp, ArrowLeft, CreditCard } from "lucide-react";

export default function MinimalStepper() {
  const [currentStep, setCurrentStep] = useState(1);
  const [summaryExpanded, setSummaryExpanded] = useState(false);

  const handleNext = () => {
    if (currentStep < 3) setCurrentStep(currentStep + 1);
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  return (
    <div className="min-h-[100dvh] bg-[#faf8f4] text-[#1a3a2e] font-sans selection:bg-[#1a3a2e] selection:text-[#faf8f4]">
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');
        .font-playfair { font-family: 'Playfair Display', serif; }
        .input-elegant {
          border: none;
          border-bottom: 1px solid #d1d1d1;
          background: transparent;
          border-radius: 0;
          padding: 0.5rem 0;
          outline: none;
          width: 100%;
          font-family: 'Inter', sans-serif;
          font-size: 1rem;
          color: #1a3a2e;
          transition: border-color 0.2s;
        }
        .input-elegant:focus {
          border-bottom-color: #1a3a2e;
        }
        .label-elegant {
          display: block;
          font-family: 'Inter', sans-serif;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-size: 0.65rem;
          color: #6b7280;
          margin-bottom: 0.25rem;
          font-weight: 500;
        }
        .radio-elegant-card {
          border: 1px solid #d1d1d1;
          border-radius: 0.5rem;
          padding: 1rem;
          display: flex;
          align-items: center;
          cursor: pointer;
          transition: all 0.2s;
        }
        .radio-elegant-card:hover {
          border-color: #1a3a2e;
        }
        .radio-elegant-card.selected {
          border-color: #1a3a2e;
          background: rgba(26, 58, 46, 0.03);
        }
      `}} />

      <div className="mx-auto max-w-2xl px-6 py-12 md:py-16 flex flex-col min-h-[100dvh]">
        
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="font-playfair text-xl tracking-widest uppercase mb-10">Presentail</h1>
          
          {/* Stepper */}
          <div className="flex items-center justify-between relative max-w-md mx-auto">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-[1px] bg-[#e5e5e5] -z-10" />
            
            {[1, 2, 3].map((step) => {
              const isActive = currentStep === step;
              const isCompleted = currentStep > step;
              
              return (
                <div key={step} className="flex flex-col items-center bg-[#faf8f4] px-2 z-10">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs mb-2 transition-colors ${
                    isActive ? 'bg-[#1a3a2e] text-[#faf8f4]' : 
                    isCompleted ? 'bg-[#e5e5e5] text-[#1a3a2e]' : 'bg-[#f0ece1] text-[#9ca3af]'
                  }`}>
                    {isCompleted ? <Check className="w-3.5 h-3.5" /> : step}
                  </div>
                  <span className={`text-[0.65rem] uppercase tracking-wider ${
                    isActive ? 'text-[#1a3a2e] font-semibold' : 
                    isCompleted ? 'text-[#6b7280]' : 'text-[#9ca3af]'
                  }`}>
                    {step === 1 ? 'Recipient' : step === 2 ? 'Sender' : 'Payment'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-grow">
          {currentStep === 1 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="font-playfair text-3xl mb-8 text-center">Where should we deliver?</h2>
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="label-elegant">First Name</label>
                    <input type="text" className="input-elegant" placeholder="Jane" />
                  </div>
                  <div>
                    <label className="label-elegant">Last Name</label>
                    <input type="text" className="input-elegant" placeholder="Doe" />
                  </div>
                </div>
                
                <div>
                  <label className="label-elegant">Phone Number</label>
                  <input type="tel" className="input-elegant" placeholder="+961 00 000 000" />
                </div>
                
                <div>
                  <label className="label-elegant">District</label>
                  <select className="input-elegant appearance-none bg-transparent cursor-pointer rounded-none">
                    <option value="" disabled selected>Select a district...</option>
                    <option value="beirut">Beirut</option>
                    <option value="mount-lebanon">Mount Lebanon</option>
                    <option value="north">North Lebanon</option>
                    <option value="south">South Lebanon</option>
                    <option value="bekaa">Bekaa</option>
                  </select>
                </div>
                
                <div>
                  <label className="label-elegant">Full Address</label>
                  <input type="text" className="input-elegant" placeholder="Street, Building, Floor..." />
                </div>

                <div className="grid grid-cols-2 gap-6 pt-2">
                  <div>
                    <label className="label-elegant">Delivery Date</label>
                    <input type="date" className="input-elegant" />
                  </div>
                  <div>
                    <label className="label-elegant">Time Slot</label>
                    <select className="input-elegant appearance-none bg-transparent cursor-pointer rounded-none">
                      <option value="" disabled selected>Select time...</option>
                      <option value="morning">Morning (9 AM - 1 PM)</option>
                      <option value="afternoon">Afternoon (1 PM - 5 PM)</option>
                      <option value="evening">Evening (5 PM - 9 PM)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="font-playfair text-3xl mb-8 text-center">Who is sending this gift?</h2>
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="label-elegant">First Name</label>
                    <input type="text" className="input-elegant" placeholder="John" />
                  </div>
                  <div>
                    <label className="label-elegant">Last Name</label>
                    <input type="text" className="input-elegant" placeholder="Smith" />
                  </div>
                </div>
                
                <div>
                  <label className="label-elegant">Email Address</label>
                  <input type="email" className="input-elegant" placeholder="john@example.com" />
                </div>
                
                <div>
                  <label className="label-elegant">Phone Number</label>
                  <input type="tel" className="input-elegant" placeholder="+1 000 000 0000" />
                </div>

                <div className="pt-2">
                  <label className="label-elegant flex justify-between">
                    <span>Card Message</span>
                    <span className="text-gray-400 font-normal">Optional</span>
                  </label>
                  <textarea 
                    className="input-elegant resize-none h-24" 
                    placeholder="Write a heartfelt message to accompany your gift..."
                  ></textarea>
                </div>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="font-playfair text-3xl mb-8 text-center">How would you like to pay?</h2>
              <div className="space-y-4">
                {[
                  { id: 'card', name: 'Credit/Debit Card', icon: '💳' },
                  { id: 'paypal', name: 'PayPal', icon: 'P' },
                  { id: 'whish', name: 'Whish Money', icon: 'W' },
                  { id: 'wu', name: 'Western Union', icon: 'WU' }
                ].map((method) => (
                  <label key={method.id} className="radio-elegant-card">
                    <input type="radio" name="payment" value={method.id} className="w-4 h-4 text-[#1a3a2e] focus:ring-[#1a3a2e] border-gray-300 mr-4" />
                    <span className="font-medium">{method.name}</span>
                    <span className="ml-auto text-xl opacity-50 grayscale">{method.icon}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Area */}
        <div className="mt-12 border-t border-[#e5e5e5] pt-6">
          {/* Order Summary Collapsible */}
          <div className="mb-6 bg-[#f7f4ec] rounded-lg overflow-hidden">
            <button 
              onClick={() => setSummaryExpanded(!summaryExpanded)}
              className="w-full flex items-center justify-between p-4 focus:outline-none"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">Order Summary</span>
                {summaryExpanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
              </div>
              <span className="font-playfair font-semibold tracking-wide">$94.00</span>
            </button>
            
            <div className={`overflow-hidden transition-all duration-300 ${summaryExpanded ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="px-4 pb-4 text-sm text-gray-600 space-y-3">
                <div className="flex justify-between">
                  <span>Bloom Eternal — Rose Bouquet</span>
                  <span>$89.00</span>
                </div>
                <div className="flex justify-between">
                  <span>Delivery Fee</span>
                  <span>$5.00</span>
                </div>
                <div className="border-t border-[#e5e5e5] pt-2 flex justify-between font-medium text-[#1a3a2e] mt-2">
                  <span>Total</span>
                  <span>$94.00</span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-4">
            {currentStep > 1 ? (
              <button 
                onClick={handleBack}
                className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-[#1a3a2e] transition-colors py-3"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            ) : (
              <div /> // Placeholder for spacing
            )}
            
            <button 
              onClick={handleNext}
              className="flex-grow md:flex-grow-0 md:w-64 bg-[#1a3a2e] text-[#faf8f4] py-3.5 px-6 rounded-md font-medium tracking-wide hover:bg-[#11261e] transition-colors focus:ring-2 focus:ring-offset-2 focus:ring-[#1a3a2e] focus:outline-none text-center"
            >
              {currentStep === 3 ? 'Place Order' : 'Continue'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
