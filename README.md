# ModVoice Payment Gateway

This repository contains the core payment processing and security infrastructure used by ModVoice. We open-sourced these modules to provide complete transparency on how we handle, encrypt, and process creator payments.

## The Approach: Bring Your Own Gateway (BYOG)

Traditional platforms operate as the "merchant of record." They process payments centrally, hold funds, and take a percentage cut before paying out creators. 

We took a different path. ModVoice acts strictly as infrastructure. Creators connect their own Stripe accounts directly to their communities. When a user buys a product or boosts a server, 100% of the transaction goes straight to the creator's Stripe account. ModVoice takes zero fees and holds zero financial liability.

## Edge Encryption Architecture

Because creators provide their own Stripe API keys, security is critical. Standard Firebase applications often encrypt data on the frontend before saving it to Firestore. This approach exposes the global encryption key to the client bundle (often through variables like `VITE_GLOBAL_ENCRYPTION_KEY`), making it vulnerable to XSS attacks.

To prevent this, our architecture relies on Edge Encryption:

1. **Client-Side:** The frontend never encrypts the keys. When a creator saves their settings, the raw keys are sent directly to a secure Cloudflare Pages Edge Function over HTTPS.
2. **Edge Processing:** The Edge Function uses a strictly server-side secret (`GLOBAL_ENCRYPTION_KEY`) that is stripped from frontend bundles. It encrypts the keys in memory using AES-256 (`crypto-js`).
3. **Storage:** The scrambled ciphertext is written to Firestore using a secure service account.
4. **Decryption:** When a checkout session is initiated, the edge handler decrypts the keys dynamically in memory, verifies the Stripe signature, and completes the fulfillment. The frontend never fetches or decrypts these keys.

## Repository Structure

* `modvc-main/components/` - The React UI components handling product checkouts and server boosts.
* `modvc-main/utils/encryption.ts` - The AES-256 edge encryption logic.
* `src/routes/api.stripe-checkout.ts` - The edge endpoint that decrypts credentials and generates Stripe Checkout sessions.
* `src/routes/api.stripe-keys.ts` - The edge endpoint that receives raw keys, encrypts them, and handles database storage.
* `src/routes/api.stripe-webhook.ts` - The fulfillment handler that verifies Stripe signatures and assigns roles or unlocks products.

## Usage

This codebase is extracted directly from the ModVoice production environment. You can use it as a reference architecture for building zero-fee, edge-encrypted payment flows in your own serverless applications.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
