const router = require("express").Router();
const { collections } = require("../db");
const { verifyToken } = require("../middleware/auth");
const { asyncHandler } = require("../utils");

// NOTE: register / login / logout / JWT issuing are handled by the Next.js client
// (Better Auth + /api/token). The server only verifies the JWT cookie.

router.get("/users/me", verifyToken, asyncHandler(async (req, res) => {
  const user = await collections.users.findOne({ _id: req.user._id });
  res.json(user);
}));

router.patch("/users/me", verifyToken, asyncHandler(async (req, res) => {
  const { name, image, skills, bio } = req.body;
  const update = {};
  if (name !== undefined) update.name = name;
  if (image !== undefined) update.image = image;
  if (bio !== undefined) update.bio = bio;
  if (skills !== undefined)
    update.skills = (Array.isArray(skills) ? skills : String(skills).split(","))
      .map((s) => String(s).trim())
      .filter(Boolean);
  update.updatedAt = new Date();
  await collections.users.updateOne({ _id: req.user._id }, { $set: update });
  res.json({ success: true });
}));

module.exports = router;