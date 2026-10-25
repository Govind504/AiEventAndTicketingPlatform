require("dotenv").config({ quiet: true });

const mongoose = require("mongoose");
const User = require("../src/models/User");

async function promoteAdmin() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Provide the email address of an existing account.");
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required.");

  await mongoose.connect(process.env.MONGODB_URI);
  const user = await User.findOneAndUpdate({ email }, { $set: { role: "admin" } }, { new: true });
  if (!user) throw new Error(`No account found for ${email}. Create the account first, then promote it.`);
  console.log(`Administrator access granted to ${user.email}.`);
}

promoteAdmin()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
