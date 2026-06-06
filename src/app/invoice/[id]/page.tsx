"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { isAddress, type Address } from "viem";
import { createBrowserPaymentClients } from "@/lib/browser-wallet";
import {
  encodeFherc20TransferCalldata,
  encryptedInputToPrivacyEnvelope,
  encryptInvoiceAmount,
  getFherc20Address,
  isFherc20Ready,
} from "@/lib/fhenix-client";
import {
  baseSepolia,
  createId,
  decodeInvoicePayload,
  findInvoice,
  invoiceLink,
  markInvoicePaid,
  PaymentRail,
  PrivacyEnvelope,
  receiptLink,
  saveReceipt,
  shortAddress,
  SilentInvoice,
  SilentReceipt,
  tokenDecimals,
  tokenLabel,
} from "@/lib/silentpay";

const hasPrivy = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);
type CheckoutStatus = "idle" | "encrypting" | "paid";

interface PaymentCompletion {
  payerAddress: string;
  payerLabel: string;
  rail: PaymentRail;
  txHash: string;
  paymentCipher: PrivacyEnvelope;
}

export default function InvoicePage() {
  const params = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<SilentInvoice | null>(null);
  const [status, setStatus] = useState<CheckoutStatus>("idle");
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

  function recordEncryptedPayment(payment: PaymentCompletion) {
    if (!invoice) return;

    setStatus("encrypting");

    const receipt: SilentReceipt = {
      id: createId("rcpt"),
      invoiceId: invoice.id,
      merchantName: invoice.merchantName,
      merchantAddress: invoice.merchantAddress,
      payerAddress: payment.payerAddress,
      payerLabel: payment.payerLabel,
      title: invoice.title,
      memo: invoice.memo,
      amount: invoice.amount,
      token: invoice.token,
      txHash: payment.txHash,
      paidAt: new Date().toISOString(),
      rail: payment.rail,
      paymentCipher: payment.paymentCipher,
    };

    saveReceipt(receipt);
    markInvoicePaid(invoice.id);
    setReceiptUrl(receiptLink(window.location.origin, receipt));
    setStatus("paid");
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
          <PayerAction invoice={invoice} status={status} onPay={recordEncryptedPayment} />
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
            <li>SilentPay resolves the private invoice payload in the checkout page.</li>
            <li>The page encrypts the payment amount with CoFHE before any transaction is signed.</li>
            <li>The payer signs one FHERC20 encrypted transfer to the merchant.</li>
            <li>The explorer sees an indicated token movement and ciphertext handle, not the real amount.</li>
          </ol>
          <pre className="code-block">{`FHERC20.encTransfer(
  merchant,
  { ctHash, securityZone, utype, signature }
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
  status: CheckoutStatus;
  onPay: (payment: PaymentCompletion) => void;
}) {
  return (
    <div className="payer-actions">
      {hasPrivy ? (
        <PrivyPayerAction invoice={invoice} status={status} onPay={onPay} />
      ) : (
        <div className="chain-callout">
          <strong>Privy is required for real payment signing</strong>
          <p>Add `NEXT_PUBLIC_PRIVY_APP_ID` so payers can continue with email or connect a wallet.</p>
        </div>
      )}
    </div>
  );
}

function PrivyPayerAction({
  invoice,
  status,
  onPay,
}: {
  invoice: SilentInvoice;
  status: CheckoutStatus;
  onPay: (payment: PaymentCompletion) => void;
}) {
  const { ready, authenticated, login, user } = usePrivy();
  const { wallets } = useWallets();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const wallet = wallets[0];

  if (!authenticated) {
    return (
      <button className="primary-button full-width" disabled={!ready} onClick={login}>
        Continue with email or wallet
      </button>
    );
  }

  async function payWithPrivyWallet() {
    const fherc20Address = getFherc20Address();

    if (!wallet?.address) {
      setError("Wallet is still being prepared. Try again in a moment.");
      return;
    }

    if (!fherc20Address) {
      setError("Missing NEXT_PUBLIC_FHERC20_ADDRESS. Add a deployed FHERC20 token address before testing real payments.");
      return;
    }

    if (!isAddress(invoice.merchantAddress)) {
      setError("Merchant settlement address is not a valid EVM address.");
      return;
    }

    try {
      setPending(true);
      setError("");

      const payerAddress = wallet.address as Address;
      const merchantAddress = invoice.merchantAddress as Address;
      const walletType = (wallet as { walletClientType?: string }).walletClientType || "";
      const rail: PaymentRail = walletType.startsWith("privy") ? "privy-email-wallet" : "connected-wallet";
      const payerLabel = user?.email?.address || (rail === "connected-wallet" ? "Connected wallet payer" : "Privy email payer");
      const provider = await wallet.getEthereumProvider();
      const clients = createBrowserPaymentClients(provider, payerAddress);
      const encryptedAmount = await encryptInvoiceAmount({
        amount: invoice.amount,
        decimals: tokenDecimals(invoice.token),
        clients,
      });
      const data = encodeFherc20TransferCalldata({
        merchantAddress,
        encryptedAmount,
      });
      const txHash = await clients.walletClient.sendTransaction({
        account: payerAddress,
        to: fherc20Address,
        data,
      });

      onPay({
        payerAddress,
        payerLabel,
        rail,
        txHash,
        paymentCipher: encryptedInputToPrivacyEnvelope(encryptedAmount, "FHERC20 payment amount"),
      });
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "Payment could not be submitted.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        className="primary-button full-width"
        disabled={pending || status === "encrypting" || status === "paid"}
        onClick={payWithPrivyWallet}
      >
        {pending
          ? isFherc20Ready()
            ? "Encrypting and signing..."
            : "Configure FHERC20 token"
          : status === "paid"
            ? "Payment recorded"
            : `Pay ${invoice.amount} ${invoice.token}`}
      </button>
      <p className="tiny">
        This signs one encrypted FHERC20 transfer. Email users get a Privy embedded wallet; wallet users sign with their connected wallet.
      </p>
      {error && <p className="tiny error-text">{error}</p>}
    </>
  );
}
