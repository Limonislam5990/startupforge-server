const router = require("express").Router();
const { collections } = require("../db");
const { verifyToken, verifyRole } = require("../middleware/auth");
const { asyncHandler, oid, escapeRegex, deleteStartupCascade } = require("../utils");

router.use(verifyToken, verifyRole("admin"));

router.get("/stats", asyncHandler(async (req, res) => {
  const [totalUsers, totalStartups, totalOpportunities, revenueAgg, usersByRole, startupsByStatus, monthly] =
    await Promise.all([
      collections.users.countDocuments(),
      collections.startups.countDocuments(),
      collections.opportunities.countDocuments(),
      collections.payments.aggregate([
        { $match: { payment_status: "paid" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]).toArray(),
      collections.users.aggregate([{ $group: { _id: "$role", value: { $sum: 1 } } }]).toArray(),
      collections.startups.aggregate([{ $group: { _id: "$status", value: { $sum: 1 } } }]).toArray(),
      collections.payments.aggregate([
        { $match: { payment_status: "paid" } },
        { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$paid_at" } }, revenue: { $sum: "$amount" } } },
        { $sort: { _id: 1 } },
      ]).toArray(),
    ]);

  res.json({
    totalUsers,
    totalStartups,
    totalOpportunities,
    totalRevenue: revenueAgg[0]?.total || 0,
    usersByRole: usersByRole.map((r) => ({ name: r._id || "unknown", value: r.value })),
    startupsByStatus: startupsByStatus.map((r) => ({ name: r._id || "unknown", value: r.value })),
    revenueByMonth: monthly.map((m) => ({ month: m._id, revenue: m.revenue })),
  });
}));

// Users
router.get("/users", asyncHandler(async (req, res) => {
  const { search } = req.query;
  const q = {};
  if (search?.trim()) {
    const rx = { $regex: escapeRegex(search.trim()), $options: "i" };
    q.$or = [{ name: rx }, { email: rx }];
  }
  res.json(await collections.users.find(q).sort({ createdAt: -1 }).toArray());
}));

router.patch("/users/:id/block", asyncHandler(async (req, res) => {
  const objId = oid(req.params.id);
  if (!objId) return res.status(400).json({ message: "Invalid user id" });
  const user = await collections.users.findOne({ $or: [{ _id: objId }, { _id: req.params.id }] });
  if (!user) return res.status(404).json({ message: "User not found" });
  const _id = user._id;
  if (user.role === "admin") return res.status(400).json({ message: "Admins cannot be blocked" });

  const isBlocked = req.body.isBlocked === undefined ? !user.isBlocked : !!req.body.isBlocked;
  await collections.users.updateOne({ _id }, { $set: { isBlocked } });
  res.json({ success: true, isBlocked });
}));

// Startups
router.get("/startups", asyncHandler(async (req, res) => {
  const data = await collections.startups
    .aggregate([
      { $sort: { created_at: -1 } },
      { $lookup: { from: "user", localField: "founder_email", foreignField: "email", as: "founder" } },
      { $addFields: { founder_name: { $arrayElemAt: ["$founder.name", 0] } } },
      { $project: { founder: 0 } },
    ])
    .toArray();
  res.json(data);
}));

router.patch("/startups/:id/approve", asyncHandler(async (req, res) => {
  const _id = oid(req.params.id);
  if (!_id) return res.status(400).json({ message: "Invalid startup id" });
  const r = await collections.startups.updateOne({ _id }, { $set: { status: "approved", approved_at: new Date() } });
  if (!r.matchedCount) return res.status(404).json({ message: "Startup not found" });
  res.json({ success: true });
}));

router.delete("/startups/:id", asyncHandler(async (req, res) => {
  const _id = oid(req.params.id);
  if (!_id) return res.status(400).json({ message: "Invalid startup id" });
  const startup = await collections.startups.findOne({ _id });
  if (!startup) return res.status(404).json({ message: "Startup not found" });
  await deleteStartupCascade(startup);
  res.json({ success: true });
}));

// Transactions: user, amount, date, status
router.get("/transactions", asyncHandler(async (req, res) => {
  const data = await collections.payments
    .aggregate([
      { $sort: { paid_at: -1 } },
      { $lookup: { from: "user", localField: "user_email", foreignField: "email", as: "user" } },
      { $addFields: { user_name: { $arrayElemAt: ["$user.name", 0] } } },
      { $project: { user: 0 } },
    ])
    .toArray();
  res.json(data);
}));

module.exports = router;