import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { publicAppUrl } from "@/lib/site-url";

/* -------------------------------------------------------------------------- */
/*  Transport (Gmail / any SMTP via SMTP_* env vars)                          */
/* -------------------------------------------------------------------------- */

const globalForMail = globalThis as typeof globalThis & { hostelMailer?: Transporter };

export function isMailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.SMTP_FROM);
}

function transport() {
  return globalForMail.hostelMailer ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true", // true for 465, false for 587 (STARTTLS)
    // Gmail app passwords are shown with spaces ("abcd efgh ijkl mnop"); SMTP wants them without.
    auth: { user: process.env.SMTP_USER, pass: (process.env.SMTP_PASSWORD ?? "").replace(/\s+/g, "") },
  });
}

export function appUrl() {
  return publicAppUrl;
}

type Mail = { to: string | string[]; subject: string; text: string; html: string };

/**
 * Sends one email. Throws on SMTP failure.
 * Returns false (and sends nothing) when SMTP is not configured.
 * `sensitive` mails carry secrets, so they are never echoed to the server log.
 */
async function deliver(mail: Mail, options: { sensitive?: boolean; devLog?: string } = {}) {
  if (!isMailConfigured()) {
    if (!options.sensitive && process.env.NODE_ENV !== "production") {
      console.info(`[email] SMTP not configured — would send "${mail.subject}" to ${[mail.to].flat().join(", ")}${options.devLog ? `\n${options.devLog}` : ""}`);
    } else {
      console.error(`[email] SMTP not configured — "${mail.subject}" was not sent.`);
    }
    return false;
  }
  await transport().sendMail({ from: process.env.SMTP_FROM, ...mail });
  return true;
}

/** Best-effort send for notifications: failures are logged and never break the request. */
async function safeDeliver(mail: Mail, options: { devLog?: string } = {}) {
  try {
    return await deliver(mail, options);
  } catch (error) {
    console.error(`[email] Failed to send "${mail.subject}":`, error);
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/*  Layout helpers                                                            */
/* -------------------------------------------------------------------------- */

const esc = (value: string | number) => String(value)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const mwk = (amount: number) => `K${amount.toLocaleString("en-MW")}`;

type Row = [label: string, value: string];

function layout(opts: { title: string; greeting?: string; intro: string; rows?: Row[]; button?: { label: string; href: string }; note?: string; outro?: string }) {
  const rows = (opts.rows ?? []).map(([label, value]) =>
    `<tr><td style="padding:8px 12px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;width:38%">${esc(label)}</td>` +
    `<td style="padding:8px 12px;font-size:14px;font-weight:600;color:#0f172a;border-bottom:1px solid #e2e8f0;font-family:${/[A-Z0-9-]{8,}/.test(value) ? "monospace" : "inherit"}">${esc(value)}</td></tr>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#0f4c81;padding:18px 24px;color:#ffffff;font-size:18px;font-weight:700">MUBAS Smart Hostels</td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 12px;font-size:20px;color:#0f172a">${esc(opts.title)}</h1>
${opts.greeting ? `<p style="margin:0 0 12px;color:#334155;font-size:14px">${esc(opts.greeting)}</p>` : ""}
<p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.5">${esc(opts.intro)}</p>
${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;margin:0 0 16px">${rows}</table>` : ""}
${opts.button ? `<p style="margin:0 0 16px"><a href="${esc(opts.button.href)}" style="display:inline-block;background:#0f4c81;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600">${esc(opts.button.label)}</a></p>` : ""}
${opts.note ? `<p style="margin:0 0 12px;color:#92400e;background:#fef3c7;padding:10px 12px;border-radius:8px;font-size:13px;line-height:1.5">${esc(opts.note)}</p>` : ""}
${opts.outro ? `<p style="margin:0;color:#64748b;font-size:12px;line-height:1.5">${esc(opts.outro)}</p>` : ""}
</td></tr></table>
<p style="color:#94a3b8;font-size:11px;margin:12px 0 0">This is an automated message from MUBAS Smart Hostels. Please do not reply.</p>
</td></tr></table></body></html>`;
  const text = [
    opts.greeting, opts.greeting ? "" : null, opts.intro, "",
    ...(opts.rows ?? []).map(([l, v]) => `${l}: ${v}`),
    opts.rows?.length ? "" : null,
    opts.button ? `${opts.button.label}: ${opts.button.href}` : null,
    opts.button ? "" : null,
    opts.note ? `Note: ${opts.note}` : null,
    opts.outro,
  ].filter((line) => line !== null && line !== undefined).join("\n");
  return { html, text };
}

/** Admin recipients: ADMIN_NOTIFY_EMAIL (comma separated) or, if unset, every admin account. */
async function adminRecipients() {
  const configured = (process.env.ADMIN_NOTIFY_EMAIL ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  if (configured.length) return configured;
  try {
    const rows = await getDb().select({ email: users.email }).from(users).where(eq(users.role, "admin"));
    return rows.map((row) => row.email);
  } catch (error) {
    console.error("[email] Could not load admin recipients:", error);
    return [];
  }
}

async function notifyAdmins(subject: string, content: Parameters<typeof layout>[0]) {
  const to = await adminRecipients();
  if (!to.length) return false;
  return safeDeliver({ to, subject, ...layout(content) });
}

/* -------------------------------------------------------------------------- */
/*  Student emails                                                            */
/* -------------------------------------------------------------------------- */

/**
 * New-account email. This is the ONLY place a temporary password is ever delivered —
 * it is never returned to the admin by any API. Throws if it cannot be sent so the
 * caller can roll the account back instead of creating a student nobody can log in as.
 */
export async function sendStudentCredentials(input: {
  to: string; name: string; regNo: string; bankAccountNo: string; password: string;
}) {
  const body = layout({
    title: "Your hostel account is ready",
    greeting: `Hello ${input.name},`,
    intro: "The hostel office has created your MUBAS Smart Hostels student account. Use the details below to sign in.",
    rows: [
      ["Login email", input.to],
      ["Temporary password", input.password],
      ["Registration no.", input.regNo],
      ["Bank account no.", input.bankAccountNo],
    ],
    button: { label: "Sign in", href: `${appUrl()}/login` },
    note: "Please change this temporary password in Settings right after your first sign-in. Never share it with anyone, including hostel staff.",
  });
  const sent = await deliver({ to: input.to, subject: "Your MUBAS Smart Hostels login details", ...body }, { sensitive: true });
  if (!sent) throw new Error("SMTP is not configured, so the student's login details could not be emailed.");
}

export async function sendBookingConfirmation(booking: {
  email: string; name: string; academicYear: string; hostel: string; room: string; confirmationNo: string;
}) {
  const body = layout({
    title: "Hostel booking confirmed",
    greeting: `Hello ${booking.name},`,
    intro: `Your hostel booking for academic year ${booking.academicYear} is approved.`,
    rows: [
      ["Hostel", booking.hostel], ["Room", booking.room],
      ["Academic year", booking.academicYear], ["Confirmation no.", booking.confirmationNo],
    ],
    button: { label: "Pay rent online", href: `${appUrl()}/student/payments` },
    outro: "You can pay your monthly rent from the Payments tab of the student portal using PayChangu (mobile money or card).",
  });
  return deliver({ to: booking.email, subject: `Hostel booking confirmed for ${booking.academicYear}`, ...body });
}

export async function sendBookingAdminNotice(booking: {
  studentName: string; regNo?: string | null; academicYear: string; hostel: string; room: string; confirmationNo: string;
}) {
  return notifyAdmins(`New hostel booking: ${booking.studentName}`, {
    title: "New hostel booking",
    intro: `${booking.studentName} booked a room and was allocated automatically.`,
    rows: [
      ["Student", booking.studentName], ["Reg. no.", booking.regNo ?? "—"],
      ["Hostel / room", `${booking.hostel} · ${booking.room}`],
      ["Academic year", booking.academicYear], ["Confirmation no.", booking.confirmationNo],
    ],
    button: { label: "Open bookings", href: `${appUrl()}/admin/bookings` },
  });
}

export async function sendPasswordResetEmail(to: string, name: string, link: string) {
  const body = layout({
    title: "Reset your password",
    greeting: `Hello ${name},`,
    intro: "We received a request to reset your MUBAS Hostels password. The link below expires in 30 minutes and can be used once.",
    button: { label: "Choose a new password", href: link },
    outro: "If you did not request this, you can ignore this email and your password will stay the same.",
  });
  return deliver({ to, subject: "Reset your MUBAS Hostels password", ...body }, {
    sensitive: process.env.NODE_ENV === "production",
    devLog: `Reset link: ${link}`,
  });
}

export async function sendPasswordChangedEmail(to: string, name: string) {
  const body = layout({
    title: "Your password was changed",
    greeting: `Hello ${name},`,
    intro: `The password for your MUBAS Smart Hostels account was changed on ${new Date().toUTCString()}.`,
    note: "If this was not you, reset your password immediately using “Forgot password” on the sign-in page and contact the hostel office.",
  });
  return safeDeliver({ to, subject: "Your MUBAS Smart Hostels password was changed", ...body });
}

export async function sendPaymentSuccess(input: {
  to: string; name: string; amount: number; month: string; academicYear: string; reference: string; paidAt: Date; hostel?: string; room?: string;
}) {
  const body = layout({
    title: "Payment received — thank you",
    greeting: `Hello ${input.name},`,
    intro: `We have received your hostel rent payment for ${input.month}. Keep this email as your payment confirmation.`,
    rows: [
      ["Amount paid", mwk(input.amount)], ["Rent month", input.month], ["Academic year", input.academicYear],
      ...(input.hostel ? [["Room", `${input.hostel} · ${input.room ?? ""}`] as Row] : []),
      ["Payment reference", input.reference], ["Method", "PayChangu"], ["Paid at", input.paidAt.toUTCString()],
    ],
    button: { label: "View payment history", href: `${appUrl()}/student/payments` },
  });
  return safeDeliver({ to: input.to, subject: `Payment received: ${input.month} hostel rent (${mwk(input.amount)})`, ...body });
}

export async function sendPaymentFailed(input: { to: string; name: string; amount: number; month: string; reference: string }) {
  const body = layout({
    title: "Your payment did not go through",
    greeting: `Hello ${input.name},`,
    intro: `Your PayChangu payment for ${input.month} hostel rent was not completed, and you have not been charged for it.`,
    rows: [["Amount", mwk(input.amount)], ["Rent month", input.month], ["Reference", input.reference]],
    button: { label: "Try again", href: `${appUrl()}/student/payments` },
    outro: "If money left your account, contact the hostel office with the reference above.",
  });
  return safeDeliver({ to: input.to, subject: `Payment not completed: ${input.month} hostel rent`, ...body });
}

export async function sendPaymentAdminNotice(input: {
  studentName: string; regNo?: string | null; amount: number; month: string; reference: string; duplicate?: boolean;
}) {
  return notifyAdmins(`${input.duplicate ? "ACTION NEEDED — duplicate rent payment" : "Rent payment received"}: ${input.studentName} (${input.month})`, {
    title: input.duplicate ? "Duplicate rent payment — refund needed" : "Rent payment received",
    intro: input.duplicate
      ? `${input.studentName} paid through PayChangu for ${input.month}, but rent for that month was already recorded. The extra payment was not applied and should be refunded from the PayChangu dashboard.`
      : `${input.studentName} paid hostel rent through PayChangu.`,
    rows: [
      ["Student", input.studentName], ["Reg. no.", input.regNo ?? "—"],
      ["Amount", mwk(input.amount)], ["Rent month", input.month], ["Reference", input.reference],
    ],
    button: { label: "Open payments", href: `${appUrl()}/admin/receipts` },
  });
}

export async function sendTransferDecision(input: {
  to: string; name: string; status: "approved" | "rejected"; fromRoom: string; toRoom: string; notes?: string | null;
}) {
  const approved = input.status === "approved";
  const body = layout({
    title: approved ? "Room transfer approved" : "Room transfer not approved",
    greeting: `Hello ${input.name},`,
    intro: approved
      ? "Your room transfer request was approved. Your new room assignment is active now."
      : "Your room transfer request was reviewed and could not be approved.",
    rows: [["Current room", input.fromRoom], ["Requested room", input.toRoom], ...(input.notes ? [["Office notes", input.notes] as Row] : [])],
    button: { label: "Open student portal", href: `${appUrl()}/student/dashboard` },
  });
  return safeDeliver({ to: input.to, subject: `Room transfer ${input.status}`, ...body });
}

export async function sendTransferRequestedAdmin(input: { studentName: string; from: string; to: string; reason: string }) {
  return notifyAdmins(`Room transfer request: ${input.studentName}`, {
    title: "New room transfer request",
    intro: `${input.studentName} asked to move rooms.`,
    rows: [["Student", input.studentName], ["From", input.from], ["To", input.to], ["Reason", input.reason.slice(0, 300)]],
    button: { label: "Review requests", href: `${appUrl()}/admin/students` },
  });
}

export async function sendRepairUpdate(input: {
  to: string; name: string; title: string; status: string; staff?: string | null; notes?: string | null;
}) {
  const body = layout({
    title: "Your repair request was updated",
    greeting: `Hello ${input.name},`,
    intro: `“${input.title}” is now ${input.status}.`,
    rows: [["Status", input.status], ...(input.staff ? [["Assigned to", input.staff] as Row] : []), ...(input.notes ? [["Notes", input.notes] as Row] : [])],
    button: { label: "View repairs", href: `${appUrl()}/student/maintenance` },
  });
  return safeDeliver({ to: input.to, subject: `Repair update: ${input.title}`, ...body });
}

export async function sendRepairReportedAdmin(input: { studentName: string; title: string; hostel: string; room: string }) {
  return notifyAdmins(`New repair report: ${input.title}`, {
    title: "New repair report",
    intro: `${input.studentName} reported a room issue.`,
    rows: [["Student", input.studentName], ["Issue", input.title], ["Location", `${input.hostel} · ${input.room}`]],
    button: { label: "Open issues", href: `${appUrl()}/admin/issues` },
  });
}
