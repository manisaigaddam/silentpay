# SilentPay

Confidential payment links and checkout infrastructure for Fhenix-enabled payments.

SilentPay focuses on the merchant and developer layer:

- create private invoices
- share a payment link or QR
- let payers complete payment from a single checkout page
- keep invoice amount, memo, receipt, and merchant analytics private
- expose only transaction metadata and ciphertext handles publicly

## Current App

This repo contains the production UI foundation for SilentPay:

- `src/app/page.tsx` - merchant invoice creation, QR/link generation, receipt history, protocol overview
- `src/app/invoice/[id]/page.tsx` - payer checkout flow
- `src/app/receipt/[id]/page.tsx` - private receipt view
- `src/lib/silentpay.ts` - invoice/receipt model and local preview envelope
- `contracts/SilentPayInvoices.sol` - first Fhenix encrypted invoice accounting contract
- `src/lib/fhenix-client.ts` - calldata helpers for wiring encrypted inputs into the app

The app currently uses a local preview envelope so the interface can be deployed and tested on Vercel immediately. The Fhenix path is scaffolded and should replace the preview envelope with CoFHE encrypted inputs.

## Environment

Create `.env.local` from `.env.example`:

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

For Vercel, add the same values in Project Settings -> Environment Variables.

Required now:

- `NEXT_PUBLIC_PRIVY_APP_ID` enables Privy login and embedded-wallet onboarding.

Required after contract deployment:

- `NEXT_PUBLIC_SILENTPAY_CONTRACT_ADDRESS`
- `NEXT_PUBLIC_FHERC20_ADDRESS`
- `NEXT_PUBLIC_COFHE_ENV`

## Payment Flow

Merchant:

1. Sign in with Privy.
2. Create an invoice with merchant address, amount, token, title, and private memo.
3. SilentPay creates a link and QR.
4. The link opens a checkout page with invoice data carried through a private URL fragment.

Payer:

1. Opens the link or scans the QR.
2. SilentPay shows the invoice details.
3. The checkout encrypts the payment amount.
4. Privy embedded wallet or an external wallet signs the transaction.
5. SilentPay creates a receipt link for the payer and merchant.

Onchain privacy target:

- Public: transaction hash, block, gas, contract address, ciphertext handles, input proof.
- Private: amount, memo, merchant balance, receipt details, payer history, merchant analytics.

## Fhenix Implementation Target

`contracts/SilentPayInvoices.sol` records encrypted invoice accounting:

- `createInvoice(...)` stores encrypted expected amount.
- `payInvoice(...)` records encrypted paid amount.
- `FHE.add(...)` accumulates private payments.
- `FHE.allow(...)` grants decrypt access to merchant, payer, and optional receipt viewer.

Next engineering steps:

1. Add Hardhat/Fhenix config for the contract package.
2. Compile and deploy `SilentPayInvoices.sol`.
3. Replace local preview envelope with `@cofhe/sdk` encrypted input generation.
4. Submit calldata through Privy embedded wallet on Base Sepolia/Fhenix-supported network.
5. Add FHERC20 settlement once token interface is selected.
