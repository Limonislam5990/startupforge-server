const router = require("express").Router();
const { collections } = require("../db");
const { verifyToken, verifyRole } = require("../middleware/auth");
const { asyncHandler, oid } = require("../utils");

// Collaborator: apply
router.post("/", verifyToken, verifyRole("collaborator"), asyncHandler(async (req, res) => {
  const { opportunity_id, portfolio_link, motivation } = req.body;
  const _id = oid(opportunity_id);
  if (!_id || !portfolio_link || !motivation)
    return res.status(400).json({ message: "Opportunity, portfolio link and motivation are required" });

  const opp = await collections.opportunities.findOne({ _id });
  if (!opp) return res.status(404).json({ message: "Opportunity not found" });

  const applicant_email = req.user.email; // from token
  const dup = await collections.applications.findOne({ opportunity_id: _id.toString(), applicant_email });
  if (dup) return res.status(409).json({ message: "You have already applied to this opportunity" });

  const doc = {
    opportunity_id: _id.toString(),
    applicant_email,
    portfolio_link,
    motivation,
    status: "Pending",
    applied_at: new Date(),
  };
  const result = await collections.applications.insertOne(doc);
  res.status(201).json({ ...doc, _id: result.insertedId });
}));

// Collaborator: my applications (opportunity name, startup name, date, status)
router.get("/my", verifyToken, verifyRole("collaborator"), asyncHandler(async (req, res) => {
  const data = await collections.applications
    .aggregate([
      { $match: { applicant_email: req.user.email } },
      { $addFields: { oppId: { $convert: { input: "$opportunity_id", to: "objectId", onError: null } } } },
      { $lookup: { from: "opportunities", localField: "oppId", foreignField: "_id", as: "opp" } },
      { $addFields: { opp: { $arrayElemAt: ["$opp", 0] } } },
      { $addFields: { startupObjId: { $convert: { input: "$opp.startup_id", to: "objectId", onError: null } } } },
      { $lookup: { from: "startups", localField: "startupObjId", foreignField: "_id", as: "startup" } },
      {
        $addFields: {
          opportunity_name: { $ifNull: ["$opp.role_title", "Removed opportunity"] },
          startup_name: { $ifNull: [{ $arrayElemAt: ["$startup.startup_name", 0] }, "Unknown"] },
        },
      },
      { $project: { opp: 0, oppId: 0, startup: 0, startupObjId: 0 } },
      { $sort: { applied_at: -1 } },
    ])
    .toArray();
  res.json(data);
}));

// Founder: all applications for my opportunities
router.get("/founder", verifyToken, verifyRole("founder"), asyncHandler(async (req, res) => {
  const startup = await collections.startups.findOne({ founder_email: req.user.email });
  if (!startup) return res.json([]);

  const opps = await collections.opportunities
    .find({ startup_id: startup._id.toString() })
    .project({ role_title: 1 })
    .toArray();
  const titleMap = Object.fromEntries(opps.map((o) => [o._id.toString(), o.role_title]));

  const apps = await collections.applications
    .aggregate([
      { $match: { opportunity_id: { $in: Object.keys(titleMap) } } },
      { $lookup: { from: "user", localField: "applicant_email", foreignField: "email", as: "applicant" } },
      {
        $addFields: {
          applicant_name: { $arrayElemAt: ["$applicant.name", 0] },
          applicant_image: { $arrayElemAt: ["$applicant.image", 0] },
          applicant_skills: { $arrayElemAt: ["$applicant.skills", 0] },
        },
      },
      { $project: { applicant: 0 } },
      { $sort: { applied_at: -1 } },
    ])
    .toArray();
  apps.forEach((a) => (a.opportunity_name = titleMap[a.opportunity_id]));
  res.json(apps);
}));

// Founder: accept / reject
router.patch("/:id/status", verifyToken, verifyRole("founder"), asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!["Accepted", "Rejected"].includes(status))
    return res.status(400).json({ message: "Status must be Accepted or Rejected" });

  const _id = oid(req.params.id);
  if (!_id) return res.status(400).json({ message: "Invalid application id" });
  const app = await collections.applications.findOne({ _id });
  if (!app) return res.status(404).json({ message: "Application not found" });

  const opp = await collections.opportunities.findOne({ _id: oid(app.opportunity_id) });
  const startup = opp && (await collections.startups.findOne({ _id: oid(opp.startup_id), founder_email: req.user.email }));
  if (!startup) return res.status(403).json({ message: "Forbidden: not your opportunity" });

  await collections.applications.updateOne({ _id }, { $set: { status, updated_at: new Date() } });
  res.json({ success: true, status });
}));

module.exports = router;