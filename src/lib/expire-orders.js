const Order = require("../models/Order");
const { releasePendingOrder } = require("./orders");

async function expirePendingOrders() {
  const expiredOrders = await Order.find({ status: "pending", expiresAt: { $lte: new Date() } })
    .select("_id")
    .limit(100)
    .lean();
  let expired = 0;
  for (const order of expiredOrders) {
    if (await releasePendingOrder(order._id, "expired")) expired += 1;
  }
  return expired;
}

module.exports = expirePendingOrders;
