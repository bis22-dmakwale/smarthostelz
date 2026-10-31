// components/layout/Header.tsx
"use client";
import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { sessionSnapshot, subscribeSession } from "@/lib/auth";
import type { User } from "@/lib/types";
import SignOutButton from "./SignOutButton";

export default function Header({ title }: { title: string }) {
  const raw = useSyncExternalStore(subscribeSession, sessionSnapshot, () => null);
  const user = useMemo(() => {
    if (!raw) return null;
    try { return JSON.parse(raw) as User; } catch { return null; }
  }, [raw]);
  const initials = user?.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() ?? "MH";
  return (
    <header className="topbar">
      <div>
        <h1 className="topbar-title">{title}</h1>
        <p className="topbar-caption">MUBAS Smart Hostels · Residence services</p>
      </div>
      <div className="header-tools">
        <Link href={user?.role === "admin" ? "/admin/settings" : "/student/settings"} className="profile header-profile-link" title="Account settings">
          <span className="avatar" aria-hidden="true">{initials}</span>
          <div>
            <div className="profile-name">{user?.name ?? "Hostel account"}</div>
            <div className="profile-caption">{user?.role === "admin" ? "Administrator" : user?.regNo ?? "Student"}</div>
          </div>
          <ShieldCheck size={17} color="var(--primary)" aria-label="Secure account" />
        </Link>
        <SignOutButton className="header-signout" />
      </div>
    </header>
  );
}