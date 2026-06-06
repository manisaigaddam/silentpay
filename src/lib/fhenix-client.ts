import { encodeFunctionData, keccak256, parseUnits, stringToHex } from "viem";
import type { PrivacyEnvelope } from "./silentpay";

const encryptedUint128Components = [
  { name: "ctHash", type: "uint256" },
  { name: "securityZone", type: "uint8" },
  { name: "utype", type: "uint8" },
  { name: "signature", type: "bytes" },
] as const;

export const silentPayInvoicesAbi = [
  {
    type: "function",
    name: "createInvoice",
    stateMutability: "nonpayable",
    inputs: [
      { name: "invoiceId", type: "bytes32" },
      { name: "invoiceHash", type: "bytes32" },
      { name: "encryptedExpectedAmount", type: "tuple", components: encryptedUint128Components },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "payInvoice",
    stateMutability: "nonpayable",
    inputs: [
      { name: "invoiceId", type: "bytes32" },
      { name: "encryptedAmount", type: "tuple", components: encryptedUint128Components },
      { name: "receiptViewer", type: "address" },
    ],
    outputs: [],
  },
] as const;

export const fherc20Abi = [
  {
    type: "function",
    name: "encTransfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "inValue", type: "tuple", components: encryptedUint128Components },
    ],
    outputs: [{ name: "transferred", type: "bytes32" }],
  },
] as const;

export interface CofheEncryptedInput {
  ctHash: bigint;
  securityZone: number;
  utype: number;
  signature: `0x${string}`;
}

export interface CofhePaymentClients {
  publicClient: unknown;
  walletClient: unknown;
}

export function invoiceIdToBytes32(invoiceId: string) {
  return keccak256(stringToHex(invoiceId));
}

export function invoiceMetadataHash(metadata: string) {
  return keccak256(stringToHex(metadata));
}

export function encodeCreateInvoiceCalldata(params: {
  invoiceId: string;
  metadata: string;
  encryptedExpectedAmount: CofheEncryptedInput;
}) {
  return encodeFunctionData({
    abi: silentPayInvoicesAbi,
    functionName: "createInvoice",
    args: [
      invoiceIdToBytes32(params.invoiceId),
      invoiceMetadataHash(params.metadata),
      params.encryptedExpectedAmount,
    ],
  });
}

export function encodePayInvoiceCalldata(params: {
  invoiceId: string;
  encryptedAmount: CofheEncryptedInput;
  receiptViewer: `0x${string}`;
}) {
  return encodeFunctionData({
    abi: silentPayInvoicesAbi,
    functionName: "payInvoice",
    args: [invoiceIdToBytes32(params.invoiceId), params.encryptedAmount, params.receiptViewer],
  });
}

export function encodeFherc20TransferCalldata(params: {
  merchantAddress: `0x${string}`;
  encryptedAmount: CofheEncryptedInput;
}) {
  return encodeFunctionData({
    abi: fherc20Abi,
    functionName: "encTransfer",
    args: [params.merchantAddress, params.encryptedAmount],
  });
}

export function amountToTokenBaseUnits(amount: string, decimals = 6) {
  return parseUnits(amount, decimals);
}

export function encryptedInputToPrivacyEnvelope(input: CofheEncryptedInput, purpose: string): PrivacyEnvelope {
  return {
    kind: "cofhe-encrypted-input",
    handle: `0x${input.ctHash.toString(16).padStart(64, "0")}`,
    verifierSignature: input.signature,
    note: `${purpose} encrypted with @cofhe/sdk and verified by the SilentPay FHE contract.`,
  };
}

export async function encryptInvoiceAmount(params: {
  amount: string;
  decimals?: number;
  clients: CofhePaymentClients;
}): Promise<CofheEncryptedInput> {
  const { Encryptable } = await import("@cofhe/sdk");
  const { createCofheConfig, createCofheClient } = await import("@cofhe/sdk/web");
  const { chains } = await import("@cofhe/sdk/chains");

  const config = createCofheConfig({
    supportedChains: [chains.baseSepolia],
  });
  const client = createCofheClient(config);

  await client.connect(
    params.clients.publicClient as Parameters<typeof client.connect>[0],
    params.clients.walletClient as Parameters<typeof client.connect>[1],
  );

  const amount = amountToTokenBaseUnits(params.amount, params.decimals ?? 6);
  const [encrypted] = await client.encryptInputs([Encryptable.uint128(amount)]).execute();

  return encrypted as CofheEncryptedInput;
}

export function getSilentPayContractAddress() {
  const address = process.env.NEXT_PUBLIC_SILENTPAY_CONTRACT_ADDRESS;
  return address && address.startsWith("0x") ? (address as `0x${string}`) : null;
}

export function getFherc20Address() {
  const address = process.env.NEXT_PUBLIC_FHERC20_ADDRESS;
  return address && address.startsWith("0x") ? (address as `0x${string}`) : null;
}

export function isContractReady() {
  return Boolean(getSilentPayContractAddress());
}

export function isFherc20Ready() {
  return Boolean(getFherc20Address());
}
