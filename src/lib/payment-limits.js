const MAX_RAZORPAY_ORDER_AMOUNT_PAISE = 50_000_000;

function getRazorpayOrderAmountError(amountPaise) {
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 0) {
    return "The payment amount is invalid.";
  }
  if (amountPaise > MAX_RAZORPAY_ORDER_AMOUNT_PAISE) {
    return "The order total cannot exceed INR 500,000. Lower the ticket price or select fewer tickets.";
  }
  return null;
}

module.exports = { getRazorpayOrderAmountError, MAX_RAZORPAY_ORDER_AMOUNT_PAISE };
