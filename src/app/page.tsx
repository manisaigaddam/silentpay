"use client";

import { useEffect, useState } from "react";
import { usePrivy, useSendTransaction, useWallets } from "@privy-io/react-auth";
import QRCode from "qrcode";
import type { Address } from "viem";
import { createBrowserPaymentClients } from "@/lib/browser-wallet";
import {
  chainInvoiceLabel,
  chainPaymentLabel,
  readChainHistory,
  readFherc20Metadata,
  readTokenBalances,
  type ChainHistory,
  type TokenBalanceRecord,
} from "@/lib/chain-history";
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
} from "@/lib/silentpay";
import { supportedTokens, tokenAddress, type TokenSymbol } from "@/lib/tokens";

const hasPrivy = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

const defaultMerchant = {
  merchantName: "SilentPay User",
  merchantAddress: "",
  title: "Private invoice",
  memo: "Order details visible only to the people involved.",
  amount: "12.50",
  token: "eUSDC" as TokenSymbol,
};

type DashboardTab = "create" | "activity" | "tokens";

interface RecentInvoiceRecord {
  invoice: SilentInvoice;
  link: string;
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [form, setForm] = useState(defaultMerchant);
  const [lastLink, setLastLink] = useState("");
  const [lastInvoice, setLastInvoice] = useState<SilentInvoice | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [copiedInvoiceId, setCopiedInvoiceId] = useState("");
  const [activeTab, setActiveTab] = useState<DashboardTab>("create");
  const [origin, setOrigin] = useState("");
  const [recentInvoices, setRecentInvoices] = useState<RecentInvoiceRecord[]>([]);

  useEffect(() => {
    setMounted(true);
    setOrigin(window.location.origin);
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
      tokenAddress: tokenAddress(form.token),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
      createdAt: new Date().toISOString(),
      status: "open",
      expectedAmountCipher: createPrivacyEnvelope(`${form.amount}:${form.token}`, "invoice-expected-amount"),
    };

    setLastLink("");
    setQrDataUrl("");
    setLastInvoice(invoice);
    upsertRecentInvoice(invoice, "");
  }

  async function copyLink(value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function copyInvoiceLink(invoiceId: string, link: string) {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopiedInvoiceId(invoiceId);
    setTimeout(() => setCopiedInvoiceId(""), 1800);
  }

  function upsertRecentInvoice(invoice: SilentInvoice, link: string) {
    setRecentInvoices(current => [
      { invoice, link },
      ...current.filter(record => record.invoice.id !== invoice.id),
    ].slice(0, 10));
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
          <p className="eyebrow">FHE payment links on Base Sepolia</p>
          <h1>Create private payment links.</h1>
          <p>
            SilentPay registers encrypted invoice amounts with Fhenix CoFHE, then lets the payer settle through a
            confidential FHERC20 transfer from one checkout link or QR.
          </p>
          <div className="hero-actions">
            <button className="primary-button" onClick={() => setActiveTab("create")}>New invoice</button>
            <button className="secondary-button" onClick={() => setActiveTab("activity")}>Activity</button>
          </div>
        </div>
        <div className="signal-panel">
          <ChainStats />
          <div className="network-pill">Running on {baseSepolia.name}</div>
        </div>
      </section>

      <DashboardTabs activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "create" && (
      <section className="section-grid" id="create">
        <div className="panel create-panel">
          <div className="section-heading">
            <p className="eyebrow">Create</p>
            <h2>Register a private invoice</h2>
          </div>
          <div className="form-grid">
            <label>
              Display name
              <input value={form.merchantName} onChange={event => setForm({ ...form, merchantName: event.target.value })} />
            </label>
            <label>
              Receiving wallet
              <MerchantSettlementField
                value={form.merchantAddress}
                onAddressChange={merchantAddress => setForm(current => ({ ...current, merchantAddress }))}
              />
            </label>
            <label>
              Invoice title
              <input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} />
            </label>
            <label>
              Token
              <select value={form.token} onChange={event => setForm({ ...form, token: event.target.value as TokenSymbol })}>
                {supportedTokens.map(token => (
                  <option value={token.symbol} key={token.address}>
                    {token.symbol} - {token.underlying}
                  </option>
                ))}
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
          {lastInvoice && !lastInvoiceRegistered ? (
            <div className="link-result">
              {hasPrivy && (
                <OnchainRegisterPanel
                  invoice={lastInvoice}
                  onRegistered={invoice => {
                    const nextLink = invoiceLink(origin || window.location.origin, invoice);
                    setLastInvoice(invoice);
                    setLastLink(nextLink);
                    upsertRecentInvoice(invoice, nextLink);
                  }}
                />
              )}
              <div className="empty-state compact-empty">
                <span className="ghost-icon">F</span>
                <p>The QR and checkout link unlock only after CoFHE encrypts and registers this invoice.</p>
              </div>
            </div>
          ) : lastLink ? (
            <div className="link-result">
              <div className="qr-box">
                {qrDataUrl ? <img alt="SilentPay QR" src={qrDataUrl} /> : <span className="tiny">Preparing QR...</span>}
              </div>
              <code>{lastInvoice ? `${origin || window.location.origin}/invoice/${lastInvoice.id}#private` : lastLink}</code>
              <div className="button-row">
                <button className="secondary-button" disabled={!lastInvoiceRegistered} onClick={() => copyLink(lastLink)}>
                  {copied ? "Copied" : "Copy link"}
                </button>
                {lastInvoiceRegistered ? (
                  <a className="primary-button" href={lastLink} target="_blank" rel="noreferrer">Open checkout</a>
                ) : (
                  <button className="primary-button" disabled>Register invoice first</button>
                )}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <span className="ghost-icon">#</span>
              <p>Create an invoice. SilentPay will show the link only after FHE registration succeeds.</p>
            </div>
          )}
        </div>
      </section>
      )}

      {activeTab === "activity" && (
      <section className="section-grid">
        <CreatedInvoicesPanel
          copiedInvoiceId={copiedInvoiceId}
          invoices={recentInvoices}
          origin={origin}
          onCopy={copyInvoiceLink}
        />
        <ChainHistoryPanel />
      </section>
      )}

      {activeTab === "tokens" && (
      <section className="section-grid">
        <WalletTokenPanel />
        <TokenRegistryPanel />
      </section>
      )}
    </main>
  );
}

function DashboardTabs({
  activeTab,
  onChange,
}: {
  activeTab: DashboardTab;
  onChange: (tab: DashboardTab) => void;
}) {
  const tabs: Array<{ id: DashboardTab; label: string }> = [
    { id: "create", label: "Create" },
    { id: "activity", label: "Activity" },
    { id: "tokens", label: "Tokens" },
  ];

  return (
    <nav className="tabbar" aria-label="SilentPay workspace">
      {tabs.map(tab => (
        <button
          className={activeTab === tab.id ? "active" : ""}
          key={tab.id}
          onClick={() => onChange(tab.id)}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </nav>
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
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [balances, setBalances] = useState<TokenBalanceRecord[]>([]);
  const [balanceError, setBalanceError] = useState("");
  const address = wallets[0]?.address || "";
  const email = user?.email?.address || "Privy user";

  useEffect(() => {
    if (!authenticated || !address || !open) return;

    readTokenBalances(address)
      .then(setBalances)
      .catch(error => setBalanceError(error instanceof Error ? error.message : "Could not read token balances."));
  }, [authenticated, address, open]);

  async function copyAddress() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!authenticated) {
    return (
      <button className="auth-box auth-button" disabled={!ready} onClick={login}>
        <span className="profile-avatar">S</span>
        <span>
          <strong>Checkout identity</strong>
          <small>Email wallet or connected wallet.</small>
        </span>
      </button>
    );
  }

  return (
    <div className="profile-menu">
      <button className="auth-box auth-button" disabled={!ready} onClick={() => setOpen(value => !value)}>
        <span className="profile-avatar">{email.slice(0, 1).toUpperCase()}</span>
        <span>
          <strong>{email}</strong>
          <small>{shortAddress(address)}</small>
        </span>
      </button>
      {open && (
        <div className="profile-popover">
          <div className="profile-head">
            <span className="profile-avatar large">{email.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{email}</strong>
              <small>{shortAddress(address)}</small>
            </div>
          </div>
          <div className="detail-list compact">
            <p><span>Network</span><strong>{baseSepolia.name}</strong></p>
            <p><span>Wallet</span><strong>{shortAddress(address)}</strong></p>
          </div>
          <div className="button-row">
            <button className="secondary-button" onClick={copyAddress}>{copied ? "Copied" : "Copy address"}</button>
            <button className="secondary-button" onClick={logout}>Sign out</button>
          </div>
          <div className="balance-list">
            <strong>FHERC20 balances</strong>
            {balanceError && <p className="tiny error-text">{balanceError}</p>}
            {balances.length ? (
              balances.map(balance => (
                <div className="balance-row" key={balance.address}>
                  <span>
                    <strong>{balance.symbol}</strong>
                    <small>{balance.name}</small>
                  </span>
                  <span>
                    <strong>{balance.indicatedFormatted}</strong>
                    <small>{balance.encryptedHandle ? `${balance.encryptedHandle.slice(0, 8)}...${balance.encryptedHandle.slice(-6)}` : "No private handle"}</small>
                  </span>
                </div>
              ))
            ) : (
              <p className="tiny">Open profile after wallet is ready to read indicated balances from Base Sepolia.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MerchantSettlementField({
  value,
  onAddressChange,
}: {
  value: string;
  onAddressChange: (address: string) => void;
}) {
  if (!hasPrivy) {
    return <input value={value} readOnly placeholder="Configure Privy first" />;
  }

  return <MerchantSettlementFieldInner value={value} onAddressChange={onAddressChange} />;
}

function MerchantSettlementFieldInner({
  value,
  onAddressChange,
}: {
  value: string;
  onAddressChange: (address: string) => void;
}) {
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const [copied, setCopied] = useState(false);
  const walletAddress = wallets[0]?.address || "";

  useEffect(() => {
    if (authenticated && walletAddress && value !== walletAddress) {
      onAddressChange(walletAddress);
    }
  }, [authenticated, walletAddress, value, onAddressChange]);

  async function copyAddress() {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="address-control">
      <input value={value || "Sign in to use your wallet address"} readOnly />
      <button className="secondary-button" disabled={!value} onClick={copyAddress}>
        {copied ? "Copied" : "Copy"}
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
  const { sendTransaction } = useSendTransaction();
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
      const tokenMetadata = await readFherc20Metadata(invoice.tokenAddress);

      if (!tokenMetadata.isFherc20) {
        throw new Error("Selected settlement token is not an FHERC20 contract.");
      }

      const encryptedExpectedAmount = await encryptInvoiceAmount({
        amount: invoice.amount,
        decimals: tokenMetadata.decimals,
        clients,
      });

      const metadata = JSON.stringify({
        invoiceId: invoice.id,
        merchantName: invoice.merchantName,
        title: invoice.title,
        memo: invoice.memo,
        token: invoice.token,
        tokenAddress: invoice.tokenAddress,
      });

      const data = encodeCreateInvoiceCalldata({
        invoiceId: invoice.id,
        metadata,
        encryptedExpectedAmount,
      });

      const estimatedGas = await clients.publicClient.estimateGas({
        account,
        to: contractAddress,
        data,
      }).catch(() => undefined);
      const { hash } = await sendTransaction(
        {
          chainId: baseSepolia.id,
          from: account,
          to: contractAddress,
          data,
          ...(estimatedGas ? { gasLimit: (estimatedGas * 12n) / 10n } : {}),
        },
        {
          address: account,
          uiOptions: { showWalletUIs: false },
        },
      );

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

function CreatedInvoicesPanel({
  invoices,
  origin,
  copiedInvoiceId,
  onCopy,
}: {
  invoices: RecentInvoiceRecord[];
  origin: string;
  copiedInvoiceId: string;
  onCopy: (invoiceId: string, link: string) => void;
}) {
  return (
    <div className="panel">
      <div className="section-heading">
        <p className="eyebrow">Generated invoices</p>
        <h2>Links and QR for this session</h2>
      </div>
      {invoices.length ? (
        <div className="invoice-list">
          {invoices.map(record => {
            const registered = Boolean(record.link);
            const shortLink = `${origin || "https://silentpay"}/invoice/${record.invoice.id}#private`;

            return (
              <div className="invoice-row" key={record.invoice.id}>
                <div className="invoice-qr">
                  {registered ? <InvoiceQr link={record.link} /> : <span>FHE</span>}
                </div>
                <div className="invoice-main">
                  <div>
                    <strong>{record.invoice.title}</strong>
                    <small>{record.invoice.amount} {record.invoice.token} to {shortAddress(record.invoice.merchantAddress)}</small>
                  </div>
                  <code>{registered ? shortLink : "Encrypt and register this invoice before sharing."}</code>
                  <div className="button-row">
                    <button className="secondary-button" disabled={!registered} onClick={() => onCopy(record.invoice.id, record.link)}>
                      {copiedInvoiceId === record.invoice.id ? "Copied" : "Copy link"}
                    </button>
                    {registered ? (
                      <a className="primary-button" href={record.link} target="_blank" rel="noreferrer">Open checkout</a>
                    ) : (
                      <button className="primary-button" disabled>Awaiting FHE registration</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state compact-empty">
          <span className="ghost-icon">#</span>
          <p>Generated invoice links appear here after you create them in this browser session.</p>
        </div>
      )}
    </div>
  );
}

function InvoiceQr({ link }: { link: string }) {
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(link, {
      width: 128,
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
  }, [link]);

  return qrDataUrl ? <img alt="Invoice QR" src={qrDataUrl} /> : <span>QR</span>;
}

function ChainHistoryPanel() {
  if (!hasPrivy) {
    return (
      <div className="panel">
        <div className="section-heading">
          <p className="eyebrow">Blockchain history</p>
          <h2>Connect Privy to read live records</h2>
        </div>
        <p className="muted-text">Add `NEXT_PUBLIC_PRIVY_APP_ID` so SilentPay can query records for the active wallet.</p>
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
      setError(formatChainHistoryError(historyError));
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
        SilentPay reads invoice events from your contract and encrypted transfer events from supported FHERC20 tokens.
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
              <strong>{payment.tokenSymbol}</strong>
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
          <p className="tiny">No onchain invoices found for this wallet in the scan window.</p>
        )}
      </div>
    </div>
  );
}

function formatChainHistoryError(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message.toLowerCase().includes("rate limit")) {
    return "Base public RPC rate-limited this scan. Try refresh again, or use an Alchemy/QuickNode Base Sepolia RPC URL for reliable history.";
  }

  if (message.toLowerCase().includes("max block range")) {
    return "The RPC rejected a wide log scan. Set NEXT_PUBLIC_SILENTPAY_FROM_BLOCK to your invoice contract deployment block.";
  }

  return "Could not read blockchain history from the current RPC.";
}

function ActivityDetailsPanel() {
  return (
    <div className="panel">
      <div className="section-heading">
        <p className="eyebrow">Private records</p>
        <h2>Invoice and payment visibility</h2>
      </div>
      <div className="detail-list">
        <p><span>Created invoices</span><strong>commitment + encrypted amount</strong></p>
        <p><span>Received payments</span><strong>sender + ciphertext handle</strong></p>
        <p><span>Readable details</span><strong>checkout link or receipt link</strong></p>
        <p><span>Manual decrypt</span><strong>future sealed-decryption action</strong></p>
      </div>
    </div>
  );
}

function WalletTokenPanel() {
  if (!hasPrivy) {
    return (
      <div className="panel">
        <div className="section-heading">
          <p className="eyebrow">Balances</p>
          <h2>Connect to read FHERC20 balances</h2>
        </div>
        <p className="muted-text">Add Privy configuration to read indicated balances for the active wallet.</p>
      </div>
    );
  }

  return <WalletTokenPanelInner />;
}

function WalletTokenPanelInner() {
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const [balances, setBalances] = useState<TokenBalanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const account = wallets[0]?.address;

  async function refreshBalances() {
    if (!authenticated) {
      login();
      return;
    }

    try {
      setLoading(true);
      setError("");
      setBalances(await readTokenBalances(account));
    } catch (balanceError) {
      setError(balanceError instanceof Error ? balanceError.message : "Could not read token balances.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authenticated || !account) return;
    refreshBalances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, account]);

  return (
    <div className="panel">
      <div className="section-heading">
        <p className="eyebrow">Wallet</p>
        <h2>FHERC20 activity indicators</h2>
      </div>
      <p className="muted-text">
        SilentPay settles with confidential token contracts. These indicators prove activity, but they are not the real encrypted balance.
      </p>
      <button className="secondary-button full-width" disabled={loading} onClick={refreshBalances}>
        {loading ? "Reading balances..." : authenticated ? "Refresh balances" : "Sign in to read balances"}
      </button>
      {error && <p className="tiny error-text">{error}</p>}
      <div className="balance-list balance-list-spaced">
        {balances.length ? (
          balances.map(balance => (
            <div className="balance-row" key={balance.address}>
              <span>
                <strong>{balance.symbol}</strong>
                <small>{shortAddress(balance.address)}</small>
              </span>
              <span>
                <strong>{balance.indicatedFormatted}</strong>
                <small>{balance.encryptedHandle ? `${balance.encryptedHandle.slice(0, 8)}...${balance.encryptedHandle.slice(-6)}` : "No private handle"}</small>
              </span>
            </div>
          ))
        ) : (
          <p className="tiny">No FHERC20 balance indicators found for this wallet.</p>
        )}
      </div>
    </div>
  );
}

function TokenRegistryPanel() {
  return (
    <div className="panel">
      <div className="section-heading">
        <p className="eyebrow">Settlement assets</p>
        <h2>Encrypted token rails</h2>
      </div>
      <p className="muted-text">
        Payers first shield public test tokens into these FHERC20 contracts, then SilentPay sends encrypted amounts through `encTransfer`.
      </p>
      <div className="mini-list">
        {supportedTokens.map(token => (
          <div className="mini-row token-row" key={token.address}>
            <span>
              <strong>{token.symbol}</strong>
              <small>{token.name}</small>
            </span>
            <code>{shortAddress(token.address)}</code>
          </div>
        ))}
      </div>
      <div className="button-row faucet-row">
        <a className="secondary-button" href="https://docs.base.org/tools/network-faucets" target="_blank" rel="noreferrer">
          Base Sepolia ETH
        </a>
        <a className="secondary-button" href="https://test.redact.money/" target="_blank" rel="noreferrer">
          Shield tokens
        </a>
      </div>
    </div>
  );
}
