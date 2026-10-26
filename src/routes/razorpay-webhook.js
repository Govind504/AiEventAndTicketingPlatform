const Order = require("../models/Order");
const MovieBooking = require("../models/MovieBooking");
const { getCapturedPayment, verifyWebhookSignature } = require("../lib/razorpay");
const { settlePaidOrder } = require("../lib/orders");
const { settleMovieBooking } = require("../lib/movie-bookings");

async function razorpayWebhook(request, response) {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
    return response.status(503).json({ error: "Razorpay webhook secret is not configured." });
  }
  const signature = request.get("x-razorpay-signature");
  if (!signature || !verifyWebhookSignature(request.body, signature)) {
    return response.status(400).json({ error: "Invalid Razorpay webhook signature" });
  }

  const event = JSON.parse(request.body.toString("utf8"));
  if (event.event !== "payment.captured") return response.json({ received: true });

  const payment = event.payload?.payment?.entity;
  if (!payment?.id || !payment.order_id) return response.status(400).json({ error: "Razorpay webhook is missing payment details" });

  const order = await Order.findOne({ razorpayOrderId: payment.order_id });
  if (order) {
    if (payment.amount !== order.totalCents || payment.currency !== "INR") {
      return response.status(400).json({ error: "Razorpay payment amount does not match the ticket order" });
    }
    const verifiedPayment = await getCapturedPayment(order, payment.id);
    if (
      verifiedPayment.order_id !== order.razorpayOrderId ||
      verifiedPayment.amount !== order.totalCents ||
      verifiedPayment.currency !== "INR" ||
      verifiedPayment.status !== "captured"
    ) {
      return response.status(400).json({ error: "Razorpay payment could not be confirmed" });
    }
    await settlePaidOrder(order._id, verifiedPayment.id);
    return response.json({ received: true });
  }

  const movieBooking = await MovieBooking.findOne({ razorpayOrderId: payment.order_id });
  if (!movieBooking) return response.json({ received: true });
  if (payment.amount !== movieBooking.totalCents || payment.currency !== "INR") {
    return response.status(400).json({ error: "Razorpay payment amount does not match the movie booking" });
  }
  const verifiedPayment = await getCapturedPayment(movieBooking, payment.id);
  if (
    verifiedPayment.order_id !== movieBooking.razorpayOrderId ||
    verifiedPayment.amount !== movieBooking.totalCents ||
    verifiedPayment.currency !== "INR" ||
    verifiedPayment.status !== "captured"
  ) {
    return response.status(400).json({ error: "Razorpay payment could not be confirmed" });
  }
  const paidBooking = await settleMovieBooking(movieBooking._id, verifiedPayment.id);
  if (!paidBooking) return response.status(409).json({ error: "Captured movie payment could not be matched to its seat hold" });
  response.json({ received: true });
}

module.exports = razorpayWebhook;
