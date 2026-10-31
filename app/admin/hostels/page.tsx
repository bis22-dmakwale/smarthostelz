"use client";
import { useState } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";
import { Power, Save, Trash2 } from "lucide-react";
import { useApiResource } from "@/components/hostel/useApiResource";
import { apiRequest } from "@/lib/api";

type Hostel = {
  id: string; name: string; gender: string; active: boolean;
  rooms: { id: string; roomNo: string; capacity: number; occupied: number; active: boolean }[];
};

export default function HostelsPage() {
  const inventory = useApiResource<Hostel[]>("/api/hostels");
  const [name, setName] = useState("");
  const [gender, setGender] = useState("male");
  const [hostelId, setHostelId] = useState("");
  const [roomNo, setRoomNo] = useState("");
  const [capacity, setCapacity] = useState("4");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [capacityDrafts, setCapacityDrafts] = useState<Record<string, string>>({});

  async function save(event: React.FormEvent, action: "hostel" | "room") {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await apiRequest("/api/hostels", {
        method: "POST",
        body: JSON.stringify(action === "hostel" ? { name, gender } : { action: "create-room", hostelId, roomNo, capacity: Number(capacity) }),
      });
      if (action === "hostel") setName("");
      else { setRoomNo(""); setCapacity("4"); }
      await inventory.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the hostel information.");
    } finally { setSaving(false); }
  }

  async function updateHostel(hostel: Hostel, active: boolean) {
    setError(""); setBusyId(hostel.id);
    try {
      await apiRequest("/api/hostels", { method: "PATCH", body: JSON.stringify({ action: "update-hostel", id: hostel.id, active }) });
      await inventory.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update hostel."); }
    finally { setBusyId(""); }
  }

  async function updateRoom(room: Hostel["rooms"][number], active?: boolean) {
    setError(""); setBusyId(room.id);
    try {
      await apiRequest("/api/hostels", { method: "PATCH", body: JSON.stringify({
        action: "update-room", id: room.id, capacity: Number(capacityDrafts[room.id] ?? room.capacity), active,
      }) });
      await inventory.refresh();
      setCapacityDrafts((drafts) => { const next = { ...drafts }; delete next[room.id]; return next; });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update room."); }
    finally { setBusyId(""); }
  }

  async function remove(kind: "hostel" | "room", id: string, label: string) {
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    setError(""); setBusyId(id);
    try {
      await apiRequest("/api/hostels", { method: "DELETE", body: JSON.stringify({ kind, id }) });
      await inventory.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : `Unable to delete ${label}.`); }
    finally { setBusyId(""); }
  }

  const hostels = inventory.data ?? [];
  return (
    <div className="grid">
      <div className="page-intro"><div><div className="page-eyebrow">Accommodation</div><h2 className="page-heading">Hostels and room capacity</h2><p className="page-description">Configure hostel eligibility and bed counts for administrator assignments.</p></div></div>
      {error && <p role="alert" style={{ color: "var(--danger)" }}>{error}</p>}
      <div className="grid grid-2">
        <Card>
          <h2 className="section-title" style={{ marginTop: 0 }}>Add a hostel</h2>
          <form onSubmit={(event) => void save(event, "hostel")} style={{ display: "grid", gap: 10 }}>
            <Input aria-label="Hostel name" placeholder="Hostel name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} />
            <select className="input" aria-label="Eligible residents" value={gender} onChange={(event) => setGender(event.target.value)}>
              <option value="male">Male residents</option><option value="female">Female residents</option>
            </select>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Add hostel"}</Button>
          </form>
        </Card>
        <Card>
          <h2 className="section-title" style={{ marginTop: 0 }}>Add a room</h2>
          <form onSubmit={(event) => void save(event, "room")} style={{ display: "grid", gap: 10 }}>
            <select className="input" aria-label="Hostel" value={hostelId} onChange={(event) => setHostelId(event.target.value)} required>
              <option value="">Select hostel</option>{hostels.map((hostel) => <option key={hostel.id} value={hostel.id}>{hostel.name}</option>)}
            </select>
            <Input aria-label="Room number" placeholder="Room number" value={roomNo} onChange={(event) => setRoomNo(event.target.value)} required maxLength={40} />
            <Input aria-label="Bed capacity" type="number" min="1" max="20" value={capacity} onChange={(event) => setCapacity(event.target.value)} required />
            <Button type="submit" disabled={saving || !hostels.length}>{saving ? "Saving…" : "Add room"}</Button>
          </form>
        </Card>
      </div>
      {inventory.error && <p role="alert" style={{ color: "var(--danger)" }}>{inventory.error}</p>}
      <h2 className="section-title">Live availability</h2>
      {hostels.map((hostel) => (
        <Card key={hostel.id}>
          <div className="inventory-heading">
            <div><strong>{hostel.name}</strong><p className="muted">{hostel.gender} residents · {hostel.rooms.reduce((total, room) => total + room.occupied, 0)} currently assigned</p></div>
            <div className="inventory-actions">
              <Badge status={hostel.active ? "success" : "neutral"}>{hostel.active ? "active" : "inactive"}</Badge>
              <Button variant="ghost" disabled={busyId === hostel.id || (hostel.active && hostel.rooms.some((room) => room.occupied > 0))} onClick={() => void updateHostel(hostel, !hostel.active)}><Power size={15} /> {hostel.active ? "Deactivate" : "Activate"}</Button>
              <Button variant="danger" disabled={busyId === hostel.id || hostel.rooms.some((room) => room.occupied > 0)} onClick={() => void remove("hostel", hostel.id, hostel.name)}><Trash2 size={15} /> Delete</Button>
            </div>
          </div>
          {hostel.rooms.length ? hostel.rooms.map((room) => (
            <div key={room.id} className="inventory-room">
              <div className="inventory-room-info"><strong>Room {room.roomNo}</strong><div className="muted">{room.occupied} occupied · {Math.max(0, room.capacity - room.occupied)} available</div></div>
              <Input aria-label={`Capacity for ${hostel.name} room ${room.roomNo}`} type="number" min={Math.max(1, room.occupied)} max="20" value={capacityDrafts[room.id] ?? String(room.capacity)} onChange={(event) => setCapacityDrafts((drafts) => ({ ...drafts, [room.id]: event.target.value }))} style={{ width: 84 }} />
              <Button variant="ghost" aria-label={`Save capacity for room ${room.roomNo}`} title="Save capacity" disabled={busyId === room.id || Number(capacityDrafts[room.id] ?? room.capacity) === room.capacity} onClick={() => void updateRoom(room)}><Save size={16} /></Button>
              <Button variant="ghost" disabled={busyId === room.id || (room.active && room.occupied > 0)} onClick={() => void updateRoom(room, !room.active)}><Power size={15} /> {room.active ? "Deactivate" : "Activate"}</Button>
              <Button variant="danger" aria-label={`Delete room ${room.roomNo}`} disabled={busyId === room.id || room.occupied > 0} onClick={() => void remove("room", room.id, `${hostel.name} room ${room.roomNo}`)}><Trash2 size={15} /></Button>
            </div>
          )) : <p className="muted" style={{ marginTop: 10 }}>No rooms have been added.</p>}
        </Card>
      ))}
      {!inventory.loading && !hostels.length && <p className="muted">No hostels configured yet.</p>}
    </div>
  );
}