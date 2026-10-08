const router = require("express").Router();
const { collections } = require("../db");
const { verifyToken, verifyRole } = require("../middleware/auth");
const { asyncHandler, oid, escapeRegex, toList, paginate, deleteStartupCascade } = require("../utils");

// adds founder_name + team_size_needed (number of open opportunities)
const withExtras = [
  { $lookup: { from: "user", localField: "founder_email", foreignField: "email", as: "founder" } },
  {
    $lookup: {
      from: "opportunities",
      let: { sid: { $toString: "$_id" } },
      pipeline: [{ $match: { $expr: { $eq: ["$startup_id", "$$sid"] } } }],
      as: "opps",
    },
  },
  {
    $addFields: {
      founder_name: { $ifNull: [{ $arrayElemAt: ["$founder.name", 0] }, "Unknown"] },
      team_size_needed: { $size: "$opps" },
    },
  },
  { $project: { founder: 0, opps: 0 } },
];

// Public: approved startups (latest first). ?search=&industry=a,b&page=&limit=
router.get("/", asyncHandler(async (req, res) => {
  const { search, industry, page, limit } = req.query;
  const match = { status: "approved" };
  if (search?.trim()) match.startup_name = { $regex: escapeRegex(search.trim()), $options: "i" };
  if (industry) match.industry = { $in: toList(industry) };
  res.json(
    await paginate(collections.startups, [{ $match: match }, { $sort: { created_at: -1 } }, ...withExtras], page, limit)
  );
}));

// Founder: my startup
router.get("/mine", verifyToken, verifyRole("founder"), asyncHandler(async (req, res) => {
  const [startup] = await collections.startups
    .aggregate([{ $match: { founder_email: req.user.email } }, ...withExtras])
    .toArray();
  res.json(startup || null);
}));

// Public: startup details + its opportunities
router.get("/:id", asyncHandler(async (req, res) => {
  const _id = oid(req.params.id);
  if (!_id) return res.status(400).json({ message: "Invalid startup id" });
  const [startup] = await collections.startups
    .aggregate([{ $match: { _id, status: "approved" } }, ...withExtras])
    .toArray();
  if (!startup) return res.status(404).json({ message: "Startup not found" });
  const opportunities = await collections.opportunities
    .find({ startup_id: _id.toString() })
    .sort({ created_at: -1 })
    .toArray();
  res.json({ ...startup, opportunities });
}));

router.post("/", verifyToken, verifyRole("founder"), asyncHandler(async (req, res) => {
  const { startup_name, logo, industry, description, funding_stage } = req.body;
  if (!startup_name || !logo || !industry || !description || !funding_stage)
    return res.status(400).json({ message: "All fields are required" });

  const exists = await collections.startups.findOne({ founder_email: req.user.email });
  if (exists) return res.status(409).json({ message: "You have already created a startup" });

  const doc = {
    startup_name,
    logo,
    industry,
    description,
    funding_stage,
    founder_email: req.user.email, // always taken from the token, never from the body
    status: "pending", // admin must approve
    created_at: new Date(),
  };
  const result = await collections.startups.insertOne(doc);
  res.status(201).json({ ...doc, _id: result.insertedId });
}));

router.patch("/:id", verifyToken, verifyRole("founder"), asyncHandler(async (req, res) => {
  const _id = oid(req.params.id);
  if (!_id) return res.status(400).json({ message: "Invalid startup id" });
  const update = { updated_at: new Date() };
  for (const k of ["startup_name", "logo", "industry", "description", "funding_stage"])
    if (req.body[k] !== undefined) update[k] = req.body[k];

  const r = await collections.startups.updateOne({ _id, founder_email: req.user.email }, { $set: update });
  if (!r.matchedCount) return res.status(404).json({ message: "Startup not found" });
  res.json({ success: true });
}));

router.delete("/:id", verifyToken, verifyRole("founder"), asyncHandler(async (req, res) => {
  const _id = oid(req.params.id);
  if (!_id) return res.status(400).json({ message: "Invalid startup id" });
  const startup = await collections.startups.findOne({ _id, founder_email: req.user.email });
  if (!startup) return res.status(404).json({ message: "Startup not found" });
  await deleteStartupCascade(startup);
  res.json({ success: true });
}));

module.exports = router;