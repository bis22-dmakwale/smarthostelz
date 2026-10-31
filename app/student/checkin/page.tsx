"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, ScanLine } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { useApiResource } from "@/components/hostel/useApiResource";
import { apiRequest } from "@/lib/api";

type Event = { id: string; action: "checked-in" | "checked-out"; gate: string; eventAt: string };
type Assignment = { hostel: string; room: string } | null;

export default function CheckinPage() {
  const history = useApiResource<Event[]>("/api/hostel/checkins");
  const refreshHistory = history.refresh;
  const assignment = useApiResource<Assignment>("/api/hostel/assignment");
  const video = useRef<HTMLVideoElement>(null);
  const handled = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const lastEvent = history.data?.[0];
  const currentStatus = lastEvent?.action ?? "none";
  const action = currentStatus === "checked-in" ? "checked-out" : "checked-in";

  useEffect(() => {
    if (!scanning || !video.current) return;
    let active = true;
    let stopScanner: (() => void) | undefined;
    async function startCamera() {
      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        if (!active || !video.current) return;
        const reader = new BrowserQRCodeReader();
        const controls = await reader.decodeFromConstraints({
          video: { facingMode: { ideal: "environment" } },
        }, video.current, (result) => {
          if (!result || handled.current) return;
          handled.current = true;
          void apiRequest("/api/gate/scan", {
            method: "POST", body: JSON.stringify({ code: result.getText(), action }),
          }).then(async () => {
            await refreshHistory();
            setError("");
          }).catch((cause: unknown) => {
            setError(cause instanceof Error ? cause.message : "Unable to record this hostel entrance scan.");
          }).finally(() => setScanning(false));
        });
        stopScanner = () => controls.stop();
        if (!active) controls.stop();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Camera access failed. Allow access and try again.");
        setScanning(false);
      }
    }
    void startCamera();
    return () => { active = false; stopScanner?.(); };
  }, [scanning, action, refreshHistory]);

  function startScan() {
    handled.current = false;
    setError("");
    setScanning(true);
  }

  return (
    <div className="grid">
      <Card style={{ textAlign: "center", padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10 }}><Camera size={20} color="var(--primary)" /><h2 style={{ fontWeight: 800, fontSize: "1.1rem" }}>Scan hostel entrance QR</h2></div>
        <h2 style={{ fontWeight: 800, fontSize: "1.1rem" }}>Digital check-in / check-out</h2>
        <p className="muted" style={{ margin: "8px 0 16px" }}>
          {assignment.data ? `${assignment.data.hostel} · Room ${assignment.data.room}` : "Your active room assignment is required."}
        </p>
        <div style={{ maxWidth: 520, margin: "0 auto", overflow: "hidden", borderRadius: 8, background: "#111", aspectRatio: "4 / 3" }}>
          <video ref={video} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: scanning ? "block" : "none" }} />
          {!scanning && <div style={{ minHeight: 180, height: "100%", display: "grid", placeItems: "center", color: "#fff" }}><ScanLine size={52} strokeWidth={1.4} /></div>}
        </div>
        <p className="muted" style={{ marginTop: 12 }}>Next action: <strong>{action === "checked-in" ? "Check in" : "Check out"}</strong></p>
        <Button onClick={startScan} disabled={scanning || !assignment.data} style={{ marginTop: 12 }}>{scanning ? "Camera active · waiting for QR" : `Start ${action === "checked-in" ? "check-in" : "check-out"} scan`}</Button>
        {error && <p role="alert" style={{ color: "var(--danger)", marginTop: 12 }}>{error}</p>}
        {history.error && <p role="alert" style={{ color: "var(--danger)", marginTop: 12 }}>{history.error}</p>}
        {assignment.error && <p role="alert" style={{ color: "var(--danger)", marginTop: 12 }}>{assignment.error}</p>}
      </Card>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong>Current status</strong>
          <Badge status={currentStatus === "checked-in" ? "success" : currentStatus === "checked-out" ? "info" : "warning"}>
            {currentStatus === "none" ? "No activity" : currentStatus}
          </Badge>
        </div>
        <h3 className="section-title">Recent hostel entrance activity</h3>
        {history.loading && <p className="muted">Loading activity…</p>}
        {!history.loading && !history.data?.length && <p className="muted">No check-in records yet.</p>}
        {history.data?.map((event) => (
          <p key={event.id} className="muted" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            {new Date(event.eventAt).toLocaleString()} · {event.action} · {event.gate}
          </p>
        ))}
      </Card>
    </div>
  );
}
