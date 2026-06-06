import { createPublicClient, http, isAddress, type Address } from "viem";
import { baseSepolia as baseSepoliaChain } from "viem/chains";
import { baseSepolia, shortAddress } from "./silentpay";
import { fherc20Abi, getSilentPayContractAddress, silentPayInvoicesAbi } from "./fhenix-client";
import { formatTokenAmount, supportedTokens, type TokenSymbol } from "./tokens";

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
  tokenSymbol: TokenSymbol;
  tokenAddress: Address;
}

export interface ChainHistory {
  invoices: ChainInvoiceRecord[];
  payments: ChainPaymentRecord[];
}

export interface TokenBalanceRecord {
  symbol: TokenSymbol;
  address: Address;
  name: string;
  underlying: string;
  indicatedBalance: bigint;
  indicatedFormatted: string;
  encryptedHandle: `0x${string}` | null;
  indicatorTick: bigint | null;
}

export interface Fherc20MetadataRecord {
  address: Address;
  isFherc20: boolean;
  name: string;
  symbol: string;
  decimals: number;
  balanceOfIsIndicator: boolean;
  indicatorTick: bigint | null;
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
  const fromBlock = await resolveFromBlock(client);
  const normalizedAccount = account && isAddress(account) ? (account as Address) : undefined;

  const [invoiceEvents, tokenPaymentGroups] = await Promise.all([
    invoiceContract
      ? client.getContractEvents({
          address: invoiceContract,
          abi: silentPayEventsAbi,
          eventName: "InvoiceCreated",
          args: normalizedAccount ? { merchant: normalizedAccount } : undefined,
          fromBlock,
        })
      : Promise.resolve([]),
    normalizedAccount
      ? Promise.all(
          supportedTokens.map(async token => {
            const [sent, received] = await Promise.all([
              client.getContractEvents({
                address: token.address,
                abi: fherc20EventsAbi,
                eventName: "EncTransfer",
                args: { from: normalizedAccount },
                fromBlock,
              }),
              client.getContractEvents({
                address: token.address,
                abi: fherc20EventsAbi,
                eventName: "EncTransfer",
                args: { to: normalizedAccount },
                fromBlock,
              }),
            ]);

            return { token, events: [...sent, ...received] };
          }),
        )
      : Promise.resolve([]),
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
    payments: tokenPaymentGroups
      .flatMap(group =>
        group.events
          .filter(event => event.args.from && event.args.to && event.args.evalue)
          .map(event => ({
        from: event.args.from as Address,
        to: event.args.to as Address,
        encryptedValue: event.args.evalue as `0x${string}`,
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
            tokenSymbol: group.token.symbol,
            tokenAddress: group.token.address,
          })),
      )
      .filter((event, index, events) => events.findIndex(item => item.transactionHash === event.transactionHash) === index)
      .sort((a, b) => Number(b.blockNumber - a.blockNumber)),
  };
}

export async function readFherc20Metadata(address: string): Promise<Fherc20MetadataRecord> {
  if (!isAddress(address)) {
    throw new Error("Token address is not a valid EVM address.");
  }

  const client = createSilentPayPublicClient();
  const tokenAddress = address as Address;
  const [isFherc20, name, symbol, decimals, balanceOfIsIndicator, indicatorTick] = await Promise.all([
    client.readContract({
      address: tokenAddress,
      abi: fherc20EventsAbi,
      functionName: "isFherc20",
    }),
    client.readContract({
      address: tokenAddress,
      abi: fherc20EventsAbi,
      functionName: "name",
    }),
    client.readContract({
      address: tokenAddress,
      abi: fherc20EventsAbi,
      functionName: "symbol",
    }),
    client.readContract({
      address: tokenAddress,
      abi: fherc20EventsAbi,
      functionName: "decimals",
    }),
    client.readContract({
      address: tokenAddress,
      abi: fherc20EventsAbi,
      functionName: "balanceOfIsIndicator",
    }),
    client.readContract({
      address: tokenAddress,
      abi: fherc20EventsAbi,
      functionName: "indicatorTick",
    }).catch(() => null),
  ]);

  return {
    address: tokenAddress,
    isFherc20,
    name,
    symbol,
    decimals: Number(decimals),
    balanceOfIsIndicator,
    indicatorTick,
  };
}

export async function readTokenBalances(account?: string): Promise<TokenBalanceRecord[]> {
  if (!account || !isAddress(account)) return [];

  const client = createSilentPayPublicClient();
  const owner = account as Address;

  return Promise.all(
    supportedTokens.map(async token => {
      const [indicatedBalance, encryptedHandle, indicatorTick] = await Promise.all([
        client.readContract({
          address: token.address,
          abi: fherc20EventsAbi,
          functionName: "balanceOf",
          args: [owner],
        }),
        client.readContract({
          address: token.address,
          abi: fherc20EventsAbi,
          functionName: "encBalanceOf",
          args: [owner],
        }).catch(() => null),
        client.readContract({
          address: token.address,
          abi: fherc20EventsAbi,
          functionName: "indicatorTick",
        }).catch(() => null),
      ]);

      return {
        symbol: token.symbol,
        address: token.address,
        name: token.name,
        underlying: token.underlying,
        indicatedBalance,
        indicatedFormatted: formatTokenAmount(indicatedBalance, token.symbol),
        encryptedHandle,
        indicatorTick,
      };
    }),
  );
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
