"use client";

import { useEffect, useState } from "react";
import { usePrivy, useSendTransaction, useWallets } from "@privy-io/react-auth";
import { isAddress, numberToHex, type Address } from "viem";
import { createBrowserPaymentClients } from "@/lib/browser-wallet";
import { readFherc20Metadata } from "@/lib/chain-history";
import {
  encodeFherc20TransferCalldata,
  encryptedInputToPrivacyEnvelope,
  encryptInvoiceAmount,
} from "@/lib/fhenix-client";
import {
  baseSepolia,
  createId,
  decodeInvoicePayload,
  PaymentRail,
  PrivacyEnvelope,
  receiptLink,
  shortAddress,
  SilentInvoice,
  SilentReceipt,
} from "@/lib/silentpay";
import { tokenAddress, tokenLabel } from "@/lib/tokens";

const hasPrivy = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);
type CheckoutStatus = "idle" | "encrypting" | "paid";

interface PaymentCompletion {
  payerAddress: string;
  payerLabel: string;
  rail: PaymentRail;
  txHash: string;
  paymentCipher: PrivacyEnvelope;
}

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export default function InvoicePage() {
  const [invoice, setInvoice] = useState<SilentInvoice | null>(null);
  const [status, setStatus] = useState<CheckoutStatus>("idle");
  const [receiptUrl, setReceiptUrl] = useState("");

  useEffect(() => {
    const payload = decodeInvoicePayload(window.location.hash);
    if (payload?.invoice) {
      setInvoice(payload.invoice);
    }
  }, []);

  function recordEncryptedPayment(payment: PaymentCompletion) {
    if (!invoice) return;

    setStatus("encrypting");

    const receipt: SilentReceipt = {
      id: createId("rcpt"),
      invoiceId: invoice.id,
      merchantName: invoice.merchantName,
      merchantAddress: invoice.merchantAddress,
      payerAddress: payment.payerAddress,
      payerLabel: payment.payerLabel,
      title: invoice.title,
      memo: invoice.memo,
      amount: invoice.amount,
      token: invoice.token,
      tokenAddress: invoice.tokenAddress || tokenAddress(invoice.token),
      txHash: payment.txHash,
      paidAt: new Date().toISOString(),
      rail: payment.rail,
      paymentCipher: payment.paymentCipher,
    };

    setReceiptUrl(receiptLink(window.location.origin, receipt));
    setStatus("paid");
  }

  if (!invoice) {
    return (
      <main className="center-screen">
        <div className="panel narrow-panel">
          <p className="eyebrow">Missing private payload</p>
          <h1>Invoice details are not available.</h1>
          <p className="muted-text">
            Open the full private checkout link shared by the invoice creator.
          </p>
          <a className="secondary-button" href="/">Back to dashboard</a>
        </div>
      </main>
    );
  }

  return (
    <main className="checkout-shell">
      <a className="brand-lockup" href="/">
        <span className="brand-mark">S</span>
        <span>
          <strong>SilentPay</strong>
          <small>Private invoice checkout</small>
        </span>
      </a>

      <section className="checkout-grid single-checkout">
        <div className="panel checkout-card">
          <p className="eyebrow">Invoice {invoice.id}</p>
          <h1>{invoice.title}</h1>
          <p className="muted-text">{invoice.memo}</p>
          <div className="amount-line">
            <span>{invoice.amount}</span>
            <strong>{invoice.token}</strong>
          </div>
          <div className="detail-list">
            <p><span>Recipient</span><strong>{invoice.merchantName}</strong></p>
            <p><span>Receiving wallet</span><strong>{shortAddress(invoice.merchantAddress)}</strong></p>
            <p><span>Network</span><strong>{baseSepolia.name}</strong></p>
            <p><span>Token mode</span><strong>{tokenLabel(invoice.token)}</strong></p>
            <p><span>Token contract</span><strong>{shortAddress(invoice.tokenAddress || tokenAddress(invoice.token))}</strong></p>
          </div>
          <PayerAction invoice={invoice} status={status} onPay={recordEncryptedPayment} />
          {receiptUrl && (
            <div className="receipt-callout">
              <p>Your private receipt is ready.</p>
              <a className="primary-button" href={receiptUrl}>Open receipt</a>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function PayerAction({
  invoice,
  status,
  onPay,
}: {
  invoice: SilentInvoice;
  status: CheckoutStatus;
  onPay: (payment: PaymentCompletion) => void;
}) {
  return (
    <div className="payer-actions">
      {hasPrivy ? (
        <PrivyPayerAction invoice={invoice} status={status} onPay={onPay} />
      ) : (
        <div className="chain-callout">
          <strong>Privy is required for real payment signing</strong>
          <p>Add `NEXT_PUBLIC_PRIVY_APP_ID` so payers can continue with email or connect a wallet.</p>
        </div>
      )}
    </div>
  );
}

function PrivyPayerAction({
  invoice,
  status,
  onPay,
}: {
  invoice: SilentInvoice;
  status: CheckoutStatus;
  onPay: (payment: PaymentCompletion) => void;
}) {
  const { ready, authenticated, login, user } = usePrivy();
  const { sendTransaction } = useSendTransaction();
  const { wallets } = useWallets();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const wallet = wallets[0];

  if (!authenticated) {
    return (
      <button className="primary-button full-width" disabled={!ready} onClick={login}>
        Continue with email or wallet
      </button>
    );
  }

  async function payWithPrivyWallet() {
    const selectedTokenAddress = invoice.tokenAddress || tokenAddress(invoice.token);

    if (!wallet?.address) {
      setError("Wallet is still being prepared. Try again in a moment.");
      return;
    }

    if (!isAddress(selectedTokenAddress)) {
      setError("This invoice does not include a valid FHERC20 token address.");
      return;
    }

    if (!isAddress(invoice.merchantAddress)) {
      setError("Receiving wallet is not a valid EVM address.");
      return;
    }

    try {
      setPending(true);
      setError("");

      const payerAddress = wallet.address as Address;
      const merchantAddress = invoice.merchantAddress as Address;
      const walletType = (wallet as { walletClientType?: string }).walletClientType || "";
      const rail: PaymentRail = walletType.startsWith("privy") ? "privy-email-wallet" : "connected-wallet";
      const payerLabel = user?.email?.address || (rail === "connected-wallet" ? "Connected wallet payer" : "Privy email payer");
      await ensureBaseSepolia(wallet);
      const provider = await wallet.getEthereumProvider();
      const clients = createBrowserPaymentClients(provider, payerAddress);
      const tokenMetadata = await readFherc20Metadata(selectedTokenAddress);

      if (!tokenMetadata.isFherc20) {
        throw new Error("Selected invoice token is not an FHERC20 contract.");
      }

      const encryptedAmount = await encryptInvoiceAmount({
        amount: invoice.amount,
        decimals: tokenMetadata.decimals,
        clients,
      });
      const data = encodeFherc20TransferCalldata({
        merchantAddress,
        encryptedAmount,
      });
      const estimatedGas = await clients.publicClient.estimateGas({
        account: payerAddress,
        to: selectedTokenAddress as Address,
        data,
      }).catch(() => undefined);
      const gasLimit = estimatedGas ? (estimatedGas * 12n) / 10n : undefined;
      const txHash = isPrivyEmbeddedWallet(walletType)
        ? (await sendTransaction(
            {
              chainId: baseSepolia.id,
              from: payerAddress,
              to: selectedTokenAddress,
              data,
              ...(gasLimit ? { gasLimit } : {}),
            },
            {
              uiOptions: {
                showWalletUIs: true,
                description: `Pay ${invoice.amount} ${invoice.token} privately with SilentPay.`,
                buttonText: "Confirm payment",
              },
            },
          )).hash
        : await sendConnectedWalletTransaction(provider as Eip1193Provider, {
            from: payerAddress,
            to: selectedTokenAddress as Address,
            data,
            gasLimit,
          });

      onPay({
        payerAddress,
        payerLabel,
        rail,
        txHash,
        paymentCipher: encryptedInputToPrivacyEnvelope(encryptedAmount, "FHERC20 payment amount"),
      });
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "Payment could not be submitted.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        className="primary-button full-width"
        disabled={pending || status === "encrypting" || status === "paid"}
        onClick={payWithPrivyWallet}
      >
        {pending
          ? "Encrypting and signing..."
          : status === "paid"
            ? "Payment recorded"
            : `Pay ${invoice.amount} ${invoice.token}`}
      </button>
      <p className="tiny">
        This signs one encrypted FHERC20 transfer. Email users get a Privy embedded wallet; wallet users sign with their connected wallet.
      </p>
      {error && <p className="tiny error-text">{error}</p>}
    </>
  );
}

function isPrivyEmbeddedWallet(walletClientType: string) {
  return walletClientType === "privy" || walletClientType === "privy-v2";
}

async function ensureBaseSepolia(wallet: {
  chainId?: string;
  switchChain: (targetChainId: number) => Promise<void>;
}) {
  if (isBaseSepoliaChainId(wallet.chainId)) return;

  try {
    await wallet.switchChain(baseSepolia.id);
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Switch your wallet to ${baseSepolia.name} and try again. ${error.message}`
        : `Switch your wallet to ${baseSepolia.name} and try again.`,
    );
  }
}

function isBaseSepoliaChainId(chainId?: string) {
  if (!chainId) return false;
  return chainId === String(baseSepolia.id)
    || chainId.toLowerCase() === numberToHex(baseSepolia.id)
    || chainId.toLowerCase() === `eip155:${baseSepolia.id}`;
}

async function sendConnectedWalletTransaction(
  provider: Eip1193Provider,
  tx: {
    from: Address;
    to: Address;
    data: `0x${string}`;
    gasLimit?: bigint;
  },
) {
  const hash = await provider.request({
    method: "eth_sendTransaction",
    params: [{
      from: tx.from,
      to: tx.to,
      data: tx.data,
      ...(tx.gasLimit ? { gas: numberToHex(tx.gasLimit) } : {}),
    }],
  });

  if (typeof hash !== "string" || !hash.startsWith("0x")) {
    throw new Error("Wallet did not return a transaction hash.");
  }

  return hash as `0x${string}`;
}
