// app/student/layout.tsx
"use client";
import { ReactNode } from "react";
import AppShell from "@/components/layout/AppShell";
import type { NavItem } from "@/components/layout/navigation";

const nav: NavItem[] = [
  { href: "/student/dashboard", label: "Home", icon: "home", primary: true },
  { href: "/student/bookings", label: "Bookings", icon: "bookings", primary: true },
  { href: "/student/checkin", label: "Check-in", icon: "checkin", crucial: true },
  { href: "/student/receipts", label: "Receipts", icon: "receipts", crucial: true },
  { href: "/student/maintenance", label: "Repairs", icon: "issues", crucial: true },
  { href: "/student/transfer", label: "Transfer", icon: "transfer" },
  { href: "/student/complaints", label: "Noise", icon: "noise" },
  { href: "/student/lostfound", label: "Lost & Found", icon: "lostFound" },
  { href: "/student/settings", label: "Settings", icon: "settings" },
];

export default function StudentLayout({ children }: { children: ReactNode }) {
  return <AppShell title="Student Portal" nav={nav}>{children}</AppShell>;
}