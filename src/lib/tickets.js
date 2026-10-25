const crypto = require("node:crypto");
const QRCode = require("qrcode");
const Ticket = require("../models/Ticket");

function ticketSecret() {
  const secret = process.env.TICKET_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    const error = new Error("Ticket QR signing is not configured. Set TICKET_SIGNING_SECRET to a random secret of at least 32 characters.");
    error.status = 503;
    throw error;
  }
  return secret;
}

function isTicketSigningConfigured() {
  return Boolean(process.env.TICKET_SIGNING_SECRET && process.env.TICKET_SIGNING_SECRET.length >= 32);
}

function ticketPayload(ticketId) {
  const signature = crypto.createHmac("sha256", ticketSecret()).update(ticketId).digest("hex");
  return `gather-ticket:${ticketId}.${signature}`;
}

function parseTicketPayload(payload) {
  if (typeof payload !== "string") return null;
  const match = /^gather-ticket:([a-f\d]{24})\.([a-f\d]{64})$/i.exec(payload);
  if (!match) return null;

  const expected = Buffer.from(crypto.createHmac("sha256", ticketSecret()).update(match[1]).digest("hex"), "hex");
  const received = Buffer.from(match[2], "hex");
  return expected.length === received.length && crypto.timingSafeEqual(expected, received)
    ? match[1]
    : null;
}

async function createOrderTickets(order, session) {
  const tickets = Array.from({ length: order.quantity }, (_, index) => ({
    order: order._id,
    event: order.event,
    number: index + 1
  }));
  return Ticket.insertMany(tickets, { session });
}

async function ticketPresentations(orderId) {
  const tickets = await Ticket.find({ order: orderId }).sort({ number: 1 }).lean();
  return Promise.all(tickets.map(async (ticket) => {
    const code = ticketPayload(ticket._id.toString());
    return {
      number: ticket.number,
      code,
      qrCode: await QRCode.toDataURL(code, { errorCorrectionLevel: "M", margin: 1, width: 240 }),
      checkedInAt: ticket.checkedInAt
    };
  }));
}

module.exports = { createOrderTickets, isTicketSigningConfigured, parseTicketPayload, ticketPayload, ticketPresentations };
