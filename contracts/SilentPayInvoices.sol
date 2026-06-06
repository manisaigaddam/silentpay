// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";

/// @title SilentPayInvoices
/// @notice Encrypted invoice accounting for SilentPay private checkout.
/// @dev This contract stores invoice/payment amounts as Fhenix encrypted values.
contract SilentPayInvoices {
    struct Invoice {
        address merchant;
        bytes32 invoiceHash;
        euint128 expectedAmount;
        euint128 paidAmount;
        bool exists;
        bool settled;
    }

    mapping(bytes32 => Invoice) private _invoices;

    event InvoiceCreated(bytes32 indexed invoiceId, address indexed merchant, bytes32 invoiceHash);
    event PaymentRecorded(bytes32 indexed invoiceId, address indexed payer, address indexed receiptViewer);
    event InvoiceSettled(bytes32 indexed invoiceId);

    error InvoiceAlreadyExists();
    error InvoiceNotFound();
    error NotMerchant();
    error AlreadySettled();

    function createInvoice(
        bytes32 invoiceId,
        bytes32 invoiceHash,
        InEuint128 calldata encryptedExpectedAmount
    ) external {
        if (_invoices[invoiceId].exists) revert InvoiceAlreadyExists();

        euint128 expectedAmount = FHE.asEuint128(encryptedExpectedAmount);
        euint128 zeroPaid = FHE.asEuint128(0);

        Invoice storage invoice = _invoices[invoiceId];
        invoice.merchant = msg.sender;
        invoice.invoiceHash = invoiceHash;
        invoice.expectedAmount = expectedAmount;
        invoice.paidAmount = zeroPaid;
        invoice.exists = true;

        FHE.allowThis(invoice.expectedAmount);
        FHE.allow(invoice.expectedAmount, msg.sender);
        FHE.allowThis(invoice.paidAmount);
        FHE.allow(invoice.paidAmount, msg.sender);

        emit InvoiceCreated(invoiceId, msg.sender, invoiceHash);
    }

    function payInvoice(
        bytes32 invoiceId,
        InEuint128 calldata encryptedAmount,
        address receiptViewer
    ) external {
        Invoice storage invoice = _requireInvoice(invoiceId);
        if (invoice.settled) revert AlreadySettled();

        euint128 amount = FHE.asEuint128(encryptedAmount);
        invoice.paidAmount = FHE.add(invoice.paidAmount, amount);

        FHE.allowThis(invoice.paidAmount);
        FHE.allow(invoice.paidAmount, invoice.merchant);
        FHE.allow(invoice.paidAmount, msg.sender);

        if (receiptViewer != address(0) && receiptViewer != msg.sender) {
            FHE.allow(invoice.paidAmount, receiptViewer);
        }

        emit PaymentRecorded(invoiceId, msg.sender, receiptViewer);
    }

    function settleInvoice(bytes32 invoiceId) external {
        Invoice storage invoice = _requireInvoice(invoiceId);
        if (msg.sender != invoice.merchant) revert NotMerchant();
        if (invoice.settled) revert AlreadySettled();

        invoice.settled = true;
        emit InvoiceSettled(invoiceId);
    }

    function getInvoicePublic(bytes32 invoiceId)
        external
        view
        returns (address merchant, bytes32 invoiceHash, bool settled)
    {
        Invoice storage invoice = _requireInvoice(invoiceId);
        return (invoice.merchant, invoice.invoiceHash, invoice.settled);
    }

    function getMerchantEncryptedAmounts(bytes32 invoiceId)
        external
        view
        returns (euint128 expectedAmount, euint128 paidAmount)
    {
        Invoice storage invoice = _requireInvoice(invoiceId);
        if (msg.sender != invoice.merchant) revert NotMerchant();
        return (invoice.expectedAmount, invoice.paidAmount);
    }

    function _requireInvoice(bytes32 invoiceId) private view returns (Invoice storage invoice) {
        invoice = _invoices[invoiceId];
        if (!invoice.exists) revert InvoiceNotFound();
    }
}
