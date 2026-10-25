const crypto = require("node:crypto");
const Razorpay = require("razorpay");

let razorpayClient;

function isRazorpayConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

function getRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    const error = new Error("Razorpay checkout is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env.");
    error.status = 503;
    throw error;
  }
  if (!razorpayClient) razorpayClient = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return razorpayClient;
}

function signaturesMatch(expected, received) {
  if (typeof received !== "string" || !/^[a-f\d]{64}$/i.test(received)) return false;
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");
  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function verifyPaymentSignature(orderId, paymentId, signature) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) {
    const error = new Error("Razorpay checkout is not configured.");
    error.status = 503;
    throw error;
  }
  const expected = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  return signaturesMatch(expected, signature);
}

function verifyWebhookSignature(body, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    const error = new Error("Razorpay webhook secret is not configured.");
    error.status = 503;
    throw error;
  }
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return signaturesMatch(expected, signature);
}

async function getCapturedPayment(order, paymentId) {
  const payment = await getRazorpay().payments.fetch(paymentId);
  if (
    payment.order_id !== order.razorpayOrderId ||
    payment.amount !== order.totalCents ||
    payment.currency !== "INR"
  ) {
    const error = new Error("Razorpay payment details do not match this ticket order");
    error.status = 400;
    throw error;
  }
  if (payment.status === "authorized") {
    const capturedPayment = await getRazorpay().payments.capture(payment.id, order.totalCents, "INR");
    if (capturedPayment.status !== "captured") {
      const error = new Error("Razorpay payment has not been captured.");
      error.status = 409;
      throw error;
    }
    return capturedPayment;
  }
  return payment;
}

module.exports = { getCapturedPayment, getRazorpay, isRazorpayConfigured, verifyPaymentSignature, verifyWebhookSignature };
