const crypto = require("node:crypto");
const express = require("express");
const mongoose = require("mongoose");
const { z } = require("zod");
const Event = require("../models/Event");
const Order = require("../models/Order");
const { getCapturedPayment, getRazorpay, verifyPaymentSignature } = require("../lib/razorpay");
const { releasePendingOrder, settlePaidOrder } = require("../lib/orders");
const { isTicketSigningConfigured, ticketPresentations } = require("../lib/tickets");
const { optionalAuth } = require("../middleware/auth");

const router = express.Router();
const checkoutInput = z.object({
  eventId: z.string().refine(mongoose.isValidObjectId, "Invalid event"),
  email: z.string().trim().email().max(254),
  quantity: z.number().int().min(1).max(8)
}).strict();
const verificationInput = z.object({
  orderId: z.string().refine(mongoose.isValidObjectId, "Invalid order"),
  razorpay_order_id: z.string().min(1).max(100),
  razorpay_payment_id: z.string().min(1).max(100),
  razorpay_signature: z.string().regex(/^[a-f\d]{64}$/i)
}).strict();

router.post("/session", optionalAuth, async (request, response) => {
  const input = checkoutInput.parse(request.body);
  if (!isTicketSigningConfigured()) {
    return response.status(503).json({ error: "Ticket QR signing is not configured. Please try again later." });
  }
  if (request.user && input.email.toLowerCase() !== request.user.email) {
    return response.status(403).json({ error: "Use the email address on your signed-in account" });
  }
  const event = await Event.findOne({ _id: input.eventId, status: "live", startsAt: { $gt: new Date() } });
  if (!event) return response.status(404).json({ error: "This event is no longer available" });

  const razorpay = event.priceCents > 0 ? getRazorpay() : null;
  const expiresAt = new Date(Date.now() + 40 * 60 * 1000);
  const order = new Order({
    event: event._id,
    email: input.email.toLowerCase(),
    quantity: input.quantity,
    unitPriceCents: event.priceCents,
    totalCents: event.priceCents * input.quantity,
    currency: "inr",
    ticketCode: crypto.randomUUID(),
    expiresAt,
    user: request.user?._id || null
  });

  try {
    await mongoose.connection.transaction(async (session) => {
      await order.save({ session });
      const inventory = await Event.updateOne({
        _id: event._id,
        status: "live",
        startsAt: { $gt: new Date() },
        $expr: { $lte: [{ $add: ["$ticketsSold", "$ticketsReserved", input.quantity] }, "$capacity"] }
      }, { $inc: { ticketsReserved: input.quantity } }, { session });

      if (inventory.modifiedCount !== 1) {
        const error = new Error("There are not enough tickets left for this event");
        error.status = 409;
        throw error;
      }
    });
  } catch (error) {
    if (error.status === 409) return response.status(409).json({ error: error.message });
    throw error;
  }

  try {
    if (event.priceCents === 0) {
      const paidOrder = await settlePaidOrder(order._id);
      return response.status(201).json({
        free: true,
        eventTitle: event.title,
        quantity: paidOrder.quantity,
        ticketCode: paidOrder.ticketCode,
        tickets: await ticketPresentations(paidOrder._id)
      });
    }

    const razorpayOrder = await razorpay.orders.create({
      amount: order.totalCents,
      currency: "INR",
      receipt: order._id.toString(),
      notes: { eventId: event._id.toString(), internalOrderId: order._id.toString() }
    });
    order.razorpayOrderId = razorpayOrder.id;
    await order.save();
    response.status(201).json({
      keyId: process.env.RAZORPAY_KEY_ID,
      orderId: order._id.toString(),
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      eventTitle: event.title,
      quantity: order.quantity,
      email: order.email
    });
  } catch (error) {
    await releasePendingOrder(order._id, "failed");
    if (error.status === 503) return response.status(503).json({ error: error.message });
    throw error;
  }
});

router.post("/verify", optionalAuth, async (request, response) => {
  const input = verificationInput.parse(request.body);
  const order = await Order.findById(input.orderId).populate("event", "title");
  if (!order) return response.status(404).json({ error: "Ticket order not found" });
  if (request.user && order.user?.toString() !== request.user._id.toString()) {
    return response.status(403).json({ error: "This order belongs to a different account" });
  }
  if (order.razorpayOrderId !== input.razorpay_order_id) {
    return response.status(400).json({ error: "Payment does not match this ticket order" });
  }
  if (order.status === "paid") {
    await settlePaidOrder(order._id);
    return response.json({
      status: "paid",
      eventTitle: order.event.title,
      quantity: order.quantity,
      ticketCode: order.ticketCode,
      tickets: await ticketPresentations(order._id)
    });
  }
  if (order.status !== "pending" || order.expiresAt <= new Date()) {
    return response.status(409).json({ error: "This ticket reservation has expired. Please start checkout again." });
  }

  if (!verifyPaymentSignature(input.razorpay_order_id, input.razorpay_payment_id, input.razorpay_signature)) {
    return response.status(400).json({ error: "Razorpay payment signature could not be verified" });
  }

  const payment = await getCapturedPayment(order, input.razorpay_payment_id);
  if (payment.status !== "captured") {
    return response.status(409).json({ error: "Payment has not been captured yet. Please try again shortly." });
  }

  const paidOrder = await settlePaidOrder(order._id, payment.id);
  if (!paidOrder || paidOrder.status !== "paid") {
    return response.status(409).json({ error: "Payment was received, but ticket confirmation is still processing." });
  }
  response.json({
    status: "paid",
    eventTitle: order.event.title,
    quantity: paidOrder.quantity,
    ticketCode: paidOrder.ticketCode,
    tickets: await ticketPresentations(paidOrder._id)
  });
});

module.exports = router;
