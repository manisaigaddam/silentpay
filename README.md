# SilentPay

Confidential payment links and checkout infrastructure for Fhenix-enabled payments.

SilentPay is a payment-link layer for private onchain checkout:

- create private invoices
- share a payment link or QR
- let payers complete payment from one checkout page with Privy email wallets or connected wallets
- keep invoice amount, memo, receipt, and merchant analytics private
- expose only transaction metadata and ciphertext handles publicly

## Current App

This repo contains the production UI foundation for SilentPay:

- `src/app/page.tsx` - merchant invoice creation, QR/link generation, receipt history, protocol overview
- `src/app/invoice/[id]/page.tsx` - payer checkout flow
- `src/app/receipt/[id]/page.tsx` - private receipt view
- `src/lib/silentpay.ts` - invoice/receipt model and URL payload helpers
- `src/lib/fhenix-client.ts` - CoFHE encryption and SilentPay calldata helpers
- `src/lib/browser-wallet.ts` - Privy/viem browser client setup
- `contracts/contracts/SilentPayInvoices.sol` - first Fhenix encrypted invoice accounting contract

The app expects real FHE configuration: Privy for identity/signing, a deployed SilentPay invoice contract, and supported FHERC20 token contracts for confidential settlement.

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
NEXT_PUBLIC_COFHE_ENV=testnet
NEXT_PUBLIC_SILENTPAY_FROM_BLOCK=
NEXT_PUBLIC_SILENTPAY_SCAN_BLOCKS=100000
```

For Vercel, add the same values in Project Settings -> Environment Variables.

Required:

- `NEXT_PUBLIC_PRIVY_APP_ID` enables Privy login and embedded-wallet onboarding.
- `NEXT_PUBLIC_APP_URL` should be your deployed app URL in production.
- `NEXT_PUBLIC_SILENTPAY_CONTRACT_ADDRESS`
- `NEXT_PUBLIC_COFHE_ENV`
- `NEXT_PUBLIC_SILENTPAY_FROM_BLOCK` is optional, but recommended after deployment so event reads start at your contract deployment block.
- `NEXT_PUBLIC_SILENTPAY_SCAN_BLOCKS` controls fallback event scan depth when `NEXT_PUBLIC_SILENTPAY_FROM_BLOCK` is empty.

Supported FHERC20 settlement tokens live in `src/lib/tokens.ts`. Current Base Sepolia options are:

- `eUSDC` - `0x0f3521fFe4246fA4285ea989155A7e4607C55f17`
- `eUSDT` - `0x7943Eee6ABaD45A583E2aBEeA6Eb9CB18b4b6987`
- `ePYUSD` - `0x79Ba1D402d4B6f6334A084A2637B38a89F74a7Bc`

These are FHERC20 contracts verified by reading `isFherc20()`, `symbol()`, and `decimals()` on Base Sepolia. To fund a payer, get the underlying mock asset and shield it through Redact into the matching confidential token.

Contract env:

```bash
cd contracts
cp .env.example .env
```

```bash
PRIVATE_KEY=0xyour_private_key
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
```

Deploy:

```bash
npm install
npm run compile
npm run deploy
```

Put the deployed contract address into `NEXT_PUBLIC_SILENTPAY_CONTRACT_ADDRESS`.

## Payment Flow

Merchant:

1. Sign in with Privy.
2. Create an invoice with the Privy wallet settlement address, amount, token, title, and private memo.
3. SilentPay creates a link and local QR without sending the link to a third-party QR service.
4. Register the invoice onchain. The expected amount is encrypted with CoFHE before signing.
5. Share the link or QR.

Payer:

1. Opens the link or scans the QR.
2. SilentPay shows the invoice details.
3. Payer continues with email or connects a wallet through Privy.
4. Checkout encrypts the payment amount with CoFHE.
5. Payer signs one FHERC20 `encTransfer(merchant, encryptedAmount)` transaction.
6. SilentPay creates a receipt link from the real transaction hash.

Onchain privacy target:

- Public: transaction hash, block, gas, contract address, ciphertext handles, verifier signatures, indicated FHERC20 movement.
- Private: amount, memo, merchant balance, receipt details, payer history, merchant analytics.

## Fhenix Implementation Target

`contracts/contracts/SilentPayInvoices.sol` records encrypted invoice accounting:

- `createInvoice(...)` stores encrypted expected amount.
- `payInvoice(...)` records encrypted paid amount.
- `FHE.add(...)` accumulates private payments.
- `FHE.allow(...)` grants decrypt access to merchant, payer, and optional receipt viewer.
- `getParticipantEncryptedAmounts(...)` lets involved addresses retrieve encrypted handles; outsiders only see public metadata.

Checkout settlement uses FHERC20:

- `encTransfer(address merchant, InEuint128 amount)` moves confidential tokens in one payer transaction.
- Each invoice carries the selected FHERC20 token address, so `eUSDC`, `eUSDT`, and `ePYUSD` settle through different token contracts.
- The checkout prepares the encrypted input with `@cofhe/sdk`.
- The wallet signs opaque calldata; the explorer cannot read the amount.

Next engineering steps:

1. Set `NEXT_PUBLIC_SILENTPAY_FROM_BLOCK` to the invoice contract deployment block to make history reads faster.
2. Add encrypted paid-enough checks and public fulfillment events.
3. Add contract tests for participant access, receipt viewers, and repeated payments.
4. Add a SilentPay-owned FHERC20 faucet or Redact integration shortcut for easier hackathon testing.
