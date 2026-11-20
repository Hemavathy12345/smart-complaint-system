const mongoose = require("mongoose");

const CATEGORIES = ["Hostel", "Classroom", "Library", "Canteen", "Transport", "Wi-Fi & IT", "Sanitation", "Electricity", "Other"];
const STATUSES = ["Pending", "In Progress", "Completed"];
const PRIORITIES = ["Low", "Medium", "High"];

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  loginId: { type: String, required: true, unique: true, uppercase: true, trim: true }, // roll number (students) or username (admin)
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["student", "admin"], default: "student" },
}, { timestamps: true });

const complaintSchema = new mongoose.Schema({
  ticketId: { type: String, unique: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  studentName: String,
  roll: String,
  title: { type: String, required: true, trim: true, maxlength: 80 },
  category: { type: String, enum: CATEGORIES, required: true },
  priority: { type: String, enum: PRIORITIES, default: "Medium" },
  location: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, required: true, trim: true, maxlength: 1500 },
  status: { type: String, enum: STATUSES, default: "Pending", index: true },
  adminNote: { type: String, default: "", maxlength: 500 },
  resolvedAt: Date,
}, { timestamps: true });

// Counter collection gives each complaint a unique, increasing ticket number (C-1001, C-1002, ...)
const Counter = mongoose.model("Counter", new mongoose.Schema({ _id: String, seq: Number }));

module.exports = {
  User: mongoose.model("User", userSchema),
  Complaint: mongoose.model("Complaint", complaintSchema),
  Counter, CATEGORIES, STATUSES, PRIORITIES,
};
