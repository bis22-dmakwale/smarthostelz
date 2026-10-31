"use client";
import { useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { useApiResource } from "@/components/hostel/useApiResource";
import { apiRequest } from "@/lib/api";
import { mkw } from "@/lib/format";

type BookingRow = {
  application: { id: string; semester: string; academicYear: string | null; status: string; confirmationNo: string | null; submittedAt: string };
  hostelName: string | null;
  roomNo: string | null;
};
type BookingWindow = {
  settings: { academicYear: string; opensAt: string; closesAt: string; monthlyRent: number } | null;
  isOpen: boolean;
  alreadyBooked: boolean;
  student: { bankAccountNo: string | null; regNo: string | null; gender: string | null };
  currentMonth: string;
  currentMonthPayment: { amount: number; reference: string; paidAt: string } | null;
  rentPayments: { paymentMonth: string; amount: number; reference: string; paidAt: string }[];
};

export default function StudentBookingsPage() {
  const bookings = useApiResource<BookingRow[]>("/api/bookings");
  const bookingWindow = useApiResource<BookingWindow>("/api/booking-window");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  async function book() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await apiRequest<{ emailSent: boolean }>("/api/bookings", { method: "POST" });
      await Promise.all([bookings.refresh(), bookingWindow.refresh()]);
      setNotice(result.emailSent
        ? "Your booking is approved and the confirmation email has been sent."
        : "Your booking is approved. Email delivery is not configured; save the confirmation shown below.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to complete your booking.");
      await bookingWindow.refresh();
    } finally {
      setSaving(false);
    }
  }

  const windowData = bookingWindow.data;
  const eligible = Boolean(windowData?.student.regNo && ["male", "female"].includes(windowData.student.gender ?? ""));
  const canBook = Boolean(windowData?.isOpen && !windowData.alreadyBooked && eligible);

  return (
    <div className="grid">
      <div className="page-intro"><div><div className="page-eyebrow">Accommodation</div><h2 className="page-heading">Hostel booking</h2><p className="page-description">Book during the office-configured window. Monthly rent is paid after your room is assigned.</p></div></div>
      {bookingWindow.error && <p role="alert" style={{ color: "var(--danger)" }}>{bookingWindow.error}</p>}
      <Card>
        <h2 className="section-title" style={{ marginTop: 0 }}>Booking window</h2>
        {bookingWindow.loading && <p className="muted">Loading booking details…</p>}
        {windowData?.settings ? <>
          <p><strong>Academic year:</strong> {windowData.settings.academicYear}</p>
          <p style={{ marginTop: 6 }}><strong>Booking window:</strong> <Badge status={windowData.isOpen ? "success" : "warning"}>{windowData.isOpen ? "Open" : "Closed"}</Badge></p>
          <p className="muted" style={{ marginTop: 6 }}>
            {new Date(windowData.settings.opensAt).toLocaleString()} – {new Date(windowData.settings.closesAt).toLocaleString()}
          </p>
          <p style={{ marginTop: 12 }}><strong>Hostel rent:</strong> {mkw(windowData.settings.monthlyRent)}</p>
          <p style={{ marginTop: 10 }}><strong>Your bank account number:</strong> <span style={{ fontFamily: "monospace" }}>{windowData.student.bankAccountNo ?? "Not assigned — contact the hostel office"}</span></p>
          {!eligible && <p role="alert" style={{ color: "var(--danger)", marginTop: 8 }}>Your student eligibility details are incomplete. Contact the hostel office.</p>}
          {windowData.alreadyBooked && <p className="muted" style={{ marginTop: 8 }}>You already have an approved booking for this academic year.</p>}
          <Button onClick={() => void book()} disabled={saving || bookingWindow.loading || !canBook} style={{ marginTop: 12 }}>
            {saving ? "Checking availability…" : "Book hostel"}
          </Button>
        </> : !bookingWindow.loading && <p className="muted">The hostel office has not configured a booking window yet.</p>}
        {error && <p role="alert" style={{ color: "var(--danger)", marginTop: 10 }}>{error}</p>}
        {notice && <p role="status" style={{ color: "var(--success, var(--primary))", marginTop: 10 }}>{notice}</p>}
      </Card>
      {bookings.error && <p role="alert" style={{ color: "var(--danger)" }}>{bookings.error}</p>}
      <h2 className="section-title">Your bookings</h2>
      {bookings.data?.map(({ application, hostelName, roomNo }) => {
        const status = application.status;
        return <Card key={application.id}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div><strong>{application.semester}</strong><p className="muted">Booked {new Date(application.submittedAt).toLocaleDateString()}</p></div>
            <Badge status={status === "approved" ? "success" : status === "rejected" ? "danger" : status === "waitlisted" ? "info" : "warning"}>{status}</Badge>
          </div>
          {status === "approved" && <div style={{ marginTop: 16 }}>
            <p><strong>{hostelName}</strong> · Room {roomNo}</p>
            <p className="muted" style={{ marginTop: 5 }}>Allocation confirmation ticket</p>
            <p style={{ fontFamily: "monospace", marginTop: 5 }}>{application.confirmationNo}</p>
          </div>}
        </Card>;
      })}
      {!bookings.loading && !bookings.data?.length && <p className="muted">No bookings yet.</p>}
      {windowData?.alreadyBooked && <Card>
        <h2 className="section-title" style={{ marginTop: 0 }}>Monthly rent status</h2>
        <p>Rent is due monthly after your room is assigned. Current month: <strong>{windowData.currentMonth}</strong></p>
        <p style={{ marginTop: 8 }}><strong>Status:</strong>{" "}
          <Badge status={windowData.currentMonthPayment ? "success" : "warning"}>{windowData.currentMonthPayment ? "paid" : "unpaid"}</Badge>
        </p>
        {windowData.currentMonthPayment && <p className="muted" style={{ marginTop: 5 }}>Reference {windowData.currentMonthPayment.reference} · {mkw(windowData.currentMonthPayment.amount)} · Recorded {new Date(windowData.currentMonthPayment.paidAt).toLocaleString()}</p>}
        <Button variant="ghost" onClick={() => void bookingWindow.refresh()} disabled={bookingWindow.loading} style={{ marginTop: 10 }}>Refresh rent status</Button>
        {windowData.rentPayments.length > 0 && <>
          <h3 className="section-title" style={{ marginTop: 18 }}>Monthly payment history</h3>
          {windowData.rentPayments.map((payment) => <p className="muted" key={payment.paymentMonth} style={{ marginTop: 5 }}>{payment.paymentMonth} · {mkw(payment.amount)} · {payment.reference}</p>)}
        </>}
      </Card>}
    </div>
  );
}
