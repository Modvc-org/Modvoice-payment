import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";
import { getApps, initializeApp, deleteApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, updateDoc, arrayUnion, increment, collection } from "firebase/firestore";
import { decryptApiKey } from "../../modvc-main/utils/encryption";

const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCt0ly_a8BMjQytRsnnRez3DQ3Ekqlm--o",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "auth.modvc.org",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://classroom-4ac6b-default-rtdb.firebaseio.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "classroom-4ac6b"
};

async function getAuthenticatedFirestore() {
  const appName = `worker-${Date.now()}-${Math.random()}`;
  const app = initializeApp(FIREBASE_CONFIG, appName);
  const auth = getAuth(app);
  const email = (typeof process !== 'undefined' && process.env.VITE_BOT_WRITER_EMAIL) || import.meta.env.VITE_BOT_WRITER_EMAIL || "";
  const password = (typeof process !== 'undefined' && process.env.VITE_BOT_WRITER_PASSWORD) || import.meta.env.VITE_BOT_WRITER_PASSWORD || "";
  
  await signInWithEmailAndPassword(auth, email, password);
  return { db: getFirestore(app), app };
}

export const Route = createFileRoute("/api/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.text();
          const signature = request.headers.get("stripe-signature");

          if (!signature) {
            return new Response("No signature found", { status: 400 });
          }

          // We need to figure out which server this is for.
          // Since it's a global webhook endpoint, we parse the body unverified to get metadata
          const unverifiedEvent = JSON.parse(body) as Stripe.Event;
          const session = unverifiedEvent.data.object as Stripe.Checkout.Session;
          
          if (!session.metadata || !session.metadata.serverId) {
            return new Response("No serverId in metadata", { status: 400 });
          }

          const { serverId, productId, userId, type, quantity } = session.metadata;

          let db: any;
          let app: any;
          try {
             const authResult = await getAuthenticatedFirestore();
             db = authResult.db;
             app = authResult.app;
          } catch (err) {
             return new Response("Database error", { status: 500 });
          }
          
          // Get Server to find Stripe Webhook Secret
          const serverDoc = await getDoc(doc(db, "servers", serverId));
          if (!serverDoc.exists()) {
            return new Response("Server not found", { status: 404 });
          }
          const serverData = serverDoc.data();
          const encryptedSecret = serverData.stripeSecretKey;
          const encryptedWebhook = serverData.stripeWebhookSecret;
          
          const stripeSecretKey = encryptedSecret ? decryptApiKey(encryptedSecret) : null;
          const stripeWebhookSecret = encryptedWebhook ? decryptApiKey(encryptedWebhook) : null;

          if (!stripeSecretKey || !stripeWebhookSecret) {
            return new Response(JSON.stringify({
              error: "Server Stripe config missing", 
              hasEncryptedWebhook: !!encryptedWebhook,
              decryptedWebhookLength: stripeWebhookSecret?.length,
              processAvailable: typeof process !== 'undefined',
              hasEnvKey: typeof process !== 'undefined' ? !!process.env.GLOBAL_ENCRYPTION_KEY : false
            }), { status: 400 });
          }

          const stripe = new Stripe(stripeSecretKey, {
            apiVersion: "2024-04-10" as any,
          });

          let event: Stripe.Event;
          try {
            event = await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecret);
          } catch (err: any) {
            console.error(`⚠️  Webhook signature verification failed.`, err.message);
            return new Response(JSON.stringify({
              error: `Webhook Error: ${err.message}`,
              webhookSecretLength: stripeWebhookSecret.length,
              signaturePrefix: signature.substring(0, 10),
              bodyLength: body.length
            }), { status: 400 });
          }

          if (event.type === "checkout.session.completed") {
             // Fulfillment
             const txid = session.payment_intent as string || event.id;
             const isBoost = type === 'boost';
             
             if (isBoost) {
                 const boostQuantity = parseInt(quantity || '1');
                 
                 // Update Server Boost Count
                 const serverRef = doc(db, "servers", serverId);
                 await updateDoc(serverRef, {
                    boostCount: increment(boostQuantity)
                 });
                 
                 // Record the Boost
                 const newBoostRef = doc(collection(db, "server_boosts"), txid);
                 await setDoc(newBoostRef, {
                    id: txid,
                    serverId,
                    userId,
                    txid,
                    amount: session.amount_total ? session.amount_total / 100 : 0,
                    boostsGranted: boostQuantity,
                    network: 'stripe',
                    status: 'approved',
                    createdAt: Date.now()
                 });

             } else {
                 // 1. Record Product Purchase
                 await setDoc(doc(db, "storePurchases", txid), {
                    userId,
                    serverId,
                    productId,
                    txid,
                    network: "stripe",
                    token: "USD",
                    amount: session.amount_total ? session.amount_total / 100 : 0,
                    status: "completed",
                    createdAt: Date.now()
                 });

                 // 2. Add Role if product has roleId
                 const productDoc = await getDoc(doc(db, "products", productId));
                 if (productDoc.exists()) {
                     const productData = productDoc.data();
                     if (productData.roleId) {
                         const memberRef = doc(db, `servers/${serverId}/members/${userId}`);
                         const memberSnap = await getDoc(memberRef);
                         if (memberSnap.exists()) {
                             await updateDoc(memberRef, {
                                 roleIds: arrayUnion(productData.roleId)
                             });
                         }
                     }
                 }
             }
          }

          await deleteApp(app);
          return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });

        } catch (error: any) {
          console.error("Webhook Handler Error:", error);
          // @ts-ignore
          if (typeof app !== 'undefined') await deleteApp(app).catch(()=>null);
          return new Response("Internal Server Error", { status: 500 });
        }
      }
    }
  }
});
