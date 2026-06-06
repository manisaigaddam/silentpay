"use client";

import { useEffect, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import QRCode from "qrcode";
import type { Address } from "viem";
import { createBrowserPaymentClients } from "@/lib/browser-wallet";
import { chainInvoiceLabel, chainPaymentLabel, readChainHistory, type ChainHistory } from "@/lib/chain-history";
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
  shortAddress,
  SilentInvoice,
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
  const [form, setForm] = useState(defaultMerchant);
  const [lastLink, setLastLink] = useState("");
  const [lastInvoice, setLastInvoice] = useState<SilentInvoice | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
          <ChainStats />
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
                    setLastInvoice(invoice);
                    setLastLink(invoiceLink(window.location.origin, invoice));
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
        <ChainHistoryPanel />
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

function ChainStats() {
  if (!hasPrivy) {
    return (
      <>
        <div>
          <span className="metric">0</span>
          <p>Onchain invoices</p>
        </div>
        <div>
          <span className="metric">0</span>
          <p>Encrypted transfers</p>
        </div>
        <div>
          <span className="metric">0</span>
          <p>Live scan window</p>
        </div>
      </>
    );
  }

  return <ChainStatsInner />;
}

function ChainStatsInner() {
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const [history, setHistory] = useState<ChainHistory | null>(null);

  useEffect(() => {
    if (!authenticated) return;
    readChainHistory(wallets[0]?.address).then(setHistory).catch(() => setHistory(null));
  }, [authenticated, wallets]);

  return (
    <>
      <div>
        <span className="metric">{history?.invoices.length ?? 0}</span>
        <p>Onchain invoices</p>
      </div>
      <div>
        <span className="metric">{history?.payments.length ?? 0}</span>
        <p>Encrypted transfers</p>
      </div>
      <div>
        <span className="metric">{authenticated ? "live" : "off"}</span>
        <p>Blockchain history</p>
      </div>
    </>
  );
}

function ChainHistoryPanel() {
  if (!hasPrivy) {
    return (
      <div className="panel">
        <div className="section-heading">
          <p className="eyebrow">Blockchain history</p>
          <h2>Connect Privy to read live records</h2>
        </div>
        <p className="muted-text">Add `NEXT_PUBLIC_PRIVY_APP_ID` so SilentPay can query records for the active merchant or payer.</p>
      </div>
    );
  }

  return <ChainHistoryPanelInner />;
}

function ChainHistoryPanelInner() {
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const [history, setHistory] = useState<ChainHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const account = wallets[0]?.address;

  async function refreshHistory() {
    if (!authenticated) {
      login();
      return;
    }

    try {
      setLoading(true);
      setError("");
      setHistory(await readChainHistory(account));
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : "Could not read blockchain history.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authenticated) return;
    refreshHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, account]);

  return (
    <div className="panel">
      <div className="section-heading">
        <p className="eyebrow">Blockchain history</p>
        <h2>Live records for this wallet</h2>
      </div>
      <p className="muted-text">
        SilentPay reads invoice events from your invoice contract and encrypted transfer events from the FHERC20 token.
      </p>
      <button className="secondary-button full-width" disabled={loading} onClick={refreshHistory}>
        {loading ? "Reading Base Sepolia..." : authenticated ? "Refresh from blockchain" : "Sign in to read history"}
      </button>
      {error && <p className="tiny error-text">{error}</p>}
      <div className="mini-list">
        {history?.payments.length ? (
          history.payments.slice(0, 5).map(payment => (
            <a className="mini-row" href={`${baseSepolia.explorer}/tx/${payment.transactionHash}`} target="_blank" rel="noreferrer" key={payment.transactionHash}>
              <span>{chainPaymentLabel(payment, account)}</span>
              <strong>{history.tokenSymbol}</strong>
            </a>
          ))
        ) : (
          <p className="tiny">No encrypted payment events found for this wallet in the scan window.</p>
        )}
      </div>
      <div className="mini-list">
        {history?.invoices.length ? (
          history.invoices.slice(0, 5).map(invoice => (
            <a className="mini-row" href={`${baseSepolia.explorer}/tx/${invoice.transactionHash}`} target="_blank" rel="noreferrer" key={invoice.transactionHash}>
              <span>{chainInvoiceLabel(invoice)}</span>
              <strong>{shortAddress(invoice.merchant)}</strong>
            </a>
          ))
        ) : (
          <p className="tiny">No onchain invoices found for this merchant wallet in the scan window.</p>
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
