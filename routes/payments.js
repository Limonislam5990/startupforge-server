const router = require("express").Router();
const Stripe = require("stripe");
const { collections } = require("../db");
const { verifyToken, verifyRole } = require("../middleware/auth");
const { asyncHandler, isPremium } = require("../utils");

const FREE_LIMIT = 3;

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    const err = new Error("Stripe is not configured on the server");
    err.status = 500;
    throw err;
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

router.use(verifyToken, verifyRole("founder"));

// premium status + how many opportunities posted
router.get("/status", asyncHandler(async (req, res) => {
  const startup = await collections.startups.findOne({ founder_email: req.user.email });
  const opportunityCount = startup
    ? await collections.opportunities.countDocuments({ startup_id: startup._id.toString() })
    : 0;
  res.json({ isPremium: await isPremium(req.user.email), opportunityCount, freeLimit: FREE_LIMIT });
}));

// Stripe Checkout
router.post("/create-checkout-session", asyncHandler(async (req, res) => {
  if (await isPremium(req.user.email)) return res.status(400).json({ message: "You are already a premium founder" });

  const stripe = getStripe();
  const clientUrl = (process.env.CLIENT_URL || "http://localhost:3000").split(",")[0];
  const price = Number(process.env.PREMIUM_PRICE_USD || 10);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: req.user.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(price * 100),
          product_data: {
            name: "StartupForge Premium Founder Package",
            description: "Post unlimited opportunities",
          },
        },
      },
    ],
    metadata: { email: req.user.email },
    success_url: `${clientUrl}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${clientUrl}/dashboard`,
  });
  res.json({ url: session.url });
}));

// After redirect: verify with Stripe, then save the transaction (idempotent)
router.post("/confirm", asyncHandler(async (req, res) => {
  const { session_id } = req.body;
  if (!session_id) return res.status(400).json({ message: "session_id is required" });

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(session_id);
  if (session.payment_status !== "paid") return res.status(400).json({ message: "Payment not completed" });
  if (session.metadata?.email !== req.user.email) return res.status(403).json({ message: "This payment is not yours" });

  const transaction_id =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || session.id;

  await collections.payments.updateOne(
    { transaction_id },
    {
      $setOnInsert: {
        user_email: req.user.email,
        amount: session.amount_total / 100,
        transaction_id,
        payment_status: "paid",
        paid_at: new Date(),
      },
    },
    { upsert: true }
  );
  const payment = await collections.payments.findOne({ transaction_id });
  res.json({ success: true, payment });
}));

router.get("/my", asyncHandler(async (req, res) => {
  res.json(await collections.payments.find({ user_email: req.user.email }).sort({ paid_at: -1 }).toArray());
}));

module.exports = router;