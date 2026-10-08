const { MongoClient, ServerApiVersion } = require("mongodb");

const collections = {};
let client;
let connecting;

async function connectDB() {
  if (collections.users) return collections;
  if (!connecting) {
    client = new MongoClient(process.env.MONGODB_URI, {
      serverApi: { version: ServerApiVersion.v1, strict: false, deprecationErrors: true },
    });
    connecting = client.connect().then(() => {
      const db = client.db(process.env.DB_NAME || "startupforge");
      collections.users = db.collection("user"); // Better Auth stores users here
      collections.startups = db.collection("startups");
      collections.opportunities = db.collection("opportunities");
      collections.applications = db.collection("applications");
      collections.payments = db.collection("payments");

      // indexes (errors ignored so existing duplicate data never crashes the server)
      collections.users.createIndex({ email: 1 }, { unique: true }).catch(() => {});
      collections.payments.createIndex({ transaction_id: 1 }, { unique: true }).catch(() => {});
      collections.applications
        .createIndex({ opportunity_id: 1, applicant_email: 1 }, { unique: true })
        .catch(() => {});
      console.log("MongoDB connected");
    });
  }
  try {
    await connecting;
  } catch (err) {
    connecting = null; // allow retry on next request
    throw err;
  }
  return collections;
}

module.exports = { connectDB, collections };