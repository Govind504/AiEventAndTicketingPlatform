require("dotenv").config({ quiet: true });

const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const Event = require("../src/models/Event");
const User = require("../src/models/User");

const events = [
  { slug: "sundown-sessions", title: "Sundown Sessions", category: "music", categoryLabel: "Live music", startsAt: "2026-10-24T19:00:00-07:00", venue: "The Redd", city: "Portland", state: "OR", priceCents: 2800, image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=850&q=80", alt: "Live music and warm stage lights", capacity: 180, status: "live" },
  { slug: "night-market-pdx", title: "Night Market PDX", category: "food", categoryLabel: "Food & drink", startsAt: "2026-10-25T17:00:00-07:00", venue: "Waterfront Park", city: "Portland", state: "OR", priceCents: 1200, image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=850&q=80", alt: "A warmly lit neighborhood restaurant", capacity: 300, status: "live" },
  { slug: "the-print-club", title: "The Print Club", category: "art", categoryLabel: "Art & culture", startsAt: "2026-10-26T11:00:00-07:00", venue: "Independent Publishing Resource Center", city: "Portland", state: "OR", priceCents: 1800, image: "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=850&q=80", alt: "Creative tools laid out for an art workshop", capacity: 36, status: "live" },
  { slug: "forest-bathing-club", title: "Forest Bathing Club", category: "outdoors", categoryLabel: "Outdoors", startsAt: "2026-10-26T09:00:00-07:00", venue: "Hoyt Arboretum", city: "Portland", state: "OR", priceCents: 1600, image: "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=850&q=80", alt: "A sunlit trail winding through a green forest", capacity: 24, status: "live" },
  { slug: "after-hours-jazz", title: "After Hours Jazz", category: "music", categoryLabel: "Live music", startsAt: "2026-10-28T20:30:00-07:00", venue: "The 1905", city: "Portland", state: "OR", priceCents: 2200, image: "https://images.unsplash.com/photo-1511192336575-5a79af67a629?auto=format&fit=crop&w=850&q=80", alt: "A jazz musician playing under stage lights", capacity: 90, status: "live" },
  { slug: "a-very-local-supper", title: "A Very Local Supper", category: "food", categoryLabel: "Food & drink", startsAt: "2026-10-30T18:30:00-07:00", venue: "Montelupo", city: "Portland", state: "OR", priceCents: 4200, image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=850&q=80", alt: "A seasonal meal served at a candlelit table", capacity: 28, status: "live" },
  { slug: "short-film-big-feelings", title: "Short Film, Big Feelings", category: "art", categoryLabel: "Art & culture", startsAt: "2026-11-01T19:30:00-08:00", venue: "Tomorrow Theater", city: "Portland", state: "OR", priceCents: 1400, image: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=850&q=80", alt: "Rows of seats in a small independent cinema", capacity: 110, status: "live" },
  { slug: "sunday-river-ride", title: "Sunday River Ride", category: "outdoors", categoryLabel: "Outdoors", startsAt: "2026-11-02T10:00:00-08:00", venue: "Tilikum Crossing", city: "Portland", state: "OR", priceCents: 0, image: "https://images.unsplash.com/photo-1507035895480-2b3156c31fc8?auto=format&fit=crop&w=850&q=80", alt: "Cyclists enjoying a ride through the city", capacity: 75, status: "live" },
  { slug: "rose-city-indie-night", title: "Rose City Indie Night", category: "music", categoryLabel: "Live music", startsAt: "2026-11-08T19:00:00-08:00", venue: "Mississippi Studios", city: "Portland", state: "OR", priceCents: 2400, image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=850&q=80", alt: "An indie band performing beneath colorful stage lights", capacity: 140, status: "live" },
  { slug: "acoustic-rooftop-evening", title: "Acoustic Rooftop Evening", category: "music", categoryLabel: "Live music", startsAt: "2026-11-22T18:30:00-08:00", venue: "The Society Hotel", city: "Portland", state: "OR", priceCents: 1900, image: "https://images.unsplash.com/photo-1511192336575-5a79af67a629?auto=format&fit=crop&w=850&q=80", alt: "A musician playing an intimate acoustic set", capacity: 70, status: "live" },
  { slug: "winter-brass-social", title: "Winter Brass Social", category: "music", categoryLabel: "Live music", startsAt: "2026-12-06T19:30:00-08:00", venue: "Alberta Abbey", city: "Portland", state: "OR", priceCents: 2600, image: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=850&q=80", alt: "A lively concert crowd enjoying a brass band", capacity: 160, status: "live" },
  { slug: "portland-dumpling-crawl", title: "Portland Dumpling Crawl", category: "food", categoryLabel: "Food & drink", startsAt: "2026-11-07T12:00:00-08:00", venue: "Lan Su Chinese Garden", city: "Portland", state: "OR", priceCents: 2200, image: "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=850&q=80", alt: "Fresh dumplings served at a neighborhood food gathering", capacity: 90, status: "live" },
  { slug: "harvest-table-supper", title: "Harvest Table Supper", category: "food", categoryLabel: "Food & drink", startsAt: "2026-11-14T18:00:00-08:00", venue: "The Evergreen", city: "Portland", state: "OR", priceCents: 3800, image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=850&q=80", alt: "A seasonal harvest dinner set around a communal table", capacity: 40, status: "live" },
  { slug: "winter-cocoa-and-bakes", title: "Winter Cocoa & Bakes", category: "food", categoryLabel: "Food & drink", startsAt: "2026-12-05T14:00:00-08:00", venue: "Portland Saturday Market", city: "Portland", state: "OR", priceCents: 1200, image: "https://images.unsplash.com/photo-1481391319762-47dff72954d9?auto=format&fit=crop&w=850&q=80", alt: "Freshly baked pastries and warm drinks at a winter market", capacity: 120, status: "live" },
  { slug: "clay-and-coffee-workshop", title: "Clay & Coffee Workshop", category: "art", categoryLabel: "Art & culture", startsAt: "2026-11-08T10:00:00-08:00", venue: "Radius Studio", city: "Portland", state: "OR", priceCents: 3200, image: "https://images.unsplash.com/photo-1565193298595-6c5c5a2a1c21?auto=format&fit=crop&w=850&q=80", alt: "Handmade ceramics arranged in an artist studio", capacity: 24, status: "live" },
  { slug: "gallery-after-dark", title: "Gallery After Dark", category: "art", categoryLabel: "Art & culture", startsAt: "2026-11-21T18:00:00-08:00", venue: "Portland Art Museum", city: "Portland", state: "OR", priceCents: 1600, image: "https://images.unsplash.com/photo-1577083552431-6e5fd01aa342?auto=format&fit=crop&w=850&q=80", alt: "A contemporary art exhibition in a softly lit gallery", capacity: 100, status: "live" },
  { slug: "winter-zine-and-print-fair", title: "Winter Zine & Print Fair", category: "art", categoryLabel: "Art & culture", startsAt: "2026-12-12T11:00:00-08:00", venue: "The Redd", city: "Portland", state: "OR", priceCents: 800, image: "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=850&q=80", alt: "Handmade prints and zines displayed at an art fair", capacity: 130, status: "live" },
  { slug: "columbia-gorge-waterfall-hike", title: "Columbia Gorge Waterfall Hike", category: "outdoors", categoryLabel: "Outdoors", startsAt: "2026-11-07T09:00:00-08:00", venue: "Latourell Falls Trailhead", city: "Corbett", state: "OR", priceCents: 1000, image: "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=850&q=80", alt: "A forest trail leading through the Columbia River Gorge", capacity: 30, status: "live" },
  { slug: "willamette-river-cleanup", title: "Willamette River Cleanup", category: "outdoors", categoryLabel: "Outdoors", startsAt: "2026-11-15T09:30:00-08:00", venue: "Sellwood Riverfront Park", city: "Portland", state: "OR", priceCents: 0, image: "https://images.unsplash.com/photo-1507035895480-2b3156c31fc8?auto=format&fit=crop&w=850&q=80", alt: "Volunteers gathering outdoors beside a river", capacity: 60, status: "live" },
  { slug: "mount-hood-stargazing", title: "Mount Hood Stargazing", category: "outdoors", categoryLabel: "Outdoors", startsAt: "2026-12-04T20:00:00-08:00", venue: "Trillium Lake Day Use Area", city: "Government Camp", state: "OR", priceCents: 1400, image: "https://images.unsplash.com/photo-1475274047050-1d0c0975c63e?auto=format&fit=crop&w=850&q=80", alt: "A clear night sky filled with stars above a mountain lake", capacity: 35, status: "live" }
];

const categoryNames = {
  music: "Music",
  food: "Food",
  art: "Art",
  outdoors: "Outdoors"
};
const originalEventSlugs = new Set([
  "sundown-sessions",
  "night-market-pdx",
  "the-print-club",
  "forest-bathing-club",
  "after-hours-jazz",
  "a-very-local-supper",
  "short-film-big-feelings",
  "sunday-river-ride"
]);
const addedEvents = events.filter((event) => !originalEventSlugs.has(event.slug));
const resetOrganizerPasswords = process.argv.includes("--reset-organizer-passwords");

async function getOrCreateOrganizer(category, categoryEvents) {
  const existingEvent = await Event.findOne({ slug: categoryEvents[0].slug }).select("organizer").lean();
  if (existingEvent?.organizer) {
    const existingUser = await User.findById(existingEvent.organizer);
    if (existingUser) {
      if (!resetOrganizerPasswords) return { user: existingUser, credentials: null };
      const password = crypto.randomBytes(24).toString("base64url");
      existingUser.passwordHash = await bcrypt.hash(password, 12);
      await existingUser.save();
      return { user: existingUser, credentials: { email: existingUser.email, password } };
    }
  }

  const email = `gather-${category}-${crypto.randomBytes(6).toString("hex")}@example.test`;
  const password = crypto.randomBytes(24).toString("base64url");
  const user = await User.create({
    name: `Gather ${categoryNames[category]} Organizer`,
    email,
    passwordHash: await bcrypt.hash(password, 12),
    role: "organizer"
  });
  return { user, credentials: { email, password } };
}

async function seed() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");
  await mongoose.connect(process.env.MONGODB_URI);

  const credentials = [];
  for (const category of Object.keys(categoryNames)) {
    const categoryEvents = addedEvents.filter((event) => event.category === category);
    const { user, credentials: accountCredentials } = await getOrCreateOrganizer(category, categoryEvents);
    if (accountCredentials) credentials.push({ category, ...accountCredentials });

    for (const event of categoryEvents) {
      const { slug, ...data } = event;
      await Event.updateOne(
        { slug },
        { $setOnInsert: { ...data, slug, startsAt: new Date(data.startsAt), organizer: user._id } },
        { upsert: true }
      );
      await Event.updateOne({ slug, organizer: null }, { $set: { organizer: user._id } });
    }
  }

  console.log(`Seeded ${addedEvents.length} additional Gather events (existing event details were left unchanged).`);
  if (credentials.length) {
    console.log("Organizer credentials (save these now; passwords are not recoverable):");
    for (const account of credentials) {
      console.log(`${account.category}: email=${account.email} password=${account.password}`);
    }
  } else {
    console.log("Organizer accounts already exist; no passwords were changed or displayed.");
  }
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await mongoose.disconnect();
});