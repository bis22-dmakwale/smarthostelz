"use client";
import { useState } from "react";
import Link from "next/link";
import { MailCheck, ShieldCheck } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { apiRequest } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(""); setSubmitting(true);
    try {
      await apiRequest("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to send the reset link.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page" style={{ gridTemplateColumns: "1fr" }}>
      <section className="login-form-panel">
        <div className="login-form-wrap">
          <div className="login-heading">Forgot your password?</div>
          <p className="login-description">Enter your university email and we&apos;ll send you a link to choose a new password.</p>
          {sent ? (
            <p role="status" className="settings-success"><MailCheck size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />
              If an account exists for {email.trim()}, a reset link is on its way. It expires in 30 minutes.</p>
          ) : (
            <form onSubmit={submit} className="login-form">
              <label className="login-field">
                <span className="login-label">University email</span>
                <Input type="email" autoComplete="username" placeholder="you@mubas.ac.mw" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
              {error && <p role="alert" className="login-error">{error}</p>}
              <Button type="submit" disabled={submitting}>{submitting ? "Sending…" : "Send reset link"}</Button>
            </form>
          )}
          <p className="login-link-row"><Link href="/login">Back to sign in</Link></p>
          <div className="login-note"><ShieldCheck size={16} /><span>Can&apos;t get the email? Contact the hostel office to have your password reset.</span></div>
        </div>
      </section>
    </main>
  );
}
