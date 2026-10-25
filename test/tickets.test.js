const assert = require("node:assert/strict");
const { test } = require("node:test");
const { parseTicketPayload, ticketPayload } = require("../src/lib/tickets");

test("ticket QR payloads are signed and reject tampering", () => {
  const oldSecret = process.env.TICKET_SIGNING_SECRET;
  process.env.TICKET_SIGNING_SECRET = "ticket-signing-test-secret-with-at-least-32-characters";
  try {
    const ticketId = "507f1f77bcf86cd799439011";
    const payload = ticketPayload(ticketId);
    assert.equal(parseTicketPayload(payload), ticketId);
    assert.equal(parseTicketPayload(`${payload.slice(0, -1)}0`), null);
    assert.equal(parseTicketPayload("gather-ticket:not-an-id.invalid"), null);
  } finally {
    if (oldSecret === undefined) delete process.env.TICKET_SIGNING_SECRET;
    else process.env.TICKET_SIGNING_SECRET = oldSecret;
  }
});

test("ticket QR signing fails explicitly when its secret is missing", () => {
  const oldSecret = process.env.TICKET_SIGNING_SECRET;
  delete process.env.TICKET_SIGNING_SECRET;
  try {
    assert.throws(() => ticketPayload("507f1f77bcf86cd799439011"), {
      message: /TICKET_SIGNING_SECRET/
    });
  } finally {
    if (oldSecret !== undefined) process.env.TICKET_SIGNING_SECRET = oldSecret;
  }
});
