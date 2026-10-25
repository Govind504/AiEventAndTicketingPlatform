const express = require("express");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const User = require("../models/User");
const { clearSessionCookie, createSession, publicUser, requireAuth } = require("../middleware/auth");

const router = express.Router();
const registrationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(100)
}).strict();
const loginSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(100) }).strict();

router.post("/register", async (request, response) => {
  const input = registrationSchema.parse(request.body);
  const email = input.email.toLowerCase();
  if (await User.exists({ email })) return response.status(409).json({ error: "An account with this email already exists" });
  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await User.create({ name: input.name, email, passwordHash });
  await createSession(user, response, request);
  response.status(201).json({ user: publicUser(user) });
});

router.post("/login", async (request, response) => {
  const input = loginSchema.parse(request.body);
  const user = await User.findOne({ email: input.email.toLowerCase() }).select("+passwordHash");
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    return response.status(401).json({ error: "Email or password is incorrect" });
  }
  await createSession(user, response, request);
  response.json({ user: publicUser(user) });
});

router.get("/me", requireAuth, (request, response) => response.json({ user: publicUser(request.user) }));

router.post("/become-organizer", requireAuth, async (request, response) => {
  request.user.role = "organizer";
  await request.user.save();
  response.json({ user: publicUser(request.user) });
});

router.post("/logout", requireAuth, async (request, response) => {
  await request.authSession.deleteOne();
  clearSessionCookie(response, request);
  response.json({ success: true });
});

module.exports = router;