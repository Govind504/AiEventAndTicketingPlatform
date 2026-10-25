# Gather

Gather is an event discovery and ticketing app built with Node.js, Express, MongoDB, and Razorpay Checkout. MongoDB is a NoSQL document database; this project does not use a SQL database.

## Run locally

Requirements: Node.js 20+, Docker Desktop, and a Razorpay account. From PowerShell in this folder:

```powershell
Copy-Item .env.example .env
```

Add your Razorpay test key ID and secret to `.env` as `RAZORPAY_KEY_ID=rzp_test_...` and `RAZORPAY_KEY_SECRET=...`. Keep credentials private; `.env` is ignored by Git.

Start MongoDB as a single-node replica set (required for atomic ticket inventory and payment fulfillment). The example uses host port `27018` to avoid colliding with a local MongoDB service on `27017`; the direct-connection URI is verified to support replica-set transactions:

```powershell
docker compose up -d
npm install
npm run seed
npm run dev
```

Open <http://localhost:3000>. Razorpay test keys create test payments; use test payment instruments from the Razorpay Dashboard documentation. To receive payment confirmations through webhooks, add a webhook endpoint in the Razorpay Dashboard pointing to `/api/razorpay/webhook`, subscribe to `payment.captured`, copy its webhook secret to `.env` as `RAZORPAY_WEBHOOK_SECRET`, and restart the app. For local webhook testing, expose the app with a trusted HTTPS tunnel and configure that public URL in the Razorpay Dashboard.

Paid events use INR; event prices are stored in paise (100 paise = ₹1). Free events can be reserved without Razorpay credentials.

The sample event dates are seeded once. The seed script includes three events in each of the four categories and creates one organizer account per category for those events. Newly generated organizer emails and passwords are printed by `npm run seed`; save them securely because only password hashes are stored. Re-running the script leaves existing event details and passwords unchanged. To generate new passwords for the seeded organizer accounts, run `npm run seed -- --reset-organizer-passwords`. To reset only the MongoDB development data, stop the app and run `docker compose down -v`, then repeat the seed steps.

## Included flows

- Public event listing, search, category filtering, and price sorting from MongoDB.
- Registration data, bcrypt password hashes, and server-managed authentication sessions stored in MongoDB. The browser receives only an HttpOnly session cookie; each request is authenticated against the MongoDB session and user records.
- Role-based dashboards for clients, event organizers, and administrators.
- A dedicated organizer dashboard with the organizer's event list, event editing, ticket sales, and paid revenue.
- A location picker on the home page searches addresses, previews the selected suggestion on an OpenStreetMap map, and filters events by its city and state; address suggestions use OpenStreetMap's public Nominatim service, and event cards link to Google Maps without requiring an API key. The search sends the entered address to Nominatim, whose public endpoint is rate-limited and intended for modest traffic; use a dedicated geocoding provider or self-hosted service if usage grows.
- Each confirmed seat receives its own signed QR ticket. Organizers can scan tickets for their own events from the organizer dashboard; QR codes are single-use, and duplicate scans are rejected.
- Administrator overview of all accounts, events, orders, platform revenue, and event editing.
- Self-service organizer access, event publishing, drafts, event editing, and cancellation.
- Guest or signed-in ticket checkout through Razorpay Standard Checkout, with UPI highlighted and other Razorpay-enabled payment methods retained. Payment signatures and captured payments are verified server-side before tickets are confirmed; signed-in orders appear in the client's booking history.
- Signed-in clients' saved events are stored in MongoDB with their account.
- Each confirmed seat receives its own signed QR ticket. Organizers can scan tickets for their own events from the organizer dashboard; QR codes are single-use, and duplicate scans are rejected.
- Signed Razorpay webhook verification, idempotent ticket fulfillment, capacity holds, and periodic cleanup of expired holds.
- Free reservations, health endpoint, request validation, security headers, and basic auth/checkout rate limits.

## Deploy to Vercel

This project includes a Vercel serverless API entry point and routing configuration. Import the repository into Vercel or run `npx vercel` from the project directory. The root page and browser assets are served as static files; `/api/*` requests are routed to the Express function.

Configure these environment variables in Vercel for Production (and Preview if needed):

- `MONGODB_URI`: a MongoDB Atlas connection string to a replica-set-capable cluster. Transactions are required for ticket inventory and payment fulfillment.
- `APP_URL`: the deployed site origin, such as `https://your-domain.example`.
- `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`: use test credentials first, then switch to live credentials for production payments.
- `RAZORPAY_WEBHOOK_SECRET`: the webhook signing secret configured in Razorpay.
- `CRON_SECRET`: a long, random secret used to authorize scheduled expired-order cleanup.
- `TICKET_SIGNING_SECRET`: a separate random secret of at least 32 characters used to sign ticket QR codes. Keep it stable; changing it invalidates QR codes already issued.

Generate `TICKET_SIGNING_SECRET` locally with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`, then set it in the local `.env` and Vercel's Production environment variables before accepting bookings. Never commit or share this value.

Customers see one QR code per ticket on confirmation and can retrieve their tickets from their signed-in account dashboard. Organizers open their dashboard and select **Scan tickets** on one of their events; allow camera access and use a recent browser that supports `BarcodeDetector` (for example, current Chrome on HTTPS). Successful scans check in that ticket atomically; a second scan reports duplicate entry. Ticket scans are limited to the event's assigned organizer.

In MongoDB Atlas, allow connections from your Vercel deployment using a supported static egress IP option or secure networking integration; avoid a broad public IP allowlist. Deploy after setting the environment variables, then configure the Razorpay webhook URL as `https://your-domain.example/api/razorpay/webhook` and subscribe to `payment.captured`. Run `npm run seed` against the intended database only if you want the sample events and organizers there.

Expired reservations are cleaned locally by the development server and on Vercel by the daily cron in `vercel.json`, compatible with the Hobby plan's daily schedule limit. `CRON_SECRET` must be set in the same Vercel environment; the cron request is rejected if the secret is missing or invalid. On Vercel, expired holds can remain reserved until the daily cleanup runs.

## API

- `GET /api/health`
- `GET /api/events?category=music&search=jazz&sort=price-low`
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- `POST /api/auth/become-organizer` (self-service organizer signup)
- `GET /api/account/dashboard`, `GET /api/account/saved-events`, `PUT|DELETE /api/account/saved-events/:eventId` (signed-in clients)
- `GET /api/organizer/dashboard`, `GET|POST /api/organizer/events`, `PATCH|DELETE /api/organizer/events/:id`
- `GET /api/admin/dashboard`, `GET /api/admin/users?page=1`, `GET /api/admin/orders?page=1`, `PATCH /api/admin/events/:id` (administrator only; user and order lists are paginated)
- `POST /api/checkout/session`, `POST /api/checkout/verify`
- `GET /api/account/bookings/:orderId/tickets` (signed-in booking owner)
- `POST /api/organizer/events/:eventId/scan` (organizer who owns that event)
- `POST /api/razorpay/webhook` (Razorpay-signed `payment.captured` events)
- `GET /api/maintenance/expire-orders` (Vercel Cron only; requires the configured bearer secret)

## Not configured yet

Real payments require Razorpay API credentials. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` to the test keys from the Razorpay Dashboard for development; configure live keys only for production. A webhook secret is required for webhook notifications. The sample `.env` file is intentionally not created with credentials. Email delivery, refunds, tax calculation, organizer payout onboarding, and production hosting are not included; Razorpay handles payment processing, while Gather displays the ticket code after server-side payment verification. Before launch, add verified organizer onboarding, email ticket delivery, refund/cancellation policies, and production-grade monitoring and secrets management.

### Administrator access

Create and verify the administrator's account through the normal account flow first. Then, from a trusted machine with the app's `.env` configured, grant the role to that existing account:

```powershell
node scripts/promote-admin.js admin@example.com
```

There is deliberately no public administrator signup or role-promotion endpoint. Only a user with the `admin` role can view the administrator dashboard or edit other organizers' events. Client bookings are associated with the signed-in account when checkout is started while signed in; guest orders stay guest-only.

Registration, events, orders, account sessions, roles, and signed-in saved events are persisted in MongoDB. Passwords are stored only as bcrypt hashes, and MongoDB stores only a hash of each opaque session token. Payment card data is handled by Razorpay and is not stored by Gather. Legacy saved-event IDs from the previous browser-only version are copied into the signed-in account the next time the user signs in.