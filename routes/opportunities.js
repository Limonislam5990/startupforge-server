const router = require("express").Router();
const { collections } = require("../db");
const { verifyToken, verifyRole } = require("../middleware/auth");
const { asyncHandler, oid, escapeRegex, toList, paginate, isPremium } = require("../utils");

const FREE_LIMIT = 3;

async function getOwned(id, email) {
  const _id = oid(id);
  if (!_id) return null;
  const opp = await collections.opportunities.findOne({ _id });
  if (!opp) return null;
  const startup = await collections.startups.findOne({ _id: oid(opp.startup_id), founder_email: email });
  return startup ? { opp, startup } : null;
}

// Options for the filter dropdowns
router.get("/filters", asyncHandler(async (req, res) => {
  const [workTypes, industries] = await Promise.all([
    collections.opportunities.distinct("work_type"),
    collections.startups.distinct("industry", { status: "approved" }),
  ]);
  res.json({ workTypes, industries });
}));

// Public browse: ?search=&workType=a,b&industry=a,b&page=&limit=
//  - search  -> $regex on role_title and required_skills
//  - filters -> $in on work_type and startup industry
//  - server-side pagination
router.get("/", asyncHandler(async (req, res) => {
  const { search, workType, industry, page, limit } = req.query;

  const match = {};
  if (search?.trim()) {
    const rx = { $regex: escapeRegex(search.trim()), $options: "i" };
    match.$or = [{ role_title: rx }, { required_skills: rx }];
  }
  if (workType) match.work_type = { $in: toList(workType) };

  const startupMatch = { "startup.status": "approved" };
  if (industry) startupMatch["startup.industry"] = { $in: toList(industry) };

  const pipeline = [
    { $match: match },
    { $addFields: { startupObjId: { $convert: { input: "$startup_id", to: "objectId", onError: null } } } },
    { $lookup: { from: "startups", localField: "startupObjId", foreignField: "_id", as: "startup" } },
    { $unwind: "$startup" },
    { $match: startupMatch },
    {
      $addFields: {
        startup_name: "$startup.startup_name",
        startup_logo: "$startup.logo",
        industry: "$startup.industry",
      },
    },
    { $project: { startup: 0, startupObjId: 0 } },
    { $sort: { created_at: -1 } },
  ];
  res.json(await paginate(collections.opportunities, pipeline, page, limit));
}));

// Founder: my opportunities (with application counts)
router.get("/mine", verifyToken, verifyRole("founder"), asyncHandler(async (req, res) => {
  const startup = await collections.startups.findOne({ founder_email: req.user.email });
  if (!startup) return res.json([]);
  const data = await collections.opportunities
    .aggregate([
      { $match: { startup_id: startup._id.toString() } },
      {
        $lookup: {
          from: "applications",
          let: { oid: { $toString: "$_id" } },
          pipeline: [{ $match: { $expr: { $eq: ["$opportunity_id", "$$oid"] } } }],
          as: "apps",
        },
      },
      { $addFields: { applications_count: { $size: "$apps" } } },
      { $project: { apps: 0 } },
      { $sort: { created_at: -1 } },
    ])
    .toArray();
  res.json(data);
}));

// Public: details (all info + startup + founder)
router.get("/:id", asyncHandler(async (req, res) => {
  const _id = oid(req.params.id);
  if (!_id) return res.status(400).json({ message: "Invalid opportunity id" });
  const opp = await collections.opportunities.findOne({ _id });
  if (!opp) return res.status(404).json({ message: "Opportunity not found" });

  const startup = await collections.startups.findOne({ _id: oid(opp.startup_id) });
  const founder = startup ? await collections.users.findOne({ email: startup.founder_email }) : null;
  res.json({
    ...opp,
    startup_name: startup?.startup_name,
    startup_logo: startup?.logo,
    industry: startup?.industry,
    funding_stage: startup?.funding_stage,
    startup_description: startup?.description,
    founder_name: founder?.name,
  });
}));

router.post("/", verifyToken, verifyRole("founder"), asyncHandler(async (req, res) => {
  const { role_title, required_skills, work_type, commitment_level, deadline, description } = req.body;
  const skills = toList(required_skills);
  if (!role_title || !work_type || !commitment_level || !deadline || !skills.length)
    return res.status(400).json({ message: "All fields are required" });

  const startup = await collections.startups.findOne({ founder_email: req.user.email });
  if (!startup) return res.status(400).json({ message: "Create your startup before posting opportunities" });

  const startupId = startup._id.toString();
  const count = await collections.opportunities.countDocuments({ startup_id: startupId });
  if (count >= FREE_LIMIT && !(await isPremium(req.user.email)))
    return res.status(402).json({
      code: "PREMIUM_REQUIRED",
      message: `Free founders can post up to ${FREE_LIMIT} opportunities. Purchase the premium package to post more.`,
    });

  const doc = {
    startup_id: startupId,
    role_title,
    required_skills: skills,
    work_type,
    commitment_level,
    deadline,
    description: description || "",
    created_at: new Date(),
  };
  const result = await collections.opportunities.insertOne(doc);
  res.status(201).json({ ...doc, _id: result.insertedId });
}));

router.patch("/:id", verifyToken, verifyRole("founder"), asyncHandler(async (req, res) => {
  const owned = await getOwned(req.params.id, req.user.email);
  if (!owned) return res.status(404).json({ message: "Opportunity not found" });

  const update = { updated_at: new Date() };
  for (const k of ["role_title", "work_type", "commitment_level", "deadline", "description"])
    if (req.body[k] !== undefined) update[k] = req.body[k];
  if (req.body.required_skills !== undefined) update.required_skills = toList(req.body.required_skills);

  await collections.opportunities.updateOne({ _id: owned.opp._id }, { $set: update });
  res.json({ success: true });
}));

router.delete("/:id", verifyToken, verifyRole("founder"), asyncHandler(async (req, res) => {
  const owned = await getOwned(req.params.id, req.user.email);
  if (!owned) return res.status(404).json({ message: "Opportunity not found" });
  await collections.applications.deleteMany({ opportunity_id: owned.opp._id.toString() });
  await collections.opportunities.deleteOne({ _id: owned.opp._id });
  res.json({ success: true });
}));

module.exports = router;