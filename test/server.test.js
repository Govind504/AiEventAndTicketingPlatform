const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { after, test } = require("node:test");
const app = require("../server");
const { verifyPaymentSignature, verifyWebhookSignature } = require("../src/lib/razorpay");

let server;
let baseUrl;

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("health endpoint reports service status without exposing secrets", async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const response = await fetch(`${baseUrl}/api/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.ok(["connected", "disconnected"].includes(body.database));
  assert.equal(typeof body.checkoutConfigured, "boolean");
  assert.equal(typeof body.ticketQrConfigured, "boolean");
  assert.equal("secret" in body, false);
  assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin-allow-popups");
  const contentSecurityPolicy = response.headers.get("content-security-policy");
  assert.match(contentSecurityPolicy, /https:\/\/cdn\.razorpay\.com/);
  assert.match(contentSecurityPolicy, /https:\/\/lumberjack\.razorpay\.com/);
  assert.match(contentSecurityPolicy, /https:\/\/nominatim\.openstreetmap\.org/);
  assert.match(contentSecurityPolicy, /https:\/\/www\.openstreetmap\.org/);
});

test("unknown API routes return a JSON 404", async () => {
  const response = await fetch(`${baseUrl}/api/not-a-route`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "API route not found" });
});

test("dashboard client script is served", async () => {
  const response = await fetch(`${baseUrl}/dashboard.js`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /javascript/);
});

test("catalog client script and category controls are served", async () => {
  const script = await fetch(`${baseUrl}/catalog.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get("content-type"), /javascript/);
  assert.match(await script.text(), /startMovieCheckout/);
  const page = await fetch(baseUrl);
  const html = await page.text();
  assert.match(html, /data-catalog-type="movies"/);
  assert.match(html, /data-catalog-type="dining"/);
  assert.match(html, /id="movie-seats"/);
  assert.match(html, /id="dining-reservation-form"/);
});

test("home page has a location picker and free Google Maps venue links", async () => {
  const page = await fetch(`${baseUrl}/`);
  const pageHtml = await page.text();
  assert.equal(page.status, 200);
  assert.match(pageHtml, /location-picker-button/);
  assert.match(pageHtml, /location-dialog-title/);
  assert.match(pageHtml, /location-search/);
  assert.match(pageHtml, /current-location-button/);
  assert.match(pageHtml, /current-location-action/);
  assert.match(pageHtml, /hero-carousel-controls/);
  assert.match(pageHtml, /hero-carousel-toggle/);
  assert.match(pageHtml, /location-suggestions/);
  assert.match(pageHtml, /location-map-preview/);
  assert.match(pageHtml, /use-location-button/);
  assert.match(pageHtml, /host-event-address-search/);
  assert.match(pageHtml, /host-event-address-map/);
  assert.match(pageHtml, /name="address"/);
  assert.match(pageHtml, /aria-label="Explore Gather"/);
  assert.match(pageHtml, /class="header-search-link"/);
  assert.match(pageHtml, /data-footer-catalog="movies"/);
  assert.match(pageHtml, /footer-bottom/);
  assert.match(pageHtml, /class="profile-button"[^>]+data-open-account/);
  assert.doesNotMatch(pageHtml.match(/<header class="site-header">([\s\S]*?)<\/header>/)[1], />Dining</);

  const script = await fetch(`${baseUrl}/app.js`);
  const scriptText = await script.text();
  assert.equal(script.status, 200);
  assert.match(scriptText, /gather-location/);
  assert.match(scriptText, /www\.google\.com\/maps\/search/);
  assert.match(scriptText, /nominatim\.openstreetmap\.org\/search/);
  assert.match(scriptText, /nominatim\.openstreetmap\.org\/reverse/);
  assert.match(scriptText, /selectLocation/);
  assert.match(scriptText, /openstreetmap\.org\/export\/embed\.html/);
  assert.match(scriptText, /setHeroSlides/);
  assert.match(scriptText, /6500/);
  const addressSearch = await fetch(`${baseUrl}/address-search.js`);
  assert.equal(addressSearch.status, 200);
  assert.match(await addressSearch.text(), /GatherAddressSearch/);
});

test("organizer dashboard page and script are served", async () => {
  const page = await fetch(`${baseUrl}/dashboard`);
  assert.equal(page.status, 200);
  const pageHtml = await page.text();
  assert.match(pageHtml, /Your events/);
  assert.match(pageHtml, /Your tickets/);
  assert.match(pageHtml, /edit-event-address-search/);
  assert.match(pageHtml, /edit-event-address-map/);

  const script = await fetch(`${baseUrl}/organizer-dashboard.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get("content-type"), /javascript/);
  assert.match(await script.text(), /renderAccountBookings/);
});

test("event placeholder image is served", async () => {
  const response = await fetch(`${baseUrl}/event-placeholder.svg`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /image\/svg\+xml/);
});

test("account, organizer, and administrator dashboards require authentication", async () => {
  for (const route of [
    "/api/account/dashboard",
    "/api/account/saved-events",
    "/api/organizer/dashboard",
    "/api/account/bookings/507f1f77bcf86cd799439011/tickets",
    "/api/admin/dashboard",
    "/api/admin/users?page=1",
    "/api/admin/orders?page=1",
    "/api/admin/catalog",
    "/api/admin/catalog/movies",
    "/api/admin/catalog/movies",
    "/api/catalog/dining-reservations",
    "/api/organizer/events/507f1f77bcf86cd799439011/scan"
  ]) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 401, `${route} should require a signed-in user`);
    assert.deepEqual(await response.json(), { error: "Sign in to continue" });
  }
});

test("logout requires a signed-in user", async () => {
  const response = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST" });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Sign in to continue" });
});

test("scheduled order cleanup requires a configured bearer secret", async () => {
  const oldCronSecret = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  try {
    const response = await fetch(`${baseUrl}/api/maintenance/expire-orders`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "Scheduled maintenance is not configured" });
  } finally {
    if (oldCronSecret !== undefined) process.env.CRON_SECRET = oldCronSecret;
  }
});

test("authentication rejects bearer tokens and requires a MongoDB session cookie", async () => {
  const response = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: "Bearer legacy-token" }
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Sign in to continue" });
});

test("Razorpay payment and webhook signatures are verified with HMAC SHA-256", () => {
  const oldKeySecret = process.env.RAZORPAY_KEY_SECRET;
  const oldWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  process.env.RAZORPAY_KEY_SECRET = "razorpay-test-key-secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = "razorpay-test-webhook-secret";
  try {
    const orderId = "order_test_123";
    const paymentId = "pay_test_456";
    const paymentSignature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`).digest("hex");
    assert.equal(verifyPaymentSignature(orderId, paymentId, paymentSignature), true);
    assert.equal(verifyPaymentSignature(orderId, paymentId, "0".repeat(64)), false);
    assert.equal(verifyPaymentSignature(orderId, paymentId, "invalid"), false);

    const body = Buffer.from(JSON.stringify({ event: "payment.captured" }));
    const webhookSignature = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest("hex");
    assert.equal(verifyWebhookSignature(body, webhookSignature), true);
    assert.equal(verifyWebhookSignature(body, "0".repeat(64)), false);
  } finally {
    if (oldKeySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = oldKeySecret;
    if (oldWebhookSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
    else process.env.RAZORPAY_WEBHOOK_SECRET = oldWebhookSecret;
  }
});

test("Razorpay webhook reports missing configuration explicitly", async () => {
  const oldWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
  try {
    const response = await fetch(`${baseUrl}/api/razorpay/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "payment.captured" })
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "Razorpay webhook secret is not configured." });
  } finally {
    if (oldWebhookSecret !== undefined) process.env.RAZORPAY_WEBHOOK_SECRET = oldWebhookSecret;
  }
});