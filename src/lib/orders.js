const mongoose = require("mongoose");
const Event = require("../models/Event");
const Order = require("../models/Order");

async function settlePaidOrder(orderId, paymentId = null) {
  let settledOrder;
  await mongoose.connection.transaction(async (session) => {
    const order = await Order.findById(orderId).session(session);
    if (!order) return;
    if (order.status === "paid") {
      settledOrder = order;
      return;
    }
    if (order.status !== "pending") return;

    const inventory = await Event.updateOne(
      { _id: order.event, ticketsReserved: { $gte: order.quantity } },
      { $inc: { ticketsReserved: -order.quantity, ticketsSold: order.quantity } },
      { session }
    );
    if (inventory.modifiedCount !== 1) throw new Error("The order's reserved ticket inventory could not be settled");

    order.status = "paid";
    order.paidAt = new Date();
    order.paymentId = paymentId;
    await order.save({ session });
    settledOrder = order;
  });
  return settledOrder;
}

async function releasePendingOrder(orderId, status = "expired") {
  let releasedOrder;
  await mongoose.connection.transaction(async (session) => {
    const order = await Order.findOneAndUpdate(
      { _id: orderId, status: "pending" },
      { $set: { status } },
      { new: true, session }
    );
    if (!order) return;
    const inventory = await Event.updateOne(
      { _id: order.event, ticketsReserved: { $gte: order.quantity } },
      { $inc: { ticketsReserved: -order.quantity } },
      { session }
    );
    if (inventory.modifiedCount !== 1) throw new Error("The order's reserved ticket inventory could not be released");
    releasedOrder = order;
  });
  return releasedOrder;
}

module.exports = { releasePendingOrder, settlePaidOrder };