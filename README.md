# SilentPay

Private checkout links for Fhenix-style confidential payments.

SilentPay is not a wallet. It is a merchant/developer layer:

- merchants create encrypted invoices
- payers open one checkout link or QR
- the checkout page prepares encrypted payment calldata
- a wallet or Privy embedded wallet signs the transaction
- payer and merchant get private receipt links
- public explorers see transaction metadata and ciphertext handles, not amount/memo

## Current Build

This first app is a working Next.js prototype:

- `src/app/page.tsx` - merchant invoice creation, QR/link generation, payment/receipt history, protocol explanation
- `src/app/invoice/[id]/page.tsx` - payer checkout flow
- `src/app/receipt/[id]/page.tsx` - private receipt page
- `src/lib/silentpay.ts` - invoice/receipt model, demo privacy envelope, local storage helpers

The demo privacy envelope is intentionally labeled. Production replaces it with:

- `@cofhe/sdk` encrypted inputs
- FHERC20/private-token payment contract
- `FHE.allow(...)` permissions for payer and merchant
- Base Sepolia/Fhenix-compatible settlement contract addresses

## Environment

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill:

```bash
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
NEXT_PUBLIC_SILENTPAY_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_FHERC20_ADDRESS=0x...
NEXT_PUBLIC_COFHE_ENV=testnet
```

Only `NEXT_PUBLIC_PRIVY_APP_ID` is needed to enable Privy login/embedded-wallet UX in the current prototype. Contract addresses are placeholders for the next implementation step.

## Run

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Payment Flow

Merchant:

1. Sign in with Privy.
2. Create an invoice with amount, token, title, memo, and settlement address.
3. SilentPay creates a checkout link and QR.
4. Link uses an invoice route plus URL fragment payload, so private details are not sent as query params.

Payer:

1. Opens the link or scans the QR.
2. SilentPay checkout shows the invoice details.
3. Checkout prepares encrypted payment input.
4. Privy embedded wallet or external wallet signs the transaction.
5. Payer receives a private receipt link.

Production onchain behavior:

- public: tx hash, block, gas, SilentPay/FHERC20 contract, ciphertext handles
- private: amount, memo, merchant balance, receipt details, payer payment history

## Why This Is Different

- Fhenix Pay is wallet-first private transfer UX.
- Privara is broader stablecoin infrastructure with escrow, smart wallets, and cross-chain routing.
- SilentPay is checkout-first infrastructure: private payment links, QR links, embeddable checkout, receipts, and eventually x402-compatible verification for paid APIs.
