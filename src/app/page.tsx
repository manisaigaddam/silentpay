"use client";

import { useEffect, useMemo, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
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
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMounted(true);
    setInvoices(readInvoices());
    setReceipts(readReceipts());
  }, []);

  const openInvoices = invoices.filter(invoice => invoice.status === "open").length;
  const paidInvoices = invoices.filter(invoice => invoice.status === "paid").length;

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
            <p>Invoices created locally</p>
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
                <option value="USDC">USDC public fallback</option>
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
          <button className="primary-button full-width" onClick={createInvoice}>Generate private payment link</button>
        </div>

        <div className="panel">
          <div className="section-heading">
            <p className="eyebrow">Payment link</p>
            <h2>Checkout link and QR</h2>
          </div>
          {lastLink ? (
            <div className="link-result">
              <div className="qr-box">
                <img alt="SilentPay QR" src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(lastLink)}`} />
              </div>
              <code>{lastLink}</code>
              <div className="button-row">
                <button className="secondary-button" onClick={() => copyLink(lastLink)}>{copied ? "Copied" : "Copy link"}</button>
                <a className="primary-button" href={lastLink}>Open checkout</a>
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
          <FlowStep index="02" title="Open" text="The payer opens a SilentPay checkout link or QR. Privy can create an embedded wallet for users without an existing wallet." />
          <FlowStep index="03" title="Encrypt" text="The checkout page encrypts payment input with CoFHE and prepares calldata containing ciphertext plus inputProof." />
          <FlowStep index="04" title="Settle" text="The contract records encrypted payment state and grants decrypt access only to the payer and merchant." />
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
        <small>{authenticated ? shortAddress(address) : "Email, social login, embedded wallet, or wallet."}</small>
      </div>
      <button className="small-button" disabled={!ready} onClick={authenticated ? logout : login}>
        {authenticated ? "Sign out" : "Sign in"}
      </button>
    </div>
  );
}

function HistoryPanel({ invoices, receipts }: { invoices: SilentInvoice[]; receipts: SilentReceipt[] }) {
  const recentItems = useMemo(() => [...receipts].slice(0, 4), [receipts]);

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
        {invoices.slice(0, 3).map(invoice => (
          <a className="mini-row" href={`/invoice/${invoice.id}`} key={invoice.id}>
            <span>{invoice.title}</span>
            <strong>{invoice.status}</strong>
          </a>
        ))}
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
            <li>ciphertext handles/inputProof</li>
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
