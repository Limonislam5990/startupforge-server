// Usage: npm run make-admin -- someone@example.com
require("dotenv").config();
const { connectDB, collections } = require("../db");

(async () => {
  const email = process.argv[2];
  if (!email) {
    console.log("Usage: npm run make-admin -- <email>");
    process.exit(1);
  }
  await connectDB();
  const r = await collections.users.updateOne({ email }, { $set: { role: "admin" } });
  console.log(r.matchedCount ? `${email} is now an admin` : "No user found with that email (register first)");
  process.exit(0);
})();