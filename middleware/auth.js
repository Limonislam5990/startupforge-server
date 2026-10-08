const jwt = require("jsonwebtoken");
const { collections } = require("../db");

// Checks the JWT cookie, then loads the user from the database so that
// role changes and blocked accounts take effect immediately.
async function verifyToken(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ message: "Unauthorized access" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { users } = await collections();
    const user = await users.findOne({ email: decoded.email });

    if (!user) return res.status(401).json({ message: "Unauthorized access" });
    if (user.isBlocked) return res.status(403).json({ message: "Your account is blocked" });

    req.user = {
      id: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
    };
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

// Use after verifyToken, for example: verifyRole("admin") or verifyRole("founder", "admin")
function verifyRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden access" });
    }
    next();
  };
}

module.exports = { verifyToken, verifyRole };