# ModVoice Payment Gateway

This repository contains the payment code used by ModVoice. We opened the source so you can verify exactly how we handle and protect creator payments.

## Bring Your Own Gateway

Most platforms act as the merchant of record. They process payments centrally and take a percentage cut before paying creators.

ModVoice does not process the money. Creators connect their own Stripe accounts. When someone buys a server boost or a VIP role, the money goes straight to the creator. ModVoice takes no fees.

## Zero-Trust Security with Restricted Keys

Because creators bring their own keys, we need to protect them from hackers and rogue admins.

We instruct creators to generate Stripe Restricted Keys limited strictly to "Write Checkout Sessions". This setup prevents the key from reading the creator's balance, issuing refunds, or viewing customer data. The key only has permission to generate checkout pages.

Even with restricted permissions, the keys still need protection from database leaks. We use edge encryption to handle this:

1. **Client-side routing:** The frontend never encrypts the keys. The raw key goes straight to a Cloudflare Pages Edge Function over HTTPS.
2. **Edge processing:** The Edge Function encrypts the key in memory using AES-256 and a server-side secret. This secret is completely absent from the frontend bundle.
3. **Storage:** The scrambled text is written to Firestore.
4. **Decryption:** When a checkout starts, the edge handler decrypts the key in memory and calls the Stripe API. The frontend never sees the decrypted key.

## Repository Structure

* `modvc-main/components/` - React UI components for product checkouts and server boosts.
* `modvc-main/utils/encryption.ts` - AES-256 logic.
* `src/routes/api.stripe-checkout.ts` - Edge endpoint that creates Stripe Checkout sessions.
* `src/routes/api.stripe-keys.ts` - Edge endpoint that encrypts and stores raw keys.
* `src/routes/api.stripe-webhook.ts` - Fulfillment handler that verifies Stripe signatures.

## License

This project uses the MIT License. See the [LICENSE](LICENSE) file for details.
