"use client";

import { useEffect, useMemo, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import QRCode from "qrcode";
import type { Address } from "viem";
import { createBrowserPaymentClients } from "@/lib/browser-wallet";
import {
  encodeCreateInvoiceCalldata,
  encryptedInputToPrivacyEnvelope,
  encryptInvoiceAmount,
  getSilentPayContractAddress,
  isContractReady,
} from "@/lib/fhenix-client";
import {
  baseSepolia,
  createId,
  createPrivacyEnvelope,
  invoiceLink,
  readInvoices,
  readReceipts,
  saveInvoice,
  shortAddress,
  SilentInvoice,
  SilentReceipt,
  TokenSymbol,
  tokenDecimals,
  tokenLabel,
} from "@/lib/silentpay";

const hasPrivy = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

const defaultMerchant = {
  merchantName: "SilentPay Merchant",
  merchantAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
  title: "Private invoice",
  memo: "Order details visible only to the payer and merchant.",
  amount: "12.50",
  token: "fhUSDC" as TokenSymbol,
};

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [invoices, setInvoices] = useState<SilentInvoice[]>([]);
  const [receipts, setReceipts] = useState<SilentReceipt[]>([]);
  const [form, setForm] = useState(defaultMerchant);
  const [lastLink, setLastLink] = useState("");
  const [lastInvoice, setLastInvoice] = useState<SilentInvoice | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMounted(true);
    setInvoices(readInvoices());
    setReceipts(readReceipts());
  }, []);

  const openInvoices = invoices.filter(invoice => invoice.status === "open").length;
  const paidInvoices = invoices.filter(invoice => invoice.status === "paid").length;
  const lastInvoiceRegistered = lastInvoice?.expectedAmountCipher.kind === "cofhe-encrypted-input";

  useEffect(() => {
    if (!lastLink) {
      setQrDataUrl("");
      return;
    }

    let active = true;
    QRCode.toDataURL(lastLink, {
      width: 220,
      margin: 1,
      color: {
        dark: "#050505",
        light: "#ffffff",
      },
    }).then(url => {
      if (active) setQrDataUrl(url);
    });

    return () => {
      active = false;
    };
  }, [lastLink]);

  function createInvoice() {
    const invoice: SilentInvoice = {
      id: createId("inv"),
      merchantName: form.merchantName,
      merchantAddress: form.merchantAddress,
      title: form.title,
      memo: form.memo,
      amount: form.amount,
      token: form.token,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
      createdAt: new Date().toISOString(),
      status: "open",
      expectedAmountCipher: createPrivacyEnvelope(`${form.amount}:${form.token}`, "invoice-expected-amount"),
    };

    const link = invoiceLink(window.location.origin, invoice);
    saveInvoice(invoice);
    setInvoices(readInvoices());
    setLastLink(link);
    setLastInvoice(invoice);
  }

  async function copyLink(value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  if (!mounted) {
    return <main className="loading-screen">Loading SilentPay...</main>;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand-lockup" href="/">
          <span className="brand-mark">S</span>
          <span>
            <strong>SilentPay</strong>
            <small>Confidential checkout infrastructure</small>
          </span>
        </a>
        <AuthBlock />
      </header>

      <section className="hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">Base Sepolia / Fhenix-ready / Privy onboarding</p>
          <h1>Private payment links for confidential onchain checkout.</h1>
          <p>
            SilentPay lets merchants issue confidential invoices and lets payers complete them from one link or QR.
            Invoice details, payment amounts, and receipts stay readable only to the parties involved.
          </p>
          <div className="hero-actions">
            <a href="#create" className="primary-button">Create invoice</a>
            <a href="#developer" className="secondary-button">View protocol flow</a>
          </div>
        </div>
        <div className="signal-panel">
          <div>
            <span className="metric">{invoices.length}</span>
            <p>Invoices created</p>
          </div>
          <div>
            <span className="metric">{openInvoices}</span>
            <p>Open invoices</p>
          </div>
          <div>
            <span className="metric">{paidInvoices}</span>
            <p>Paid receipts</p>
          </div>
          <div className="network-pill">Running on {baseSepolia.name}</div>
        </div>
      </section>

      <section className="section-grid" id="create">
        <div className="panel create-panel">
          <div className="section-heading">
            <p className="eyebrow">Merchant</p>
            <h2>Create a private invoice</h2>
          </div>
          <div className="form-grid">
            <label>
              Merchant name
              <input value={form.merchantName} onChange={event => setForm({ ...form, merchantName: event.target.value })} />
            </label>
            <label>
              Merchant settlement address
              <input value={form.merchantAddress} onChange={event => setForm({ ...form, merchantAddress: event.target.value })} />
            </label>
            <label>
              Invoice title
              <input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} />
            </label>
            <label>
              Token
              <select value={form.token} onChange={event => setForm({ ...form, token: event.target.value as TokenSymbol })}>
                <option value="fhUSDC">fhUSDC</option>
                <option value="fhETH">fhETH</option>
              </select>
            </label>
            <label>
              Amount
              <input type="number" min="0" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} />
            </label>
            <label className="wide-field">
              Private memo
              <textarea value={form.memo} onChange={event => setForm({ ...form, memo: event.target.value })} rows={4} />
            </label>
          </div>
          <MerchantCreateButton onCreate={createInvoice} />
        </div>

        <div className="panel">
          <div className="section-heading">
            <p className="eyebrow">Payment link</p>
            <h2>Checkout link and QR</h2>
          </div>
          {lastLink ? (
            <div className="link-result">
              <div className="qr-box">
                {qrDataUrl ? <img alt="SilentPay QR" src={qrDataUrl} /> : <span className="tiny">Preparing QR...</span>}
              </div>
              <code>{lastLink}</code>
              {lastInvoice && hasPrivy && (
                <OnchainRegisterPanel
                  invoice={lastInvoice}
                  onRegistered={invoice => {
                    saveInvoice(invoice);
                    setInvoices(readInvoices());
                    setLastInvoice(invoice);
                  }}
                />
              )}
              <div className="button-row">
                <button className="secondary-button" disabled={!lastInvoiceRegistered} onClick={() => copyLink(lastLink)}>
                  {copied ? "Copied" : "Copy link"}
                </button>
                {lastInvoiceRegistered ? (
                  <a className="primary-button" href={lastLink}>Open checkout</a>
                ) : (
                  <button className="primary-button" disabled>Register invoice first</button>
                )}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <span className="ghost-icon">#</span>
              <p>Create an invoice to get a QR and checkout link.</p>
            </div>
          )}
        </div>
      </section>

      <section className="section-grid">
        <HistoryPanel invoices={invoices} receipts={receipts} />
        <PrivacyPanel />
      </section>

      <section className="panel developer-panel" id="developer">
        <div className="section-heading">
          <p className="eyebrow">Developer layer</p>
          <h2>Integrate private checkout in any app</h2>
        </div>
        <div className="flow-grid">
          <FlowStep index="01" title="Create" text="The merchant creates an invoice. Private metadata is sealed offchain; the contract stores only an invoice commitment and encrypted expected amount." />
          <FlowStep index="02" title="Open" text="The payer opens a SilentPay checkout link or QR. Privy supports email onboarding or a connected wallet." />
          <FlowStep index="03" title="Encrypt" text="The checkout page encrypts payment input with CoFHE and prepares calldata containing the ciphertext handle plus verifier signature." />
          <FlowStep index="04" title="Settle" text="The payer signs one FHERC20 encrypted transfer to the merchant; the real amount remains confidential." />
        </div>
        <pre className="code-block">{`// Intended SDK shape
const invoice = await silentpay.invoices.create({
  amount: "12.50",
  token: "fhUSDC",
  memo: "Private order #1842",
});

<SilentPayCheckout invoiceId={invoice.id} />`}</pre>
      </section>
    </main>
  );
}

function AuthBlock() {
  if (!hasPrivy) {
    return (
      <div className="auth-box">
        <span className="status-dot idle" />
        <div>
          <strong>Privy not configured</strong>
          <small>Add `NEXT_PUBLIC_PRIVY_APP_ID` in `.env.local`.</small>
        </div>
      </div>
    );
  }

  return <PrivyAuthBlock />;
}

function PrivyAuthBlock() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const address = wallets[0]?.address || "";

  return (
    <div className="auth-box">
      <span className={`status-dot ${authenticated ? "live" : "idle"}`} />
      <div>
        <strong>{authenticated ? user?.email?.address || "Privy user" : "Checkout identity"}</strong>
        <small>{authenticated ? shortAddress(address) : "Email wallet or connected wallet."}</small>
      </div>
      <button className="small-button" disabled={!ready} onClick={authenticated ? logout : login}>
        {authenticated ? "Sign out" : "Sign in"}
      </button>
    </div>
  );
}

function MerchantCreateButton({ onCreate }: { onCreate: () => void }) {
  if (!hasPrivy) {
    return (
      <button className="primary-button full-width" disabled>
        Configure Privy to create invoices
      </button>
    );
  }

  return <MerchantCreateButtonInner onCreate={onCreate} />;
}

function MerchantCreateButtonInner({ onCreate }: { onCreate: () => void }) {
  const { ready, authenticated, login } = usePrivy();

  return (
    <button className="primary-button full-width" disabled={!ready} onClick={authenticated ? onCreate : login}>
      {authenticated ? "Generate private payment link" : "Sign in to create invoice"}
    </button>
  );
}

function OnchainRegisterPanel({
  invoice,
  onRegistered,
}: {
  invoice: SilentInvoice;
  onRegistered: (invoice: SilentInvoice) => void;
}) {
  const { ready, authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const [status, setStatus] = useState<"idle" | "encrypting" | "registered" | "error">("idle");
  const [txHash, setTxHash] = useState("");
  const [message, setMessage] = useState("");
  const wallet = wallets[0];
  const contractAddress = getSilentPayContractAddress();

  async function registerEncryptedInvoice() {
    if (!authenticated) {
      login();
      return;
    }

    if (!wallet?.address || !contractAddress) {
      setStatus("error");
      setMessage("Add contract env vars and sign in with a funded Base Sepolia wallet.");
      return;
    }

    try {
      setStatus("encrypting");
      setMessage("Encrypting expected amount and preparing FHE calldata...");

      const provider = await wallet.getEthereumProvider();
      const account = wallet.address as Address;
      const clients = createBrowserPaymentClients(provider, account);
      const encryptedExpectedAmount = await encryptInvoiceAmount({
        amount: invoice.amount,
        decimals: tokenDecimals(invoice.token),
        clients,
      });

      const metadata = JSON.stringify({
        invoiceId: invoice.id,
        merchantName: invoice.merchantName,
        title: invoice.title,
        memo: invoice.memo,
        token: invoice.token,
      });

      const data = encodeCreateInvoiceCalldata({
        invoiceId: invoice.id,
        metadata,
        encryptedExpectedAmount,
      });

      const hash = await clients.walletClient.sendTransaction({
        account,
        to: contractAddress,
        data,
      });

      onRegistered({
        ...invoice,
        expectedAmountCipher: encryptedInputToPrivacyEnvelope(encryptedExpectedAmount, "Invoice expected amount"),
      });
      setTxHash(hash);
      setStatus("registered");
      setMessage("Encrypted invoice registered onchain.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not register encrypted invoice.");
    }
  }

  return (
    <div className="chain-callout">
      <div>
        <strong>{isContractReady() ? "FHE contract path ready" : "FHE contract not configured"}</strong>
        <p>
          Register the invoice commitment and encrypted expected amount before sharing the payment link.
        </p>
      </div>
      <button className="secondary-button full-width" disabled={!ready || status === "encrypting"} onClick={registerEncryptedInvoice}>
        {status === "encrypting" ? "Encrypting invoice..." : status === "registered" ? "Invoice registered" : "Register encrypted invoice"}
      </button>
      {message && <p className={`tiny ${status === "error" ? "error-text" : ""}`}>{message}</p>}
      {txHash && (
        <a className="tiny link-text" href={`${baseSepolia.explorer}/tx/${txHash}`} target="_blank" rel="noreferrer">
          View invoice transaction
        </a>
      )}
    </div>
  );
}

function HistoryPanel({ invoices, receipts }: { invoices: SilentInvoice[]; receipts: SilentReceipt[] }) {
  const recentItems = useMemo(() => [...receipts].slice(0, 4), [receipts]);
  const recentInvoices = useMemo(() => [...invoices].slice(0, 5), [invoices]);

  return (
    <div className="panel">
      <div className="section-heading">
        <p className="eyebrow">Receipts</p>
        <h2>Payment records for both sides</h2>
      </div>
      <p className="muted-text">
        Merchants track invoices they created. Payers keep receipt links for invoices they completed.
      </p>
      <div className="mini-list">
        {recentItems.length ? (
          recentItems.map(receipt => (
            <a className="mini-row" href={`/receipt/${receipt.id}`} key={receipt.id}>
              <span>{receipt.title}</span>
              <strong>{receipt.amount} {receipt.token}</strong>
            </a>
          ))
        ) : (
          <p className="tiny">No receipts yet. Complete an invoice to generate a private receipt link.</p>
        )}
      </div>
      <div className="mini-list">
        {recentInvoices.length ? (
          recentInvoices.map(invoice => (
            <a className="mini-row" href={`/invoice/${invoice.id}`} key={invoice.id}>
              <span>{invoice.title}</span>
              <strong>{invoice.status}</strong>
            </a>
          ))
        ) : (
          <p className="tiny">Created invoices will appear here for the merchant side of the flow.</p>
        )}
      </div>
    </div>
  );
}

function PrivacyPanel() {
  return (
    <div className="panel privacy-panel">
      <div className="section-heading">
        <p className="eyebrow">Explorer view</p>
        <h2>Public chain data vs private payment data</h2>
      </div>
      <div className="privacy-columns">
        <div>
          <h3>Public</h3>
          <ul>
            <li>tx hash, block, gas</li>
            <li>SilentPay contract address</li>
            <li>ciphertext handles and verifier signatures</li>
            <li>signer address unless embedded/abstracted</li>
          </ul>
        </div>
        <div>
          <h3>Private</h3>
          <ul>
            <li>amount and merchant balance</li>
            <li>memo, item, receipt</li>
            <li>payer payment history</li>
            <li>merchant invoice analytics</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function FlowStep({ index, title, text }: { index: string; title: string; text: string }) {
  return (
    <div className="flow-step">
      <span>{index}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
