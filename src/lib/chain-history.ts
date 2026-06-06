import { createPublicClient, http, isAddress, type Address } from "viem";
import { baseSepolia as baseSepoliaChain } from "viem/chains";
import { baseSepolia, shortAddress } from "./silentpay";
import { fherc20Abi, getFherc20Address, getSilentPayContractAddress, silentPayInvoicesAbi } from "./fhenix-client";

const silentPayEventsAbi = [
  ...silentPayInvoicesAbi,
  {
    type: "event",
    name: "InvoiceCreated",
    inputs: [
      { name: "invoiceId", type: "bytes32", indexed: true },
      { name: "merchant", type: "address", indexed: true },
      { name: "invoiceHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "InvoiceSettled",
    inputs: [{ name: "invoiceId", type: "bytes32", indexed: true }],
  },
] as const;

const fherc20EventsAbi = [
  ...fherc20Abi,
  {
    type: "event",
    name: "EncTransfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "evalue", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

export interface ChainInvoiceRecord {
  invoiceId: `0x${string}`;
  invoiceHash: `0x${string}`;
  merchant: Address;
  transactionHash: `0x${string}`;
  blockNumber: bigint;
}

export interface ChainPaymentRecord {
  from: Address;
  to: Address;
  encryptedValue: `0x${string}`;
  transactionHash: `0x${string}`;
  blockNumber: bigint;
}

export interface ChainHistory {
  invoices: ChainInvoiceRecord[];
  payments: ChainPaymentRecord[];
  tokenSymbol: string;
}

export function createSilentPayPublicClient() {
  const rpcUrl = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || baseSepolia.rpcUrl;

  return createPublicClient({
    chain: baseSepoliaChain,
    transport: http(rpcUrl),
  });
}

export async function readChainHistory(account?: string): Promise<ChainHistory> {
  const client = createSilentPayPublicClient();
  const invoiceContract = getSilentPayContractAddress();
  const fherc20 = getFherc20Address();
  const fromBlock = await resolveFromBlock(client);
  const normalizedAccount = account && isAddress(account) ? (account as Address) : undefined;

  const [invoiceEvents, sentPayments, receivedPayments, tokenSymbol] = await Promise.all([
    invoiceContract
      ? client.getContractEvents({
          address: invoiceContract,
          abi: silentPayEventsAbi,
          eventName: "InvoiceCreated",
          args: normalizedAccount ? { merchant: normalizedAccount } : undefined,
          fromBlock,
        })
      : Promise.resolve([]),
    fherc20 && normalizedAccount
      ? client.getContractEvents({
          address: fherc20,
          abi: fherc20EventsAbi,
          eventName: "EncTransfer",
          args: { from: normalizedAccount },
          fromBlock,
        })
      : Promise.resolve([]),
    fherc20 && normalizedAccount
      ? client.getContractEvents({
          address: fherc20,
          abi: fherc20EventsAbi,
          eventName: "EncTransfer",
          args: { to: normalizedAccount },
          fromBlock,
        })
      : Promise.resolve([]),
    fherc20
      ? client.readContract({
          address: fherc20,
          abi: fherc20EventsAbi,
          functionName: "symbol",
        }).catch(() => "FHERC20")
      : Promise.resolve("FHERC20"),
  ]);

  return {
    invoices: invoiceEvents
      .filter(event => event.args.invoiceId && event.args.invoiceHash && event.args.merchant)
      .map(event => ({
        invoiceId: event.args.invoiceId as `0x${string}`,
        invoiceHash: event.args.invoiceHash as `0x${string}`,
        merchant: event.args.merchant as Address,
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
      }))
      .sort((a, b) => Number(b.blockNumber - a.blockNumber)),
    payments: [...sentPayments, ...receivedPayments]
      .filter(event => event.args.from && event.args.to && event.args.evalue)
      .map(event => ({
        from: event.args.from as Address,
        to: event.args.to as Address,
        encryptedValue: event.args.evalue as `0x${string}`,
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
      }))
      .filter((event, index, events) => events.findIndex(item => item.transactionHash === event.transactionHash) === index)
      .sort((a, b) => Number(b.blockNumber - a.blockNumber)),
    tokenSymbol,
  };
}

export function chainInvoiceLabel(invoice: ChainInvoiceRecord) {
  return `Invoice ${invoice.invoiceId.slice(0, 8)}...${invoice.invoiceId.slice(-6)}`;
}

export function chainPaymentLabel(payment: ChainPaymentRecord, account?: string) {
  const isOutgoing = account && payment.from.toLowerCase() === account.toLowerCase();
  return isOutgoing ? `Paid ${shortAddress(payment.to)}` : `Received from ${shortAddress(payment.from)}`;
}

async function resolveFromBlock(client: ReturnType<typeof createSilentPayPublicClient>) {
  const configured = process.env.NEXT_PUBLIC_SILENTPAY_FROM_BLOCK;
  if (configured && /^\d+$/.test(configured)) return BigInt(configured);

  const current = await client.getBlockNumber();
  const scanWindow = BigInt(process.env.NEXT_PUBLIC_SILENTPAY_SCAN_BLOCKS || "100000");
  return current > scanWindow ? current - scanWindow : 0n;
}
