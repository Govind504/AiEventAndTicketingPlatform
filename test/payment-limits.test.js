const assert = require("node:assert/strict");
const { test } = require("node:test");
const { getRazorpayOrderAmountError, MAX_RAZORPAY_ORDER_AMOUNT_PAISE } = require("../src/lib/payment-limits");

test("Razorpay order amount validation permits amounts up to INR 500,000", () => {
  assert.equal(MAX_RAZORPAY_ORDER_AMOUNT_PAISE, 50_000_000);
  assert.equal(getRazorpayOrderAmountError(0), null);
  assert.equal(getRazorpayOrderAmountError(MAX_RAZORPAY_ORDER_AMOUNT_PAISE), null);
  assert.equal(getRazorpayOrderAmountError(MAX_RAZORPAY_ORDER_AMOUNT_PAISE + 1), "The order total cannot exceed INR 500,000. Lower the ticket price or select fewer tickets.");
});

test("Razorpay order amount validation rejects invalid amounts", () => {
  assert.equal(getRazorpayOrderAmountError(-1), "The payment amount is invalid.");
  assert.equal(getRazorpayOrderAmountError(Number.MAX_SAFE_INTEGER + 1), "The payment amount is invalid.");
});
