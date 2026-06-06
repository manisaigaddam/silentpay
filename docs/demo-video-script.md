# SilentPay 2-Minute Demo Script

## Goal

Show that SilentPay is not a mock checkout. It encrypts invoice/payment amounts with Fhenix CoFHE and settles through FHERC20 confidential tokens.

## 0:00-0:15 - Problem

Voiceover:

"Onchain payments are transparent by default. That is great for verification, but bad for real commerce: amounts, activity, revenue, and order context can leak to anyone watching the chain. SilentPay is a private payment-link layer built for Fhenix."

Screen:

- Open SilentPay home page.
- Show headline and Create tab.

## 0:15-0:40 - Create Private Invoice

Voiceover:

"A creator signs in with Privy, chooses a receiving wallet, payment token, amount, and private memo. SilentPay supports FHERC20 settlement assets like eUSDC, eUSDT, and ePYUSD."

Screen:

- Fill or show invoice form.
- Select `eUSDC`.
- Click create/generate.

## 0:40-1:05 - FHE Registration

Voiceover:

"SilentPay does not show the QR or payment link yet. First, it encrypts the expected amount using Fhenix CoFHE and registers an invoice commitment onchain. The chain receives ciphertext and a commitment, not the readable invoice amount."

Screen:

- Show pending registration panel.
- Click Register encrypted invoice.
- Show wallet/Privy transaction.
- After success, show QR/link unlocked.

## 1:05-1:25 - Activity Tab

Voiceover:

"The Activity tab keeps generated invoice links and QR codes for this session, so the creator can copy or reopen checkout. Blockchain history is read separately from onchain events, but private invoice context stays off public chain."

Screen:

- Click Activity.
- Show generated invoice card, QR, copy link, open checkout.

## 1:25-1:50 - Payer Checkout

Voiceover:

"The payer opens the checkout link, signs in with email or wallet, and pays. At payment time, SilentPay encrypts the amount again as a CoFHE input to the FHERC20 contract. The payer signs one `encTransfer` transaction."

Screen:

- Open checkout in a new tab.
- Show invoice details.
- Click Pay.
- Show transaction confirmation.
- Show receipt link.

## 1:50-2:00 - Why It Matters

Voiceover:

"SilentPay is different from a normal payment link because the settlement rail is private. Public chain data shows addresses, token contract, transaction hash, and ciphertext handles. The real amount, memo, and receipt context stay between the involved parties."

Screen:

- Show receipt page.
- End on SilentPay dashboard or token tab.

## Short Recording Checklist

- Use a funded Base Sepolia wallet.
- Make sure the payer has FHERC20 balance from Redact.
- Keep the invoice amount small.
- Record at 1080p.
- Do not linger on wallet popups longer than needed.

