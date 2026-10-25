const assert = require("node:assert/strict");
const { test } = require("node:test");
const Event = require("../src/models/Event");
const { serializeEvent } = require("../src/lib/events");

test("event address is stored and returned for venue map links", () => {
  const address = "123 Main St, Portland, Oregon, United States";
  const event = {
    _id: { toString: () => "507f1f77bcf86cd799439011" },
    title: "Neighborhood concert",
    category: "music",
    categoryLabel: "Live music",
    startsAt: new Date("2030-01-01T20:00:00.000Z"),
    timeZone: "America/Los_Angeles",
    venue: "The Redd",
    address,
    city: "Portland",
    state: "OR",
    priceCents: 2000,
    image: "/event-placeholder.svg",
    alt: "A music event",
    capacity: 50,
    ticketsSold: 0,
    ticketsReserved: 0
  };

  assert.ok(Event.schema.path("address"));
  assert.equal(serializeEvent(event).address, address);
});
