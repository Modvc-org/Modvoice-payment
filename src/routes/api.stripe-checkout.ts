import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";
import { getApps, initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { decryptApiKey } from "../../modvc-main/utils/encryption";

const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCt0ly_a8BMjQytRsnnRez3DQ3Ekqlm--o",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "auth.modvc.org",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://classroom-4ac6b-default-rtdb.firebaseio.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "classroom-4ac6b"
};

async function getAuthenticatedFirestore() {
  const app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApps()[0];
  const auth = getAuth(app);
  const email = import.meta.env.VITE_BOT_WRITER_EMAIL || "api_bot_writer@modvc.org";
  const password = import.meta.env.VITE_BOT_WRITER_PASSWORD || "MODVCApiBotWriterPassword2026!";
  
  await signInWithEmailAndPassword(auth, email, password);
  return getFirestore(app);
}

export const Route = createFileRoute("/api/stripe-checkout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { serverId, productId, userId, type, quantity, successUrl, cancelUrl } = body;
          const isBoost = type === 'boost';

          if (!serverId || !userId || (!isBoost && !productId)) {
            return new Response(JSON.stringify({ success: false, error: "Missing required parameters" }), {
              status: 400,
              headers: { "Content-Type": "application/json" }
            });
          }

          const db = await getAuthenticatedFirestore();
          
          // Get Server to find Stripe Keys
          const serverDoc = await getDoc(doc(db, "servers", serverId));
          if (!serverDoc.exists()) {
            return new Response(JSON.stringify({ success: false, error: "Server not found" }), { status: 404 });
          }
          const serverData = serverDoc.data();
          const encryptedSecret = serverData.stripeSecretKey;
          const stripeSecretKey = encryptedSecret ? decryptApiKey(encryptedSecret) : null;

          if (!stripeSecretKey) {
            return new Response(JSON.stringify({ success: false, error: "This server has not configured Stripe payments yet." }), { status: 400 });
          }

          // Configure Line Items based on Type
          let line_items: any[] = [];
          
          if (isBoost) {
             const boostQuantity = quantity || 1;
             line_items = [{
                price_data: {
                  currency: 'usd',
                  product_data: {
                    name: `Server Boost - ${serverData.name}`,
                    description: `Boost ${serverData.name} to unlock perks!`,
                  },
                  unit_amount: 300, // $3.00 per boost
                },
                quantity: boostQuantity,
             }];
          } else {
             // Get Product
             const productDoc = await getDoc(doc(db, "products", productId));
             if (!productDoc.exists()) {
               return new Response(JSON.stringify({ success: false, error: "Product not found" }), { status: 404 });
             }
             const productData = productDoc.data();
             
             line_items = [{
                price_data: {
                  currency: 'usd',
                  product_data: {
                    name: productData.name,
                    description: productData.description || 'Digital Product',
                    images: productData.imageUrl ? [productData.imageUrl] : undefined,
                  },
                  unit_amount: Math.round(productData.price * 100), // Stripe uses cents
                },
                quantity: 1,
             }];
          }

          const stripe = new Stripe(stripeSecretKey, {
            apiVersion: "2024-04-10" as any, // type assertion for older/newer versions
          });

          // Create Checkout Session
          const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items,
            mode: 'payment',
            success_url: successUrl || 'https://modvc.org/success',
            cancel_url: cancelUrl || 'https://modvc.org/cancel',
            client_reference_id: userId,
            metadata: {
              serverId: serverId,
              productId: productId || 'boost',
              userId: userId,
              type: isBoost ? 'boost' : 'product',
              quantity: (quantity || 1).toString()
            }
          });

          return new Response(JSON.stringify({ success: true, url: session.url }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        } catch (error: any) {
          console.error("Stripe Checkout Error:", error);
          return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        }
      }
    }
  }
});
