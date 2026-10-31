import nodemailer from "nodemailer";

type BookingConfirmation = {
  email: string;
  name: string;
  academicYear: string;
  hostel: string;
  room: string;
  confirmationNo: string;
};

export async function sendBookingConfirmation(booking: BookingConfirmation) {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM;
  if (!host || !user || !password || !from) return false;

  const transport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user, pass: password },
  });
  await transport.sendMail({
    from,
    to: booking.email,
    subject: `Hostel booking confirmed for ${booking.academicYear}`,
    text: [
      `Hello ${booking.name},`,
      "",
      `Your hostel booking for academic year ${booking.academicYear} is approved.`,
      `Hostel: ${booking.hostel}`,
      `Room: ${booking.room}`,
      `Confirmation: ${booking.confirmationNo}`,
      "",
      "Rental fees are paid separately through the bank.",
    ].join("\n"),
  });
  return true;
}