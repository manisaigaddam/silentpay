# SilentPay Fhenix Contracts

`SilentPayInvoices.sol` is the first onchain target for the app.

It is intentionally scoped to encrypted invoice accounting:

- merchant creates an invoice with encrypted expected amount
- payer submits encrypted paid amount
- contract accumulates paid amount with `FHE.add`
- decrypt access is granted only to merchant, payer, and optional receipt viewer
- public events reveal invoice/payment activity, not payment amount or memo

Next contract step:

1. Add FHERC20 settlement once the exact token interface is selected.
2. Add encrypted paid-enough checks and optional public fulfillment signal.
3. Add tests for permission boundaries and receipt access.
4. Deploy to the Fhenix-supported testnet path used by the hackathon resources.
