const router = require("express").Router();
const { collections } = require("../db");
const { verifyToken, verifyRole } = require("../middleware/auth");
const { asyncHandler } = require("../utils");

// Founder overview cards + chart data
router.get("/founder", verifyToken, verifyRole("founder"), asyncHandler(async (req, res) => {
  const startup = await collections.startups.findOne({ founder_email: req.user.email });
  if (!startup) {
    return res.json({ totalOpportunities: 0, totalApplications: 0, acceptedMembers: 0, byStatus: [], perOpportunity: [] });
  }
  const opps = await collections.opportunities
    .find({ startup_id: startup._id.toString() })
    .project({ role_title: 1 })
    .toArray();
  const titleMap = Object.fromEntries(opps.map((o) => [o._id.toString(), o.role_title]));
  const ids = Object.keys(titleMap);

  const apps = ids.length
    ? await collections.applications.find({ opportunity_id: { $in: ids } }).project({ status: 1, opportunity_id: 1 }).toArray()
    : [];

  const statusCount = { Pending: 0, Accepted: 0, Rejected: 0 };
  const perOpp = {};
  for (const a of apps) {
    statusCount[a.status] = (statusCount[a.status] || 0) + 1;
    perOpp[a.opportunity_id] = (perOpp[a.opportunity_id] || 0) + 1;
  }
  res.json({
    totalOpportunities: opps.length,
    totalApplications: apps.length,
    acceptedMembers: statusCount.Accepted,
    byStatus: Object.entries(statusCount).map(([name, value]) => ({ name, value })),
    perOpportunity: ids.map((id) => ({ name: titleMap[id], applications: perOpp[id] || 0 })),
  });
}));

// Collaborator overview
router.get("/collaborator", verifyToken, verifyRole("collaborator"), asyncHandler(async (req, res) => {
  const apps = await collections.applications.find({ applicant_email: req.user.email }).project({ status: 1 }).toArray();
  const statusCount = { Pending: 0, Accepted: 0, Rejected: 0 };
  apps.forEach((a) => (statusCount[a.status] = (statusCount[a.status] || 0) + 1));
  res.json({
    totalApplications: apps.length,
    ...statusCount,
    byStatus: Object.entries(statusCount).map(([name, value]) => ({ name, value })),
  });
}));

module.exports = router;