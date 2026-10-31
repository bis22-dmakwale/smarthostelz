import nodemailer from "nodemailer";

export async function sendPasswordResetEmail(to: string, name: string, link: string) {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM;
  if (!host || !user || !password || !from) {
    // Local development fallback: SMTP is not configured, so surface the link in the server log only.
    if (process.env.NODE_ENV !== "production") console.info(`[password reset] SMTP not configured. Reset link for ${to}: ${link}`);
    else console.error("Password reset requested but SMTP is not configured.");
    return false;
  }
  const transport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user, pass: password },
  });
  await transport.sendMail({
    from,
    to,
    subject: "Reset your MUBAS Hostels password",
    text: [
      `Hello ${name},`,
      "",
      "We received a request to reset your MUBAS Hostels password. Use the link below to choose a new one. It expires in 30 minutes and can be used once.",
      "",
      link,
      "",
      "If you did not request this, you can ignore this email and your password will stay the same.",
    ].join("\n"),
  });
  return true;
}
