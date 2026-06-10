import React, { useState } from 'react';
import { Server, UserProfile, StoreProduct, ServerMember } from '../types';
import { X, ExternalLink, ShieldCheck, DollarSign, Loader2 } from 'lucide-react';
import { sendToken, NetworkName, SUPPORTED_NETWORKS } from '../../src/lib/web3';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { serverService } from '../services/serverStore';

interface ProductCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: StoreProduct;
  server: Server;
  currentUser: any;
  myMember: ServerMember;
  masterWalletAddress: string;
}

export function ProductCheckoutModal({ isOpen, onClose, product, server, currentUser, myMember, masterWalletAddress }: ProductCheckoutModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  if (!isOpen) return null;

  const handlePurchase = async () => {
    setIsProcessing(true);
    toast.loading("Generating secure checkout...", { id: 'checkout_toast' });
    
    // Open a blank tab immediately to bypass popup blockers
    const newWindow = window.open('about:blank', '_blank');

    try {
      const response = await fetch('/api/stripe-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverId: server.id,
          productId: product.id,
          userId: currentUser.uid,
          successUrl: window.location.href,
          cancelUrl: window.location.href
        })
      });

      const data = await response.json();
      toast.dismiss('checkout_toast');

      if (data.success && data.url) {
        if (newWindow) {
           newWindow.location.href = data.url;
           toast.success("Checkout opened in a new tab! Once you pay, this page will update automatically.");
           onClose();
        } else {
           // Fallback if popup blocker blocked it
           window.location.href = data.url;
        }
      } else {
        if (newWindow) newWindow.close();
        toast.error(`Checkout Failed: ${data.error}`);
      }
    } catch (err: any) {
      if (newWindow) newWindow.close();
      toast.dismiss('checkout_toast');
      toast.error("Network error while creating checkout.");
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-[#313338] rounded-md w-full max-w-[440px] overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#1e1f22]">
          <h2 className="text-xl font-bold text-gray-200">Checkout</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 flex-1 overflow-y-auto custom-scrollbar max-h-[70vh]">
          
          <div className="flex gap-4 items-start mb-4">
             {product.imageUrl ? (
               <img src={product.imageUrl} className="w-20 h-20 object-cover rounded-md border border-[#1e1f22] shrink-0 bg-[#1e1f22]" />
             ) : (
               <div className="w-20 h-20 bg-[#2B2D31] rounded-md border border-[#1e1f22] shrink-0 flex items-center justify-center">
                  <DollarSign className="w-8 h-8 text-gray-500" />
               </div>
             )}
             <div>
                <h3 className="text-lg font-bold text-white mb-1 leading-tight">{product.name}</h3>
                <p className="text-sm text-gray-400 mb-2">Sold by <strong className="text-white">{server.name}</strong></p>
                <div className="inline-block bg-[#2B2D31] px-2 py-1 rounded text-sm font-bold text-indigo-400">
                  ${product.price?.toFixed(2)} USD
                </div>
             </div>
          </div>

          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-md p-3 mb-6">
            <p className="text-xs text-gray-300 leading-relaxed">
              <strong className="text-indigo-400">Zero Platform Fees:</strong> We take a 0% cut. Your payment will be processed securely via Stripe directly to the creator's account.
            </p>
          </div>

          {/* Subtotal */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-[15px] font-bold text-white">Total</span>
            <span className="text-[15px] font-bold text-white">${product.price?.toFixed(2)} USD</span>
          </div>

          {!showTerms ? (
            <p className="text-[11px] text-gray-400 leading-tight">
              By proceeding, you agree to our Terms of Service.
              <span onClick={() => setShowTerms(true)} className="text-[#00A8FC] cursor-pointer hover:underline ml-1">Learn More.</span>
            </p>
          ) : (
            <div className="mt-2 bg-[#1e1f22] p-3 rounded-md border border-white/5 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-gray-300 uppercase flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-mod-green" /> Terms & Guidelines
                </h3>
                <button onClick={() => setShowTerms(false)} className="text-gray-500 hover:text-white transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </div>
              <ul className="text-[10px] text-gray-400 leading-relaxed list-disc pl-4 space-y-1">
                <li>ModVoice acts as a software infrastructure provider and does not process or custody funds.</li>
                <li>Your transaction is securely handled by Stripe, acting as the Merchant of Record for the creator.</li>
                <li>Disputes and refunds must be handled directly with the creator.</li>
              </ul>
            </div>
          )}

          {isProcessing && (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-[#5865F2] font-medium bg-[#5865F2]/10 p-3 rounded border border-[#5865F2]/20">
               <span className="w-4 h-4 border-2 border-[#5865F2]/30 border-t-[#5865F2] rounded-full animate-spin"></span>
               Connecting to Stripe...
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#2B2D31] border-t border-[#1e1f22] flex items-center justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-white hover:underline disabled:opacity-50"
            disabled={isProcessing}
          >
            Cancel
          </button>
          <button
            onClick={handlePurchase}
            disabled={isProcessing}
            className="bg-[#635BFF] hover:bg-[#5249E5] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-2 px-6 rounded transition-colors flex items-center gap-2"
          >
            Pay with Stripe
          </button>
        </div>

      </div>
    </div>
  );
}
