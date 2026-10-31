// app/admin/layout.tsx
"use client";
import { ReactNode } from "react";
import AppShell from "@/components/layout/AppShell";
import type { NavItem } from "@/components/layout/navigation";

const nav: NavItem[] = [
  { href: "/admin/dashboard", label: "Home", icon: "dashboard", primary: true },
  { href: "/admin/hostels", label: "Hostels", icon: "hostels", crucial: true },
  { href: "/admin/bookings", label: "Bookings", icon: "bookings", primary: true },
  { href: "/admin/gate", label: "Gate scan", icon: "gate", crucial: true },
  { href: "/admin/credentials", label: "Credentials", icon: "credentials" },
  { href: "/admin/students", label: "Students", icon: "students", crucial: true },
  { href: "/admin/issues", label: "Issues", icon: "issues" },
  { href: "/admin/receipts", label: "Receipts", icon: "receipts" },
  { href: "/admin/lost-found", label: "Lost & Found", icon: "lostFound" },
  { href: "/admin/settings", label: "Settings", icon: "settings" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AppShell title="Admin Portal" nav={nav}>{children}</AppShell>;
}