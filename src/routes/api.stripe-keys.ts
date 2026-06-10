import { createFileRoute } from "@tanstack/react-router";
import { initializeApp, getApps, deleteApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, getDoc, updateDoc } from "firebase/firestore";
import { encryptApiKey } from "../../modvc-main/utils/encryption";

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

export const Route = createFileRoute("/api/stripe-keys")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { serverId, userId, stripePublishableKey, stripeSecretKey, stripeWebhookSecret } = body;

          if (!serverId || !userId) {
            return new Response(JSON.stringify({ success: false, error: "Missing required parameters" }), {
              status: 400,
              headers: { "Content-Type": "application/json" }
            });
          }

          let db: any;
          let app: any;
          try {
            const authResult = await getAuthenticatedFirestore();
            db = authResult.db;
            app = authResult.app;
          } catch (err) {
            return new Response(JSON.stringify({ success: false, error: "Failed to connect to database" }), { status: 500 });
          }
          const serverRef = doc(db, "servers", serverId);
          const serverSnap = await getDoc(serverRef);

          if (!serverSnap.exists()) {
            return new Response(JSON.stringify({ success: false, error: "Server not found" }), { status: 404 });
          }

          const serverData = serverSnap.data();
          if (serverData.ownerId !== userId) {
             return new Response(JSON.stringify({ success: false, error: "Only the server owner can update payment keys." }), { status: 403 });
          }

          // Encrypt keys strictly on the backend!
          // We use encryptApiKey which falls back to the VITE_ key if GLOBAL_ isn't set yet.
          const updates: any = {};
          if (stripePublishableKey !== undefined) updates.stripePublishableKey = stripePublishableKey;
          
          if (stripeSecretKey && !stripeSecretKey.startsWith('••••••••')) {
             updates.stripeSecretKey = encryptApiKey(stripeSecretKey);
          }
          
          if (stripeWebhookSecret && !stripeWebhookSecret.startsWith('••••••••')) {
             updates.stripeWebhookSecret = encryptApiKey(stripeWebhookSecret);
          }

          if (Object.keys(updates).length > 0) {
             await updateDoc(serverRef, updates);
          }

          await deleteApp(app);

          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });

        } catch (error: any) {
          console.error("Stripe Keys API Error:", error);
          // @ts-ignore
          if (typeof app !== 'undefined') await deleteApp(app).catch(()=>null);
          return new Response(JSON.stringify({ success: false, error: "Internal Server Error: " + error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        }
      }
    }
  }
});
