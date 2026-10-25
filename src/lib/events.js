function serializeEvent(event) {
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: event.timeZone,
    month: "short",
    day: "2-digit"
  });
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: event.timeZone,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  });
  const parts = Object.fromEntries(dateFormatter.formatToParts(event.startsAt).map(({ type, value }) => [type, value]));

  return {
    id: event._id.toString(),
    title: event.title,
    category: event.category,
    categoryLabel: event.categoryLabel,
    date: parts.day,
    month: parts.month.toUpperCase(),
    startsAt: event.startsAt.toISOString(),
    time: timeFormatter.format(event.startsAt),
    timeZone: event.timeZone,
    venue: `${event.venue} · ${event.city}`,
    city: event.city,
    state: event.state,
    priceCents: event.priceCents,
    currency: "INR",
    image: event.image,
    alt: event.alt,
    capacity: event.capacity,
    ticketsAvailable: Math.max(0, event.capacity - event.ticketsSold - event.ticketsReserved)
  };
}

module.exports = { serializeEvent };