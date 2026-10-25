const crypto = require("node:crypto");
const Session = require("../models/Session");
const User = require("../models/User");

const SESSION_COOKIE = "gather_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getSessionToken(request) {
  const cookieHeader = request.get("cookie") || "";
  const cookie = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return cookie ? cookie.slice(SESSION_COOKIE.length + 1) : null;
}

async function requireAuth(request, response, next) {
  try {
    const token = getSessionToken(request);
    if (!token) return response.status(401).json({ error: "Sign in to continue" });
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const session = await Session.findOne({ tokenHash, expiresAt: { $gt: new Date() } });
    if (!session) return response.status(401).json({ error: "Your sign-in has expired. Please sign in again." });
    const user = await User.findById(session.user);
    if (!user) {
      await session.deleteOne();
      return response.status(401).json({ error: "Account no longer exists" });
    }
    request.user = user;
    request.authSession = session;
    next();
  } catch (error) {
    next(error);
  }
}

function requireOrganizer(request, response, next) {
  if (!request.user || !["organizer", "admin"].includes(request.user.role)) {
    return response.status(403).json({ error: "Organizer access is required" });
  }
  next();
}

function requireAdmin(request, response, next) {
  if (!request.user || request.user.role !== "admin") {
    return response.status(403).json({ error: "Administrator access is required" });
  }
  next();
}

async function optionalAuth(request, response, next) {
  if (!getSessionToken(request)) return next();
  return requireAuth(request, response, next);
}

async function createSession(user, response, request) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await Session.create({ tokenHash, user: user._id, expiresAt });
  response.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || request.secure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt
  });
}

function clearSessionCookie(response, request) {
  response.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || request.secure,
    sameSite: "lax",
    path: "/"
  });
}

function publicUser(user) {
  return { id: user._id.toString(), name: user.name, email: user.email, role: user.role };
}

module.exports = { clearSessionCookie, createSession, optionalAuth, publicUser, requireAdmin, requireAuth, requireOrganizer };