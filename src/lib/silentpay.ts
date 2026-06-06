export type InvoiceStatus = "open" | "paid" | "expired";

export type TokenSymbol = "fhUSDC" | "fhETH" | "USDC";

export interface PrivacyEnvelope {
  kind: "local-preview-seal" | "cofhe-encrypted-input";
  handle: string;
  inputProof: string;
  note: string;
}

export interface SilentInvoice {
  id: string;
  merchantName: string;
  merchantAddress: string;
  title: string;
  memo: string;
  amount: string;
  token: TokenSymbol;
  expiresAt: string;
  createdAt: string;
  status: InvoiceStatus;
  expectedAmountCipher: PrivacyEnvelope;
}

export interface SilentReceipt {
  id: string;
  invoiceId: string;
  merchantName: string;
  merchantAddress: string;
  payerAddress: string;
  payerLabel: string;
  title: string;
  memo: string;
  amount: string;
  token: TokenSymbol;
  txHash: string;
  paidAt: string;
  paymentCipher: PrivacyEnvelope;
}

export interface InvoicePayload {
  version: 1;
  invoice: SilentInvoice;
}

export interface ReceiptPayload {
  version: 1;
  receipt: SilentReceipt;
}

const invoiceKey = "silentpay.invoices.v1";
const receiptKey = "silentpay.receipts.v1";

export const baseSepolia = {
  id: 84532,
  name: "Base Sepolia",
  rpcUrl: "https://sepolia.base.org",
  explorer: "https://sepolia.basescan.org",
  currency: "ETH",
};

export function createId(prefix: string) {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replaceAll("-", "").slice(0, 12)
      : Math.random().toString(16).slice(2, 14);

  return `${prefix}_${id}`;
}

export function createPrivacyEnvelope(value: string, purpose: string): PrivacyEnvelope {
  const seed = `${purpose}:${value}:${Date.now()}:${Math.random()}`;
  const encoded = encodeBase64Url(seed);

  return {
    kind: "local-preview-seal",
    handle: `0x${encoded.padEnd(64, "0").slice(0, 64)}`,
    inputProof: `proof_${encodeBase64Url(`${seed}:proof`).slice(0, 32)}`,
    note: "Local preview seal. The onchain path uses @cofhe/sdk encrypted input plus inputProof.",
  };
}

export function encodeInvoicePayload(invoice: SilentInvoice) {
  return encodeBase64Url(JSON.stringify({ version: 1, invoice } satisfies InvoicePayload));
}

export function decodeInvoicePayload(hash: string): InvoicePayload | null {
  return decodePayload<InvoicePayload>(hash, 1);
}

export function encodeReceiptPayload(receipt: SilentReceipt) {
  return encodeBase64Url(JSON.stringify({ version: 1, receipt } satisfies ReceiptPayload));
}

export function decodeReceiptPayload(hash: string): ReceiptPayload | null {
  return decodePayload<ReceiptPayload>(hash, 1);
}

export function invoiceLink(origin: string, invoice: SilentInvoice) {
  return `${origin}/invoice/${invoice.id}#${encodeInvoicePayload(invoice)}`;
}

export function receiptLink(origin: string, receipt: SilentReceipt) {
  return `${origin}/receipt/${receipt.id}#${encodeReceiptPayload(receipt)}`;
}

export function saveInvoice(invoice: SilentInvoice) {
  const invoices = readInvoices();
  writeStorage(invoiceKey, [invoice, ...invoices.filter(item => item.id !== invoice.id)]);
}

export function readInvoices(): SilentInvoice[] {
  return readStorage<SilentInvoice[]>(invoiceKey, []);
}

export function findInvoice(invoiceId: string) {
  return readInvoices().find(invoice => invoice.id === invoiceId);
}

export function markInvoicePaid(invoiceId: string) {
  const invoices = readInvoices();
  writeStorage(
    invoiceKey,
    invoices.map(invoice => (invoice.id === invoiceId ? { ...invoice, status: "paid" } : invoice)),
  );
}

export function saveReceipt(receipt: SilentReceipt) {
  const receipts = readReceipts();
  writeStorage(receiptKey, [receipt, ...receipts.filter(item => item.id !== receipt.id)]);
}

export function readReceipts(): SilentReceipt[] {
  return readStorage<SilentReceipt[]>(receiptKey, []);
}

export function shortAddress(address: string) {
  if (!address) return "Not connected";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function fakeTxHash(invoiceId: string, payerAddress: string) {
  const seed = encodeBase64Url(`${invoiceId}:${payerAddress}:${Date.now()}:${Math.random()}`);
  return `0x${seed.padEnd(64, "0").slice(0, 64)}`;
}

export function tokenLabel(token: TokenSymbol) {
  if (token === "fhUSDC") return "fhUSDC private stablecoin";
  if (token === "fhETH") return "fhETH private native-style token";
  return "USDC public fallback";
}

function decodePayload<T extends { version: number }>(hash: string, version: number): T | null {
  const cleaned = hash.replace(/^#/, "").trim();
  if (!cleaned) return null;

  try {
    const parsed = JSON.parse(decodeBase64Url(cleaned)) as T;
    return parsed.version === version ? parsed : null;
  } catch {
    return null;
  }
}

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function encodeBase64Url(value: string) {
  if (typeof window === "undefined") {
    return Buffer.from(value, "utf8").toString("base64url");
  }

  return btoa(unescape(encodeURIComponent(value)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function decodeBase64Url(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");

  if (typeof window === "undefined") {
    return Buffer.from(padded, "base64").toString("utf8");
  }

  return decodeURIComponent(escape(atob(padded)));
}
