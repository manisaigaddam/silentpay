export type InvoiceStatus = "open" | "paid" | "expired";

import type { TokenSymbol } from "./tokens";

export type { TokenSymbol };

export type PaymentRail = "privy-email-wallet" | "connected-wallet";

export interface PrivacyEnvelope {
  kind: "pending-cofhe-registration" | "cofhe-encrypted-input";
  handle: string;
  verifierSignature: string;
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
  tokenAddress: string;
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
  tokenAddress: string;
  txHash: string;
  paidAt: string;
  rail: PaymentRail;
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
    kind: "pending-cofhe-registration",
    handle: `0x${encoded.padEnd(64, "0").slice(0, 64)}`,
    verifierSignature: `sig_${encodeBase64Url(`${seed}:signature`).slice(0, 32)}`,
    note: "Pending registration. Share the payment link after this value is replaced by a CoFHE encrypted input.",
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

export function shortAddress(address: string) {
  if (!address) return "Not connected";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function railLabel(rail: PaymentRail) {
  if (rail === "privy-email-wallet") return "Privy email wallet";
  return "Connected wallet";
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
