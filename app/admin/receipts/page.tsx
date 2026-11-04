"use client";
import Image from "next/image";
import { useState } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { apiRequest } from "@/lib/api";
import { useApiResource } from "@/components/hostel/useApiResource";
import { mkw } from "@/lib/format";

type Payment = { payment: { id: string; amount: number; method: string; reference: string; status: string; proofPhoto: string | null }; studentName: string; regNo: string | null; receiptId: string | null };
type Online = { id: string; studentName: string; regNo: string | null; paymentMonth: string; amount: number; txRef: string; status: string; channel: string | null; createdAt: string; paidAt: string | null };
type Receipt = { receipt: { id: string; trackingNo: string; amount: number; method: string; paidAt: string; status: string }; studentName: string; regNo: string | null };

export default function AdminReceiptsPage() {
  const payments = useApiResource<Payment[]>("/api/payments");
  const receipts = useApiResource<Receipt[]>("/api/hostel/receipts");
  const online = useApiResource<{ payments: Online[] }>("/api/paychangu/payments");
  const [paymentId, setPaymentId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function review(paymentId: string, status: "verified" | "rejected") {
    setError("");
    try {
      await apiRequest("/api/payments", { method: "PATCH", body: JSON.stringify({ id: paymentId, status }) });
      await payments.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to review payment."); }
  }

  async function issue(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await apiRequest("/api/hostel/receipts", { method: "POST", body: JSON.stringify({ paymentId }) });
      setPaymentId(""); await Promise.all([receipts.refresh(), payments.refresh()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to issue receipt.");
    } finally { setSaving(false); }
  }

  return (
    <div className="grid">
      <Card>
        <h2 className="section-title" style={{ marginTop: 0 }}>Issue receipt for verified payment</h2>
        <form onSubmit={(event) => void issue(event)} style={{ display: "grid", gap: 10 }}>
          <select className="input" value={paymentId} onChange={(event) => setPaymentId(event.target.value)} required>
            <option value="">Select verified payment</option>
            {payments.data?.filter((row) => row.payment.status === "verified" && !row.receiptId).map((row) => <option key={row.payment.id} value={row.payment.id}>{row.studentName} · {row.regNo} · {row.payment.reference} · {mkw(row.payment.amount)}</option>)}
          </select>
          {error && <p role="alert" style={{ color: "var(--danger)" }}>{error}</p>}
          <Button type="submit" disabled={saving || !paymentId}>{saving ? "Generating…" : "Generate receipt"}</Button>
        </form>
      </Card>
      <h2 className="section-title">Online rent payments (PayChangu)</h2>
      <p className="muted">Confirmed automatically with PayChangu; students and admins are emailed on success.</p>
      {online.error && <p role="alert" style={{ color: "var(--danger)" }}>{online.error}</p>}
      {online.data?.payments.map((row) => (
        <Card key={row.id}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong>{row.studentName} · {row.regNo}</strong><Badge status={row.status === "success" ? "success" : row.status === "failed" ? "danger" : "warning"}>{row.status === "success" ? "paid" : row.status}</Badge></div>
          <p className="muted">{row.paymentMonth} · {mkw(row.amount)}{row.channel ? ` · ${row.channel.replace(/_/g, " ")}` : ""} · {new Date(row.paidAt ?? row.createdAt).toLocaleString()}</p>
          <p style={{ fontFamily: "monospace", marginTop: 4 }}>{row.txRef}</p>
        </Card>
      ))}
      {!online.loading && !online.data?.payments.length && <p className="muted">No online payments yet.</p>}
      <h2 className="section-title">Payment verification</h2>
      {payments.error && <p role="alert" style={{ color: "var(--danger)" }}>{payments.error}</p>}
      {payments.data?.map((row) => (
        <Card key={row.payment.id}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong>{row.studentName} · {row.regNo}</strong><Badge status={row.payment.status === "verified" ? "success" : row.payment.status === "rejected" ? "danger" : "warning"}>{row.payment.status}</Badge></div>
          <p className="muted">{row.payment.method} · {row.payment.reference} · {mkw(row.payment.amount)}</p>
          {row.payment.proofPhoto && <a href={row.payment.proofPhoto} target="_blank" rel="noreferrer"><Image src={row.payment.proofPhoto} alt={`Payment proof from ${row.studentName}`} width={280} height={190} unoptimized style={{ maxWidth: 280, maxHeight: 190, objectFit: "contain", marginTop: 10 }} /></a>}
          {row.payment.status === "pending" && <div style={{ display: "flex", gap: 8, marginTop: 10 }}><Button onClick={() => void review(row.payment.id, "verified")}>Verify payment</Button><Button variant="danger" onClick={() => void review(row.payment.id, "rejected")}>Reject</Button></div>}
          {row.payment.status === "verified" && !row.receiptId && <p className="muted" style={{ marginTop: 8 }}>Ready for receipt issuance.</p>}
        </Card>
      ))}
      <h2 className="section-title">Issued receipts</h2>
      {receipts.error && <p role="alert" style={{ color: "var(--danger)" }}>{receipts.error}</p>}
      {receipts.data?.map(({ receipt, studentName, regNo }) => (
        <Card key={receipt.id}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <div><strong>{studentName}</strong><p className="muted">{regNo}</p></div>
            <Badge status="success">{mkw(receipt.amount)}</Badge>
          </div>
          <p className="muted">{receipt.method} · {new Date(receipt.paidAt).toLocaleDateString()}</p>
          <p style={{ fontFamily: "monospace", marginTop: 6 }}>{receipt.trackingNo}</p>
        </Card>
      ))}
      {!receipts.loading && !receipts.data?.length && <p className="muted">No receipts have been issued yet.</p>}
    </div>
  );
}
