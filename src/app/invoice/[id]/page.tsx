"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import {
  baseSepolia,
  createId,
  createPrivacyEnvelope,
  decodeInvoicePayload,
  findInvoice,
  fakeTxHash,
  invoiceLink,
  markInvoicePaid,
  receiptLink,
  saveReceipt,
  shortAddress,
  SilentInvoice,
  SilentReceipt,
  tokenLabel,
} from "@/lib/silentpay";

const hasPrivy = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

export default function InvoicePage() {
  const params = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<SilentInvoice | null>(null);
  const [status, setStatus] = useState<"idle" | "encrypting" | "ready" | "paid">("idle");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    const payload = decodeInvoicePayload(window.location.hash);
    if (payload?.invoice) {
      setInvoice(payload.invoice);
    } else if (params.id) {
      const localInvoice = findInvoice(params.id);
      if (localInvoice) setInvoice(localInvoice);
    }
    setOrigin(window.location.origin);
  }, [params.id]);

  function simulatePayment(payerAddress: string, payerLabel: string) {
    if (!invoice) return;

    setStatus("encrypting");

    setTimeout(() => {
      const receipt: SilentReceipt = {
        id: createId("rcpt"),
        invoiceId: invoice.id,
        merchantName: invoice.merchantName,
        merchantAddress: invoice.merchantAddress,
        payerAddress,
        payerLabel,
        title: invoice.title,
        memo: invoice.memo,
        amount: invoice.amount,
        token: invoice.token,
        txHash: fakeTxHash(invoice.id, payerAddress),
        paidAt: new Date().toISOString(),
        paymentCipher: createPrivacyEnvelope(`${invoice.amount}:${invoice.token}:${payerAddress}`, "payment-amount"),
      };

      saveReceipt(receipt);
      markInvoicePaid(invoice.id);
      setReceiptUrl(receiptLink(window.location.origin, receipt));
      setStatus("paid");
    }, 900);
  }

  if (!invoice) {
    return (
      <main className="center-screen">
        <div className="panel narrow-panel">
          <p className="eyebrow">Missing private payload</p>
          <h1>Invoice details are not available.</h1>
          <p className="muted-text">
            SilentPay links carry private invoice data in the URL fragment. Open the full link shared by the merchant.
          </p>
          <a className="secondary-button" href="/">Back to dashboard</a>
        </div>
      </main>
    );
  }

  return (
    <main className="checkout-shell">
      <a className="brand-lockup" href="/">
        <span className="brand-mark">S</span>
        <span>
          <strong>SilentPay</strong>
          <small>Private invoice checkout</small>
        </span>
      </a>

      <section className="checkout-grid">
        <div className="panel checkout-card">
          <p className="eyebrow">Invoice {invoice.id}</p>
          <h1>{invoice.title}</h1>
          <p className="muted-text">{invoice.memo}</p>
          <div className="amount-line">
            <span>{invoice.amount}</span>
            <strong>{invoice.token}</strong>
          </div>
          <div className="detail-list">
            <p><span>Merchant</span><strong>{invoice.merchantName}</strong></p>
            <p><span>Settlement</span><strong>{shortAddress(invoice.merchantAddress)}</strong></p>
            <p><span>Network</span><strong>{baseSepolia.name}</strong></p>
            <p><span>Token mode</span><strong>{tokenLabel(invoice.token)}</strong></p>
          </div>
          <PayerAction invoice={invoice} status={status} onPay={simulatePayment} />
          {receiptUrl && (
            <div className="receipt-callout">
              <p>Your private receipt is ready.</p>
              <a className="primary-button" href={receiptUrl}>Open receipt</a>
            </div>
          )}
        </div>

        <div className="panel">
          <p className="eyebrow">Under the hood</p>
          <h2>Where FHE happens</h2>
          <ol className="underhood-list">
            <li>SilentPay page resolves the invoice payload and shows details to the payer.</li>
            <li>Client encrypts the payment amount with CoFHE before signing.</li>
            <li>Wallet signs opaque calldata: invoice ID, ciphertext handle, inputProof.</li>
            <li>Contract grants decrypt access to payer and merchant only.</li>
          </ol>
          <pre className="code-block">{`payInvoice(
  invoiceId,
  encryptedAmount,
  inputProof
)`}</pre>
          <a className="secondary-button full-width" href={origin ? invoiceLink(origin, invoice) : `/invoice/${invoice.id}`}>
            Copy-safe invoice route
          </a>
        </div>
      </section>
    </main>
  );
}

function PayerAction({
  invoice,
  status,
  onPay,
}: {
  invoice: SilentInvoice;
  status: "idle" | "encrypting" | "ready" | "paid";
  onPay: (payerAddress: string, payerLabel: string) => void;
}) {
  if (!hasPrivy) {
    return (
      <button
        className="primary-button full-width"
        disabled={status === "encrypting" || status === "paid"}
        onClick={() => onPay("0xDemoPayer000000000000000000000000000000000", "Demo payer")}
      >
        {status === "encrypting" ? "Encrypting demo payment..." : status === "paid" ? "Payment recorded" : `Pay ${invoice.amount} ${invoice.token}`}
      </button>
    );
  }

  return <PrivyPayerAction invoice={invoice} status={status} onPay={onPay} />;
}

function PrivyPayerAction({
  invoice,
  status,
  onPay,
}: {
  invoice: SilentInvoice;
  status: "idle" | "encrypting" | "ready" | "paid";
  onPay: (payerAddress: string, payerLabel: string) => void;
}) {
  const { ready, authenticated, login, user } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0];

  if (!authenticated) {
    return (
      <button className="primary-button full-width" disabled={!ready} onClick={login}>
        Continue with Privy
      </button>
    );
  }

  return (
    <button
      className="primary-button full-width"
      disabled={status === "encrypting" || status === "paid"}
      onClick={() => onPay(wallet?.address || "0xEmbeddedWalletPending", user?.email?.address || "Privy payer")}
    >
      {status === "encrypting" ? "Encrypting and preparing signature..." : status === "paid" ? "Payment recorded" : `Pay ${invoice.amount} ${invoice.token}`}
    </button>
  );
}
