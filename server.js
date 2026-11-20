require("dotenv").config();
const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { User, Complaint, Counter, CATEGORIES, STATUSES, PRIORITIES } = require("./models");

const {
  PORT = 3000,
  MONGODB_URI = "mongodb://127.0.0.1:27017/smart_campus",
  JWT_SECRET,
  ADMIN_USERNAME = "admin",
  ADMIN_PASSWORD,
} = process.env;

if (!JWT_SECRET) { console.error("Missing JWT_SECRET. Copy .env.example to .env and set it."); process.exit(1); }

const app = express();
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

/* ---------- helpers ---------- */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (res, code, error) => res.status(code).json({ error });
const str = (v) => (typeof v === "string" ? v.trim() : "");
const publicUser = (u) => ({ id: u._id, name: u.name, loginId: u.loginId, role: u.role });
const sign = (u) => jwt.sign({ id: u._id, role: u.role }, JWT_SECRET, { expiresIn: "7d" });
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const auth = (...roles) => wrap(async (req, res, next) => {
  const m = (req.headers.authorization || "").match(/^Bearer (.+)$/);
  if (!m) return fail(res, 401, "Please log in first.");
  let payload;
  try { payload = jwt.verify(m[1], JWT_SECRET); } catch { return fail(res, 401, "Your session has expired. Please log in again."); }
  const user = await User.findById(payload.id);
  if (!user) return fail(res, 401, "Account not found. Please log in again.");
  if (roles.length && !roles.includes(user.role)) return fail(res, 403, "You do not have access to this action.");
  req.user = user;
  next();
});

/* ---------- auth ---------- */
app.post("/api/auth/register", wrap(async (req, res) => {
  const name = str(req.body.name), roll = str(req.body.roll).toUpperCase(), password = req.body.password;
  if (name.length < 2 || name.length > 60) return fail(res, 400, "Enter your full name (2 to 60 characters).");
  if (!/^[A-Z0-9-]{3,20}$/.test(roll)) return fail(res, 400, "Roll number must be 3 to 20 letters or digits.");
  if (typeof password !== "string" || password.length < 6) return fail(res, 400, "Password must be at least 6 characters.");
  if (await User.exists({ loginId: roll })) return fail(res, 409, "An account with this roll number already exists. Try logging in.");
  const user = await User.create({ name, loginId: roll, passwordHash: await bcrypt.hash(password, 10), role: "student" });
  res.status(201).json({ token: sign(user), user: publicUser(user) });
}));

app.post("/api/auth/login", wrap(async (req, res) => {
  const loginId = str(req.body.loginId).toUpperCase(), password = req.body.password;
  const user = loginId && typeof password === "string" ? await User.findOne({ loginId }) : null;
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return fail(res, 401, "Incorrect ID or password.");
  res.json({ token: sign(user), user: publicUser(user) });
}));

app.get("/api/auth/me", auth(), (req, res) => res.json({ user: publicUser(req.user) }));

/* ---------- complaints: student ---------- */
app.post("/api/complaints", auth("student"), wrap(async (req, res) => {
  const b = req.body;
  const data = { title: str(b.title), category: b.category, priority: b.priority || "Medium", location: str(b.location), description: str(b.description) };
  if (!data.title || !data.location || !data.description) return fail(res, 400, "Title, location and details are required.");
  if (!CATEGORIES.includes(data.category)) return fail(res, 400, "Choose a valid category.");
  if (!PRIORITIES.includes(data.priority)) return fail(res, 400, "Choose a valid urgency.");
  const counter = await Counter.findByIdAndUpdate("complaint", { $inc: { seq: 1 } }, { new: true, upsert: true, setDefaultsOnInsert: true });
  const ticketId = "C-" + (1000 + counter.seq);
  const complaint = await Complaint.create({ ...data, ticketId, student: req.user._id, studentName: req.user.name, roll: req.user.loginId });
  res.status(201).json({ complaint });
}));

app.get("/api/complaints/mine", auth("student"), wrap(async (req, res) => {
  res.json({ complaints: await Complaint.find({ student: req.user._id }).sort({ createdAt: -1 }) });
}));

/* ---------- complaints: admin ---------- */
app.get("/api/complaints/stats", auth("admin"), wrap(async (req, res) => {
  const rows = await Complaint.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]);
  const stats = { total: 0, Pending: 0, "In Progress": 0, Completed: 0 };
  rows.forEach((r) => { stats[r._id] = r.n; stats.total += r.n; });
  res.json({ stats });
}));

app.get("/api/complaints", auth("admin"), wrap(async (req, res) => {
  const filter = {};
  if (STATUSES.includes(req.query.status)) filter.status = req.query.status;
  if (CATEGORIES.includes(req.query.category)) filter.category = req.query.category;
  const q = str(req.query.q).slice(0, 60);
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ title: rx }, { studentName: rx }, { roll: rx }, { ticketId: rx }, { location: rx }];
  }
  const complaints = await Complaint.find(filter).sort({ createdAt: -1 }).limit(300);
  const order = { Pending: 0, "In Progress": 1, Completed: 2 }; // open complaints first
  complaints.sort((a, b) => order[a.status] - order[b.status]);
  res.json({ complaints });
}));

app.patch("/api/complaints/:id", auth("admin"), wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid complaint ID.");
  const update = {};
  if (req.body.status !== undefined) {
    if (!STATUSES.includes(req.body.status)) return fail(res, 400, "Invalid status.");
    update.status = req.body.status;
    update.resolvedAt = req.body.status === "Completed" ? new Date() : null;
  }
  if (req.body.note !== undefined) {
    const note = str(req.body.note);
    if (note.length > 500) return fail(res, 400, "Note must be 500 characters or fewer.");
    update.adminNote = note;
  }
  const complaint = await Complaint.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!complaint) return fail(res, 404, "Complaint not found.");
  res.json({ complaint });
}));

app.delete("/api/complaints/:id", auth("admin"), wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid complaint ID.");
  const gone = await Complaint.findByIdAndDelete(req.params.id);
  if (!gone) return fail(res, 404, "Complaint not found.");
  res.json({ ok: true });
}));

app.get("/api/health", (req, res) => {
  const database = mongoose.connection.readyState === 1 ? "connected" : "unavailable";
  res.status(database === "connected" ? 200 : 503).json({
    status: database === "connected" ? "ok" : "unavailable",
    database,
  });
});

app.use("/api", (req, res) => fail(res, 404, "Not found."));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  fail(res, 500, "Server error. Please try again.");
});

/* ---------- start ---------- */
async function start() {
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  } catch (e) {
    console.error("\nCould not connect to MongoDB at " + MONGODB_URI + "\nMake sure MongoDB is installed and running (see README).\n");
    process.exit(1);
  }
  console.log("Connected to MongoDB");
  if (!(await User.exists({ role: "admin" }))) {
    if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 6) { console.error("Set ADMIN_PASSWORD (6+ characters) in .env to create the first admin."); process.exit(1); }
    await User.create({ name: "Administrator", loginId: ADMIN_USERNAME, passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10), role: "admin" });
    console.log("Admin account created. Username: " + ADMIN_USERNAME.toUpperCase());
  }
  app.listen(PORT, () => console.log("Smart Campus running at http://localhost:" + PORT));
}
start();
