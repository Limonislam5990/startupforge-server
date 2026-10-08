const { ObjectId } = require("mongodb");
const { collections } = require("./db");

const oid = (id) => (id && ObjectId.isValid(id) ? new ObjectId(id) : null);

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const toList = (v) =>
  (Array.isArray(v) ? v : String(v || "").split(","))
    .map((s) => String(s).trim())
    .filter(Boolean);

async function paginate(collection, pipeline, page, limit) {
  const p = Math.max(parseInt(page) || 1, 1);
  const l = Math.min(Math.max(parseInt(limit) || 9, 1), 50);
  const [r] = await collection
    .aggregate([
      ...pipeline,
      { $facet: { data: [{ $skip: (p - 1) * l }, { $limit: l }], total: [{ $count: "count" }] } },
    ])
    .toArray();
  const total = r.total[0]?.count || 0;
  return { data: r.data, total, page: p, limit: l, totalPages: Math.ceil(total / l) };
}

async function isPremium(email) {
  const paid = await collections.payments.findOne({ user_email: email, payment_status: "paid" });
  return !!paid;
}

async function deleteStartupCascade(startup) {
  const sid = startup._id.toString();
  const opps = await collections.opportunities.find({ startup_id: sid }).project({ _id: 1 }).toArray();
  const ids = opps.map((o) => o._id.toString());
  if (ids.length) await collections.applications.deleteMany({ opportunity_id: { $in: ids } });
  await collections.opportunities.deleteMany({ startup_id: sid });
  await collections.startups.deleteOne({ _id: startup._id });
}

module.exports = { oid, escapeRegex, asyncHandler, toList, paginate, isPremium, deleteStartupCascade };