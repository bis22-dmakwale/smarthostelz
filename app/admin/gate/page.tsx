"use client";
import { useState } from "react";
import { UserRound } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { useApiResource } from "@/components/hostel/useApiResource";
import { apiRequest } from "@/lib/api";

type VisitorEvent = { id: string; fullName: string; identifier: string; gate: string; eventAt: string };
export default function GatePage() {
  const visitors = useApiResource<VisitorEvent[]>("/api/gate/visitors");
  const [error, setError] = useState("");
  const [fullName, setFullName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [saving, setSaving] = useState(false);
  const [visitorSaved, setVisitorSaved] = useState("");

  async function recordVisitor(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setVisitorSaved("");
    try {
      await apiRequest("/api/gate/visitors", {
        method: "POST", body: JSON.stringify({ fullName, identifier, gate: "Hostel gate" }),
      });
      setVisitorSaved(`${fullName.trim()} recorded for this entry.`);
      setFullName(""); setIdentifier(""); await visitors.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to record visitor entry.");
    } finally { setSaving(false); }
  }

  return <div className="grid">
    <div className="page-intro"><div><div className="page-eyebrow">Hostel entrance</div><h2 className="page-heading">Visitor entries</h2><p className="page-description">Record each non-resident hostel entrance and review recent visitor records.</p></div></div>
    <div className="grid grid-2">
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}><UserRound size={20} color="var(--primary)" /><h2 className="section-title" style={{ margin: 0 }}>Visitor entry</h2></div>
        <p className="muted" style={{ margin: "8px 0 14px" }}>A fresh entry is recorded each time an unallocated visitor arrives.</p>
        <form onSubmit={(event) => void recordVisitor(event)} style={{ display: "grid", gap: 10 }}>
          <Input placeholder="Visitor full name" value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={150} required />
          <Input placeholder="Identification number" value={identifier} onChange={(event) => setIdentifier(event.target.value)} maxLength={100} required />
          <Button type="submit" disabled={saving}>{saving ? "Recording…" : "Record visitor entry"}</Button>
        </form>
        {error && <p role="alert" style={{ color: "var(--danger)", marginTop: 10 }}>{error}</p>}
        {visitorSaved && <p role="status" style={{ color: "var(--success)", marginTop: 10 }}>{visitorSaved}</p>}
      </Card>
    </div>
    <Card>
      <h2 className="section-title" style={{ marginTop: 0 }}>Recent visitor entries</h2>
      {visitors.error && <p role="alert" style={{ color: "var(--danger)" }}>{visitors.error}</p>}
      {visitors.data?.map((entry) => <div key={entry.id} className="activity-row"><div><strong>{entry.fullName}</strong><p className="muted">ID {entry.identifier} · {entry.gate} · {new Date(entry.eventAt).toLocaleString()}</p></div></div>)}
      {!visitors.loading && !visitors.data?.length && <p className="muted">No visitor entries have been recorded.</p>}
    </Card>
  </div>;
}