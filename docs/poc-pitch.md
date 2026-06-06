# SilentPay POC Pitch

## One-liner

SilentPay is a private payment-link layer for Fhenix: creators register encrypted invoices, payers open one link, and settlement happens through confidential FHERC20 transfers.

## Problem

Onchain payments are easy to verify but terrible for commerce privacy. A normal payment link leaks payer activity, recipient revenue, payment amount, and business context to anyone reading the chain.

## What SilentPay Builds

SilentPay gives any user or app a Stripe-like private checkout flow:

- create a payment request with amount, token, recipient wallet, and memo
- encrypt the invoice amount with Fhenix CoFHE before registration
- share a QR/link only after FHE registration succeeds
- let the payer settle with one encrypted FHERC20 transfer
- keep readable invoice and receipt context between the involved parties

## What Is Actually Encrypted

SilentPay does not encrypt a normal ERC20 at payment time. The payment asset is already an FHERC20 token, which stores balances as encrypted values. SilentPay encrypts the transfer amount input so the FHERC20 contract can update encrypted balances without revealing the amount.

Flow:

1. User gets Base Sepolia ETH for gas.
2. User shields mock ERC20 into an FHERC20 token through Redact.
3. SilentPay creates an invoice for `eUSDC`, `eUSDT`, or `ePYUSD`.
4. Checkout encrypts the amount with CoFHE.
5. Payer signs `encTransfer(recipient, encryptedAmount)`.

## Why FHERC20 Instead Of Normal ERC20

Normal ERC20 balances and transfer amounts are public. If SilentPay accepted normal ERC20 and only encrypted invoice text, the actual payment would still leak onchain.

FHERC20 is the privacy rail:

- balances are encrypted
- transfer amount is encrypted
- standard `transfer` and `approve` are intentionally disabled
- `encTransfer` and `encTransferFrom` are the confidential transfer methods

## Product Flow

Creator:

1. Sign in with Privy.
2. Enter display name, receiving wallet, amount, token, and memo.
3. Register invoice. SilentPay encrypts expected amount with CoFHE and writes only commitment plus encrypted amount to the invoice contract.
4. After successful registration, SilentPay generates the QR/link.
5. Activity tab keeps the generated link/QR for the current session.

Payer:

1. Opens the checkout link or scans QR.
2. Sees invoice details from the private link payload.
3. Continues with Privy email wallet or connected wallet.
4. SilentPay encrypts the payment amount.
5. Payer signs one FHERC20 encrypted transfer.
6. Receipt link is generated with tx hash and private context.

## Public vs Private

Public:

- transaction hash
- block and gas
- payer and recipient addresses
- SilentPay invoice contract
- selected FHERC20 token contract
- ciphertext handles
- indicated FHERC20 activity values

Private:

- true payment amount
- real encrypted balance
- memo and order context
- receipt context
- readable link payload unless shared

## Current POC Scope

Implemented:

- Next.js app with Privy login
- invoice creation and CoFHE amount encryption
- invoice contract registration
- QR/link unlocked only after FHE registration
- FHERC20 token registry for `eUSDC`, `eUSDT`, `ePYUSD`
- checkout payment with FHERC20 `encTransfer`
- current-session invoice Activity with QR/link
- chunked blockchain event reads for free RPC limits

Next:

- encrypted metadata storage so private invoice links survive refresh/device changes
- router contract using `encTransferFrom` + EIP712 permit for invoice settlement and paid-state update in one payer flow
- sealed decryption actions for user-approved receipt/balance reveal
- faucet shortcut or direct Redact integration for smoother test funding

## Testing Funds

- Base Sepolia ETH for gas: https://docs.base.org/docs/tools/network-faucets/
- Shield assets into FHERC20: https://test.redact.money/

