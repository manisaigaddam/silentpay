import { encodeFunctionData, keccak256, stringToHex } from "viem";

export const silentPayInvoicesAbi = [
  {
    type: "function",
    name: "createInvoice",
    stateMutability: "nonpayable",
    inputs: [
      { name: "invoiceId", type: "bytes32" },
      { name: "invoiceHash", type: "bytes32" },
      { name: "encryptedExpectedAmount", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "payInvoice",
    stateMutability: "nonpayable",
    inputs: [
      { name: "invoiceId", type: "bytes32" },
      { name: "encryptedAmount", type: "bytes" },
      { name: "receiptViewer", type: "address" },
    ],
    outputs: [],
  },
] as const;

export interface CofheEncryptedInput {
  data: `0x${string}`;
  inputProof: `0x${string}`;
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
      params.encryptedExpectedAmount.data,
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
    args: [invoiceIdToBytes32(params.invoiceId), params.encryptedAmount.data, params.receiptViewer],
  });
}

// Production encryption hook:
// 1. initialize @cofhe/sdk for the active Fhenix environment
// 2. encrypt amount in token base units as euint128
// 3. pass returned { data, inputProof } into the calldata builders above
// 4. submit with Privy embedded wallet or external wallet signer
