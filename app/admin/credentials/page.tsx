"use client";
import { useState } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";
import { useApiResource } from "@/components/hostel/useApiResource";
import { apiRequest } from "@/lib/api";

type Credential = { name: string; email: string; regNo: string; gender: string; programmeYears: number; bankAccountNo: string; credentialsEmailed: boolean };
type StudentProfile = { id: string; name: string; regNo: string | null; gender: string | null; programmeYears: number | null; bankAccountNo: string | null };

export default function CredentialsPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [regNo, setRegNo] = useState("");
  const [gender, setGender] = useState("male");
  const [programmeYears, setProgrammeYears] = useState("4");
  const [programmeEdits, setProgrammeEdits] = useState<Record<string, string>>({});
  const [credential, setCredential] = useState<Credential | null>(null);
  const students = useApiResource<StudentProfile[]>("/api/admin/credentials");
  const [eligibility, setEligibility] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [resending, setResending] = useState("");

  async function issue(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setCredential(null);
    try {
      setCredential(await apiRequest<Credential>("/api/admin/credentials", {
        method: "POST", body: JSON.stringify({ name, email, regNo, gender, programmeYears: Number(programmeYears) }),
      }));
      setName(""); setEmail(""); setRegNo(""); await students.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to issue credentials.");
    } finally { setSaving(false); }
  }

  async function resend(student: StudentProfile) {
    setError(""); setNotice(""); setResending(student.id);
    try {
      const result = await apiRequest<{ email: string }>("/api/admin/credentials/resend", { method: "POST", body: JSON.stringify({ id: student.id }) });
      setNotice(`A new temporary password was emailed to ${result.email}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to email new credentials."); }
    finally { setResending(""); }
  }

  async function saveEligibility(student: StudentProfile) {
    const gender = eligibility[student.id];
    if (!gender) return;
    try {
      await apiRequest("/api/admin/credentials", { method: "PATCH", body: JSON.stringify({ id: student.id, gender }) });
      await students.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update student eligibility."); }
  }

  async function saveProgramme(student: StudentProfile) {
    const years = programmeEdits[student.id];
    if (!years) return;
    try {
      await apiRequest("/api/admin/credentials", { method: "PATCH", body: JSON.stringify({ id: student.id, programmeYears: Number(years) }) });
      await students.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update the programme length."); }
  }

  return (
    <div className="grid">
      <Card>
        <h2 className="section-title" style={{ marginTop: 0 }}>Issue student login</h2>
        <p className="muted" style={{ marginBottom: 10 }}>A temporary password is generated and emailed straight to the student. It is never shown to hostel staff.</p>
        <form onSubmit={(event) => void issue(event)} style={{ display: "grid", gap: 10 }}>
          <Input placeholder="Student full name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={200} />
          <Input type="email" placeholder="University email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <Input placeholder="Registration number" value={regNo} onChange={(event) => setRegNo(event.target.value)} required maxLength={60} />
          <select className="input" aria-label="Verified hostel eligibility" value={gender} onChange={(event) => setGender(event.target.value)}>
            <option value="male">Male hostel eligibility</option><option value="female">Female hostel eligibility</option>
          </select>
          <select className="input" aria-label="Programme length" value={programmeYears} onChange={(event) => setProgrammeYears(event.target.value)}>
            <option value="4">4-year programme</option><option value="5">5-year programme</option>
          </select>
          {error && <p role="alert" style={{ color: "var(--danger)" }}>{error}</p>}
          <Button type="submit" disabled={saving}>{saving ? "Creating and emailing…" : "Create account and email login"}</Button>
        </form>
      </Card>
      {credential && (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between" }}><strong>{credential.name}</strong><Badge status="success">Account created</Badge></div>
          <p className="muted">{credential.regNo} · {credential.email}</p>
          <p className="muted">Verified eligibility: {credential.gender} · {credential.programmeYears}-year programme</p>
          <p style={{ fontFamily: "monospace", marginTop: 8 }}>Bank account number: <strong>{credential.bankAccountNo}</strong></p>
          <p role="status" style={{ marginTop: 8 }}>Login details were emailed to <strong>{credential.email}</strong>. The password is not shown here.</p>
        </Card>
      )}
      <Card>
        <h2 className="section-title" style={{ marginTop: 0 }}>Student bank account numbers</h2>
        <p className="muted" style={{ marginBottom: 10 }}>Use the assigned account number to record simulated bank payments. Verify missing hostel eligibility before booking.</p>
        {notice && <p role="status" style={{ color: "var(--success, var(--primary))", marginBottom: 8 }}>{notice}</p>}
        {error && <p role="alert" style={{ color: "var(--danger)", marginBottom: 8 }}>{error}</p>}
        {students.data?.map((student) => (
          <div key={student.id} className="activity-row" style={{ alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1 }}><strong>{student.name}</strong><p className="muted">{student.regNo ?? "No registration number"} · Account {student.bankAccountNo ?? "not assigned"} · {student.programmeYears ? `${student.programmeYears}-year programme` : "programme length missing"}</p></div>
            {!student.programmeYears && <>
              <select className="input" aria-label={`Programme length for ${student.name}`} value={programmeEdits[student.id] ?? ""} onChange={(event) => setProgrammeEdits((values) => ({ ...values, [student.id]: event.target.value }))} style={{ maxWidth: 160 }}>
                <option value="">Programme length</option><option value="4">4 years</option><option value="5">5 years</option>
              </select>
              <Button disabled={!programmeEdits[student.id]} onClick={() => void saveProgramme(student)}>Save</Button>
            </>}
            <Button variant="ghost" disabled={resending === student.id} onClick={() => void resend(student)}>{resending === student.id ? "Sending…" : "Email new password"}</Button>
            {!student.gender && <>
              <select className="input" aria-label={`Verified hostel eligibility for ${student.name}`} value={eligibility[student.id] ?? ""} onChange={(event) => setEligibility((values) => ({ ...values, [student.id]: event.target.value }))} style={{ maxWidth: 180 }}>
                <option value="">Select eligibility</option><option value="male">Male</option><option value="female">Female</option>
              </select>
              <Button disabled={!eligibility[student.id]} onClick={() => void saveEligibility(student)}>Save</Button>
            </>}
          </div>
        ))}
        {!students.loading && !students.data?.length && <p className="muted">No student accounts yet.</p>}
      </Card>
    </div>
  );
}
