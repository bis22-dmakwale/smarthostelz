"use client";
import { useState } from "react";
import { KeyRound } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { apiRequest } from "@/lib/api";

export default function ChangePasswordForm() {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(""); setSuccess("");
    if (newPassword !== confirmPassword) { setError("The new password and confirmation do not match."); return; }
    setSaving(true);
    try {
      await apiRequest("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword, confirmPassword }) });
      setCurrent(""); setNew(""); setConfirm("");
      setSuccess("Your password has been updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update your password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="section-title" style={{ marginTop: 0 }}>Update password</h2>
      <p className="muted" style={{ marginTop: 5, marginBottom: 18 }}>Use at least 8 characters, including a letter and a number.</p>
      <form onSubmit={submit} className="settings-form">
        <label className="login-field">
          <span className="login-label">Current password</span>
          <Input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} required />
        </label>
        <label className="login-field">
          <span className="login-label">New password</span>
          <Input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(e) => setNew(e.target.value)} required />
        </label>
        <label className="login-field">
          <span className="login-label">Confirm new password</span>
          <Input type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(e) => setConfirm(e.target.value)} required />
        </label>
        {error && <p role="alert" className="login-error">{error}</p>}
        {success && <p role="status" className="settings-success">{success}</p>}
        <Button type="submit" disabled={saving}><KeyRound size={16} />{saving ? "Updating…" : "Update password"}</Button>
      </form>
    </Card>
  );
}
