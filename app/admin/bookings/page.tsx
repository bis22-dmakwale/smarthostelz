"use client";
import { useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { useApiResource } from "@/components/hostel/useApiResource";
import { apiRequest } from "@/lib/api";

type Application = {
  application: { id: string; semester: string; bookingMonth: number | null; academicYear: string | null; gender: string; status: string; submittedAt: string; confirmationNo: string | null };
  studentName: string; regNo: string | null; hostelName: string | null; roomNo: string | null;
};
type BookingWindow = {
  settings: { academicYear: string; opensAt: string; closesAt: string; monthlyRent: number } | null;
};

function toLocalDateTime(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function AdminBookingsPage() {
  const applications = useApiResource<Application[]>("/api/bookings");
  const bookingWindow = useApiResource<BookingWindow>("/api/booking-window");
  const [error, setError] = useState("");
  const [formValues, setFormValues] = useState<Partial<{ academicYear: string; opensAt: string; closesAt: string; monthlyRent: string }>>({});
  const [savingWindow, setSavingWindow] = useState(false);
  const settings = bookingWindow.data?.settings;
  const academicYear = formValues.academicYear ?? settings?.academicYear ?? "";
  const opensAt = formValues.opensAt ?? (settings ? toLocalDateTime(settings.opensAt) : "");
  const closesAt = formValues.closesAt ?? (settings ? toLocalDateTime(settings.closesAt) : "");
  const monthlyRent = formValues.monthlyRent ?? (settings ? String(settings.monthlyRent) : "");

  async function saveBookingWindow(event: React.FormEvent) {
    event.preventDefault();
    setSavingWindow(true);
    setError("");
    try {
      const savedSettings = await apiRequest<NonNullable<BookingWindow["settings"]>>("/api/booking-window", {
        method: "PATCH",
        body: JSON.stringify({
          academicYear,
          opensAt: new Date(opensAt).toISOString(),
          closesAt: new Date(closesAt).toISOString(),
          monthlyRent: Number(monthlyRent),
        }),
      });
      bookingWindow.setData({ settings: savedSettings });
      setFormValues({});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the booking window.");
    } finally {
      setSavingWindow(false);
    }
  }

  return <div className="grid">
    <div className="page-intro"><div><div className="page-eyebrow">Administration</div><h2 className="page-heading">Hostel bookings</h2><p className="page-description">Set the booking window and rent amount. Paid, eligible students are automatically assigned and approved when they book.</p></div></div>
    {error && <p role="alert" style={{ color: "var(--danger)" }}>{error}</p>}
    {bookingWindow.error && <p role="alert" style={{ color: "var(--danger)" }}>{bookingWindow.error}</p>}
    <Card>
      <h2 className="section-title" style={{ marginTop: 0 }}>Booking window and hostel rent</h2>
      <form onSubmit={(event) => void saveBookingWindow(event)} style={{ display: "grid", gap: 10 }}>
        <input className="input" aria-label="Academic year" placeholder="e.g. 2026/2027" value={academicYear} onChange={(event) => setFormValues((values) => ({ ...values, academicYear: event.target.value }))} pattern="[0-9]{4}/[0-9]{4}" title="Enter an academic year like 2026/2027" required />
        <label className="muted">Opens at<input className="input" type="datetime-local" value={opensAt} onChange={(event) => setFormValues((values) => ({ ...values, opensAt: event.target.value }))} required /></label>
        <label className="muted">Closes at<input className="input" type="datetime-local" value={closesAt} onChange={(event) => setFormValues((values) => ({ ...values, closesAt: event.target.value }))} required /></label>
        <label className="muted">Hostel rent amount (MWK)<input className="input" type="number" min="1" step="1" value={monthlyRent} onChange={(event) => setFormValues((values) => ({ ...values, monthlyRent: event.target.value }))} required /></label>
        {bookingWindow.data?.settings && <p className="muted">Current academic year: {bookingWindow.data.settings.academicYear} · Rent: {bookingWindow.data.settings.monthlyRent}</p>}
        <Button type="submit" disabled={savingWindow || bookingWindow.loading}>{savingWindow ? "Saving…" : "Save booking window"}</Button>
      </form>
    </Card>
    {applications.error && <p role="alert" style={{ color: "var(--danger)" }}>{applications.error}</p>}
    {applications.data?.map(({ application, studentName, regNo, hostelName, roomNo }) => (
      <Card key={application.id}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div><strong>{studentName}</strong><p className="muted">{regNo ?? "No registration number"} · {application.semester}</p></div>
          <Badge status={application.status === "approved" ? "success" : application.status === "rejected" ? "danger" : application.status === "waitlisted" ? "info" : "warning"}>{application.status}</Badge>
        </div>
        <p className="muted" style={{ marginTop: 10 }}>Eligibility: {application.gender} · Applied {new Date(application.submittedAt).toLocaleDateString()}</p>
        {application.bookingMonth && application.academicYear && <p className="muted">Booking period: {new Date(2000, application.bookingMonth - 1).toLocaleString("en", { month: "long" })} {application.academicYear}</p>}
        {application.status === "approved" && <p style={{ marginTop: 8 }}>{hostelName} · Room {roomNo} · Ticket {application.confirmationNo}</p>}
      </Card>
    ))}
    {!applications.loading && !applications.data?.length && <p className="muted">No booking applications to review.</p>}
  </div>;
}