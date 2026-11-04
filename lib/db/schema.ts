import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const userRole = pgEnum("user_role", ["student", "admin"]);
export const attendanceAction = pgEnum("attendance_action", ["checked-in", "checked-out"]);
export const inspectionType = pgEnum("inspection_type", ["check-in", "check-out"]);
export const maintenanceStatus = pgEnum("maintenance_status", ["open", "in-progress", "fixed", "reported", "verified", "assigned", "resolved"]);
export const transferStatus = pgEnum("transfer_status", ["pending", "approved", "rejected"]);
export const complaintStatus = pgEnum("complaint_status", ["open", "reviewed", "resolved"]);
export const foundStatus = pgEnum("found_status", ["open", "claimed", "returned"]);
export const foundItemType = pgEnum("found_item_type", ["lost", "found"]);
export const paymentMethod = pgEnum("payment_method", ["Airtel Money", "TNM Mpamba", "Bank", "Cash", "PayChangu"]);

export const bookingSettings = pgTable("booking_settings", {
  id: text("id").primaryKey().default("current"),
  academicYear: text("academic_year").notNull(),
  opensAt: timestamp("opens_at", { withTimezone: true }).notNull(),
  closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
  monthlyRent: integer("monthly_rent").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const hostels = pgTable("hostels", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  gender: text("gender").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const hostelRooms = pgTable("hostel_rooms", {
  id: uuid("id").defaultRandom().primaryKey(),
  hostelId: uuid("hostel_id").notNull().references(() => hostels.id, { onDelete: "cascade" }),
  roomNo: text("room_no").notNull(),
  capacity: integer("capacity").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("hostel_rooms_hostel_room_idx").on(table.hostelId, table.roomNo)]);

export const bookingApplications = pgTable("booking_applications", {
  id: uuid("id").defaultRandom().primaryKey(),
  studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  semester: text("semester").notNull(),
  bookingMonth: integer("booking_month"),
  academicYear: text("academic_year"),
  gender: text("gender").notNull(),
  status: text("status").notNull().default("pending"),
  hostelId: uuid("hostel_id").references(() => hostels.id, { onDelete: "set null" }),
  roomId: uuid("room_id").references(() => hostelRooms.id, { onDelete: "set null" }),
  confirmationNo: text("confirmation_no").unique(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("booking_applications_student_semester_idx").on(table.studentId, table.semester),
  uniqueIndex("booking_applications_student_period_idx").on(table.studentId, table.bookingMonth, table.academicYear),
  uniqueIndex("booking_applications_student_academic_year_idx").on(table.studentId, table.academicYear)
    .where(sql`${table.academicYear} IS NOT NULL AND ${table.status} = 'approved'`),
]);

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  applicationId: uuid("application_id").notNull().references(() => bookingApplications.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  method: paymentMethod("method").notNull(),
  reference: text("reference").notNull(),
  proofPhoto: text("proof_photo"),
  status: text("status").notNull().default("pending"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
}, (table) => [uniqueIndex("payments_method_reference_idx").on(table.method, table.reference)]);

export const hostelBookingPayments = pgTable("hostel_booking_payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  academicYear: text("academic_year").notNull(),
  paymentMonth: text("payment_month").notNull(),
  bankAccountNo: text("bank_account_no").notNull(),
  amount: integer("amount").notNull(),
  method: paymentMethod("method").notNull().default("Bank"),
  reference: text("reference").notNull().unique(),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("hostel_booking_payments_student_month_idx").on(table.studentId, table.academicYear, table.paymentMonth),
]);

/** Online rent checkouts started by students through PayChangu. A success row is mirrored into hostel_booking_payments. */
export const paychanguPayments = pgTable("paychangu_payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  academicYear: text("academic_year").notNull(),
  paymentMonth: text("payment_month").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("MWK"),
  txRef: text("tx_ref").notNull().unique(),
  status: text("status").notNull().default("pending"), // pending | success | failed
  checkoutUrl: text("checkout_url"),
  providerReference: text("provider_reference"),
  channel: text("channel"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("paychangu_payments_one_success_idx").on(table.studentId, table.academicYear, table.paymentMonth)
    .where(sql`${table.status} = 'success'`),
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("student"),
  regNo: text("reg_no").unique(),
  gender: text("gender"),
  bankAccountNo: text("bank_account_no").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roomAssignments = pgTable("room_assignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  applicationId: uuid("application_id").references(() => bookingApplications.id, { onDelete: "set null" }),
  roomId: uuid("room_id").references(() => hostelRooms.id, { onDelete: "set null" }),
  qrToken: uuid("qr_token").defaultRandom().notNull().unique(),
  hostel: text("hostel").notNull(),
  room: text("room").notNull(),
  active: boolean("active").notNull().default(true),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("room_assignments_one_active_idx").on(table.studentId).where(sql`${table.active}`)]);

export const checkinEvents = pgTable("checkin_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  action: attendanceAction("action").notNull(),
  gate: text("gate").notNull(),
  eventAt: timestamp("event_at", { withTimezone: true }).notNull().defaultNow(),
});

export const gateVisitorEvents = pgTable("gate_visitor_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  fullName: text("full_name").notNull(),
  identifier: text("identifier").notNull(),
  gate: text("gate").notNull(),
  eventAt: timestamp("event_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  message: text("message").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roomInspections = pgTable("room_inspections", {
  id: uuid("id").defaultRandom().primaryKey(),
  studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  assignmentId: uuid("assignment_id").references(() => roomAssignments.id, { onDelete: "set null" }),
  hostel: text("hostel").notNull(),
  room: text("room").notNull(),
  type: inspectionType("type").notNull(),
  notes: text("notes").notNull(),
  photos: text("photos").array().notNull().default([]),
  aiStatus: text("ai_status").notNull().default("not-configured"),
  aiAssessment: text("ai_assessment"),
  aiAssessedAt: timestamp("ai_assessed_at", { withTimezone: true }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("room_inspections_assignment_type_idx").on(table.assignmentId, table.type)]);

export const receipts = pgTable("receipts", {
  id: uuid("id").defaultRandom().primaryKey(),
  studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  applicationId: uuid("application_id").references(() => bookingApplications.id, { onDelete: "set null" }),
  paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }).unique(),
  trackingNo: text("tracking_no").notNull().unique(),
  amount: integer("amount").notNull(),
  method: paymentMethod("method").notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull().default("verified"),
});

export const maintenanceRequests = pgTable("maintenance_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  hostel: text("hostel").notNull(),
  room: text("room").notNull(),
  status: maintenanceStatus("status").notNull().default("open"),
  verificationNotes: text("verification_notes"),
  assignedStaff: text("assigned_staff"),
  resolutionNotes: text("resolution_notes"),
  reportPhoto: text("report_photo"),
  resolutionPhoto: text("resolution_photo"),
  reportedAt: timestamp("reported_at", { withTimezone: true }).notNull().defaultNow(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
});

export const maintenanceVotes = pgTable("maintenance_votes", {
  id: uuid("id").defaultRandom().primaryKey(),
  requestId: uuid("request_id").notNull().references(() => maintenanceRequests.id, { onDelete: "cascade" }),
  studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (table) => [uniqueIndex("maintenance_votes_request_student_idx").on(table.requestId, table.studentId)]);

export const transferRequests = pgTable("transfer_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  currentHostel: text("current_hostel").notNull(),
  currentRoom: text("current_room").notNull(),
  requestedHostel: text("requested_hostel").notNull(),
  requestedRoom: text("requested_room").notNull(),
  reason: text("reason").notNull(),
  status: transferStatus("status").notNull().default("pending"),
  reviewNotes: text("review_notes"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

export const noiseComplaints = pgTable("noise_complaints", {
  id: uuid("id").defaultRandom().primaryKey(),
  location: text("location").notNull(),
  message: text("message").notNull(),
  status: complaintStatus("status").notNull().default("open"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

export const lostFoundItems = pgTable("lost_found_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  claimedById: uuid("claimed_by_id").references(() => users.id, { onDelete: "set null" }),
  type: foundItemType("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  location: text("location").notNull(),
  photo: text("photo"),
  status: foundStatus("status").notNull().default("open"),
  reportedAt: timestamp("reported_at", { withTimezone: true }).notNull().defaultNow(),
});
