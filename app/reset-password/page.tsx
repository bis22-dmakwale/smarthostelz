"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { apiRequest } from "@/lib/api";

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [newPassword, setNew] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) { setError("The new password and confirmation do not match."); return; }
    setSubmitting(true);
    try {
      await apiRequest("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token, newPassword, confirmPassword }) });
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to reset your password.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (<>
      <p role="alert" className="login-error">This reset link is missing its token. Request a new link.</p>
      <p className="login-link-row"><Link href="/forgot-password">Request a new link</Link></p>
    </>);
  }
  if (done) {
    return (<>
      <p role="status" className="settings-success"><CheckCircle2 size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />Your password has been reset. You can now sign in.</p>
      <p className="login-link-row"><Link href="/login">Go to sign in</Link></p>
    </>);
  }
  return (
    <form onSubmit={submit} className="login-form">
      <label className="login-field">
        <span className="login-label">New password</span>
        <Input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(e) => setNew(e.target.value)} required />
      </label>
      <label className="login-field">
        <span className="login-label">Confirm new password</span>
        <Input type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(e) => setConfirm(e.target.value)} required />
      </label>
      {error && <p role="alert" className="login-error">{error}</p>}
      <Button type="submit" disabled={submitting}>{submitting ? "Resetting…" : "Reset password"}</Button>
      <p className="login-link-row"><Link href="/forgot-password">Request a new link</Link></p>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="login-page" style={{ gridTemplateColumns: "1fr" }}>
      <section className="login-form-panel">
        <div className="login-form-wrap">
          <div className="login-heading">Choose a new password</div>
          <p className="login-description">Use at least 8 characters, including a letter and a number.</p>
          <Suspense fallback={null}><ResetForm /></Suspense>
        </div>
      </section>
    </main>
  );
}
