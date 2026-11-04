"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { useApiResource } from "@/components/hostel/useApiResource";
import { apiRequest } from "@/lib/api";
import { mkw } from "@/lib/format";

type BookingWindow = {
  settings: { academicYear: string; monthlyRent: number } | null;
  alreadyBooked: boolean;
  currentMonth: string;
  rentPayments: { paymentMonth: string; amount: number; reference: string; paidAt: string }[];
};
type OnlinePayment = {
  id: string; paymentMonth: string; amount: number; currency: string; txRef: string;
  status: "pending" | "success" | "failed"; channel: string | null; createdAt: string; paidAt: string | null;
};
type Settle = { status: "success" | "failed" | "pending" | "not-found"; month?: string };

function monthOptions(current: string) {
  const [year, month] = current.split("-").map(Number);
  return Array.from({ length: 8 }, (_, index) => {
    const date = new Date(year, month - 1 + index - 2, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return { value, label: date.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) };
  });
}

export default function StudentPaymentsPage() {
  const bookingWindow = useApiResource<BookingWindow>("/api/booking-window");
  const online = useApiResource<{ configured: boolean; payments: OnlinePayment[] }>("/api/paychangu/payments");
  const [month, setMonth] = useState("");
  const [paying, setPaying] = useState(false);
  const [checking, setChecking] = useState("");
  const [error, setError] = useState("");
  const [banner, setBanner] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(null);
  const handledReturn = useRef(false);

  const data = bookingWindow.data;
  const paidMonths = useMemo(() => new Set(data?.rentPayments.map((payment) => payment.paymentMonth)), [data]);
  const options = useMemo(() => (data ? monthOptions(data.currentMonth).filter((option) => !paidMonths.has(option.value)) : []), [data, paidMonths]);
  const selected = month || options.find((option) => option.value >= (data?.currentMonth ?? ""))?.value || options[0]?.value || "";

  async function refreshAll() { await Promise.all([bookingWindow.refresh(), online.refresh()]); }

  function report(result: Settle) {
    if (result.status === "success") setBanner({ tone: "success", text: `Payment received${result.month ? ` for ${result.month}` : ""}. A confirmation email is on its way.` });
    else if (result.status === "failed") setBanner({ tone: "danger", text: "The payment did not go through. You have not been charged — please try again." });
    else if (result.status === "pending") setBanner({ tone: "info", text: "We have not received confirmation from PayChangu yet. Wait a moment, then press “Check status”." });
  }

  // Returning from PayChangu (?tx_ref=…): confirm the payment server-side, then tidy the URL.
  useEffect(() => {
    if (handledReturn.current) return;
    handledReturn.current = true;
    const params = new URLSearchParams(window.location.search);
    const txRef = params.get("tx_ref");
    if (!txRef) return;
    window.history.replaceState(null, "", window.location.pathname);
    apiRequest<Settle>("/api/paychangu/verify", { method: "POST", body: JSON.stringify({ txRef }) })
      .then(report).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Unable to confirm the payment."))
      .finally(() => void refreshAll());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pay() {
    setPaying(true); setError(""); setBanner(null);
    try {
      const result = await apiRequest<{ checkoutUrl: string }>("/api/paychangu/checkout", { method: "POST", body: JSON.stringify({ month: selected }) });
      window.location.href = result.checkoutUrl;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start the payment.");
      setPaying(false);
    }
  }

  async function check(txRef: string) {
    setChecking(txRef); setError(""); setBanner(null);
    try {
      report(await apiRequest<Settle>("/api/paychangu/verify", { method: "POST", body: JSON.stringify({ txRef }) }));
      await refreshAll();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to check the payment."); }
    finally { setChecking(""); }
  }

  const canPay = Boolean(data?.settings && data.alreadyBooked && selected && online.data?.configured);

  return (
    <div className="grid">
      <div className="page-intro"><div><div className="page-eyebrow">Accommodation</div><h2 className="page-heading">Pay hostel rent</h2><p className="page-description">Pay your monthly rent securely online with PayChangu (Airtel Money, TNM Mpamba or card). You will get an email confirmation as soon as it is received.</p></div></div>
      {banner && <Card><p role="status" style={{ color: banner.tone === "danger" ? "var(--danger)" : "var(--success, var(--primary))" }}>{banner.text}</p></Card>}
      {(bookingWindow.error || online.error) && <p role="alert" style={{ color: "var(--danger)" }}>{bookingWindow.error || online.error}</p>}
      <Card>
        <h2 className="section-title" style={{ marginTop: 0 }}>Make a payment</h2>
        {bookingWindow.loading && <p className="muted">Loading…</p>}
        {!bookingWindow.loading && !data?.settings && <p className="muted">The hostel office has not configured the academic year and rent yet.</p>}
        {data?.settings && !data.alreadyBooked && <p className="muted">Book a hostel room first. Rent can be paid once you have been assigned a room.</p>}
        {data?.settings && data.alreadyBooked && <>
          <p><strong>Academic year:</strong> {data.settings.academicYear}</p>
          <p style={{ marginTop: 6 }}><strong>Monthly rent:</strong> {mkw(data.settings.monthlyRent)}</p>
          {options.length === 0 ? <p className="muted" style={{ marginTop: 10 }}>You are fully paid up for the months shown. Nothing to pay right now.</p> : <>
            <label className="muted" htmlFor="rent-month" style={{ display: "block", marginTop: 12 }}>Month to pay</label>
            <select id="rent-month" className="input" value={selected} onChange={(event) => setMonth(event.target.value)} style={{ maxWidth: 260, marginTop: 4 }}>
              {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <div><Button onClick={() => void pay()} disabled={paying || !canPay} style={{ marginTop: 12 }}>{paying ? "Opening PayChangu…" : `Pay ${mkw(data.settings.monthlyRent)} with PayChangu`}</Button></div>
          </>}
          {online.data && !online.data.configured && <p role="alert" style={{ color: "var(--danger)", marginTop: 10 }}>Online payments are not switched on yet. Contact the hostel office.</p>}
        </>}
        {error && <p role="alert" style={{ color: "var(--danger)", marginTop: 10 }}>{error}</p>}
      </Card>

      <h2 className="section-title">Online payment attempts</h2>
      {!online.loading && !online.data?.payments.length && <p className="muted">No online payments yet.</p>}
      {online.data?.payments.map((payment) => (
        <Card key={payment.id}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
            <strong>{payment.paymentMonth} · {mkw(payment.amount)}</strong>
            <Badge status={payment.status === "success" ? "success" : payment.status === "failed" ? "danger" : "warning"}>{payment.status === "success" ? "paid" : payment.status}</Badge>
          </div>
          <p className="muted" style={{ marginTop: 6, fontFamily: "monospace" }}>{payment.txRef}</p>
          <p className="muted" style={{ marginTop: 4 }}>
            {payment.paidAt ? `Paid ${new Date(payment.paidAt).toLocaleString()}${payment.channel ? ` via ${payment.channel.replace(/_/g, " ")}` : ""}` : `Started ${new Date(payment.createdAt).toLocaleString()}`}
          </p>
          {payment.status !== "success" && <Button variant="ghost" onClick={() => void check(payment.txRef)} disabled={checking === payment.txRef} style={{ marginTop: 8 }}>{checking === payment.txRef ? "Checking…" : "Check status"}</Button>}
        </Card>
      ))}

      <h2 className="section-title">Paid months</h2>
      {data?.rentPayments.length ? data.rentPayments.map((payment) => (
        <Card key={payment.paymentMonth}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong>{payment.paymentMonth} · {mkw(payment.amount)}</strong><Badge status="success">paid</Badge></div><p className="muted">Ref {payment.reference} · {new Date(payment.paidAt).toLocaleString()}</p></Card>
      )) : !bookingWindow.loading && <p className="muted">No rent payments recorded yet.</p>}
    </div>
  );
}
