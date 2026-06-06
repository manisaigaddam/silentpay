"use client";

import { useEffect, useState } from "react";
import { decodeReceiptPayload, railLabel, shortAddress, SilentReceipt } from "@/lib/silentpay";

export default function ReceiptPage() {
  const [receipt, setReceipt] = useState<SilentReceipt | null>(null);

  useEffect(() => {
    const payload = decodeReceiptPayload(window.location.hash);
    if (payload?.receipt) {
      setReceipt(payload.receipt);
    }
  }, []);

  if (!receipt) {
    return (
      <main className="center-screen">
        <div className="panel narrow-panel">
          <p className="eyebrow">Private receipt</p>
          <h1>Receipt payload missing.</h1>
          <p className="muted-text">Open the full receipt link generated after checkout.</p>
          <a className="secondary-button" href="/">Back to dashboard</a>
        </div>
      </main>
    );
  }

  return (
    <main className="center-screen">
      <div className="panel receipt-card">
        <p className="eyebrow">SilentPay receipt {receipt.id}</p>
        <h1>{receipt.title}</h1>
        <div className="amount-line">
          <span>{receipt.amount}</span>
          <strong>{receipt.token}</strong>
        </div>
        <div className="detail-list">
          <p><span>Merchant</span><strong>{receipt.merchantName}</strong></p>
          <p><span>Payer</span><strong>{receipt.payerLabel}</strong></p>
          <p><span>Merchant address</span><strong>{shortAddress(receipt.merchantAddress)}</strong></p>
          <p><span>Payer address</span><strong>{shortAddress(receipt.payerAddress)}</strong></p>
          <p><span>Token contract</span><strong>{shortAddress(receipt.tokenAddress)}</strong></p>
          <p><span>Payment rail</span><strong>{railLabel(receipt.rail)}</strong></p>
          <p><span>Paid at</span><strong>{new Date(receipt.paidAt).toLocaleString()}</strong></p>
        </div>
        <div className="sealed-box">
          <span>Explorer-visible ciphertext handle</span>
          <code>{receipt.paymentCipher.handle}</code>
        </div>
        <div className="sealed-box">
          <span>Transaction reference</span>
          <code>{receipt.txHash}</code>
        </div>
        <p className="muted-text">
          Receipts are opened through SilentPay because the explorer can only show transaction metadata and ciphertext.
          The payer and merchant keep the readable payment context.
        </p>
        <a className="secondary-button full-width" href="/">Back to dashboard</a>
      </div>
    </main>
  );
}
