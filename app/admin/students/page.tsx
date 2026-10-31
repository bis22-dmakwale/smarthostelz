"use client";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { useApiResource } from "@/components/hostel/useApiResource";

type StudentRow = {
  id: string; name: string; email: string; regNo: string | null;
  hostel: string | null; room: string | null; checkin: "checked-in" | "checked-out" | "none";
};

export default function StudentsPage() {
  const { data: students, loading, error } = useApiResource<StudentRow[]>("/api/hostel/students");
  return (
    <div className="grid">
      {error && <p role="alert" style={{ color: "var(--danger)" }}>{error}</p>}
      <Card style={{ padding: 0, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".85rem", minWidth: 620 }}>
          <thead>
            <tr style={{ background: "var(--primary-light)", textAlign: "left" }}>
              {["Student", "Hostel / Room", "Latest hostel entrance activity"].map((heading) => (
                <th key={heading} style={{ padding: "12px 14px", color: "var(--primary)" }}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students?.map((student) => (
              <tr key={student.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "12px 14px" }}>
                  <div style={{ fontWeight: 600 }}>{student.name}</div>
                  <div className="muted">{student.regNo} · {student.email}</div>
                </td>
                <td style={{ padding: "12px 14px" }}>{student.hostel ? `${student.hostel} · ${student.room}` : "Unassigned"}</td>
                <td style={{ padding: "12px 14px" }}>
                  <Badge status={student.checkin === "checked-in" ? "success" : student.checkin === "checked-out" ? "info" : "warning"}>
                    {student.checkin}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <p className="muted" style={{ padding: 14 }}>Loading students…</p>}
        {!loading && !students?.length && !error && <p className="muted" style={{ padding: 14 }}>No student accounts yet. Issue credentials to add students.</p>}
      </Card>
    </div>
  );
}
