"use client";
import ChangePasswordForm from "@/components/hostel/ChangePasswordForm";

export default function SettingsPage() {
  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 560 }}>
      <ChangePasswordForm />
    </div>
  );
}
