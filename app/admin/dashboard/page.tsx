"use client";
import Card from "@/components/ui/Card";
import GateQrCard from "@/components/hostel/GateQrCard";
import { Activity, ArrowDownRight, ArrowUpRight, ArrowUpRight as LinkArrow, UsersRound, UserRoundCheck, Wrench, ArrowLeftRight } from "lucide-react";
import Link from "next/link";
import { useApiResource } from "@/components/hostel/useApiResource";

type Summary = {
  students: number; checkedInEvents: number; maintenance: number; transfers: number;
  activity: { action: string; gate: string; eventAt: string; name: string; regNo: string | null; hostel: string | null }[];
};

export default function AdminDashboard() {
  const { data, loading, error } = useApiResource<Summary>("/api/hostel/summary");
  const cards = [
    { label: "Student accounts", value: data?.students ?? "—", icon: UsersRound, href: "/admin/students", note: "Registered residents" },
    { label: "Currently checked in", value: data?.checkedInEvents ?? "—", icon: UserRoundCheck, href: "/admin/students", note: "On campus now" },
    { label: "Active maintenance", value: data?.maintenance ?? "—", icon: Wrench, href: "/admin/issues", note: "Requests to follow up" },
    { label: "Pending transfers", value: data?.transfers ?? "—", icon: ArrowLeftRight, href: "/admin/issues", note: "Awaiting review" },
  ];
  return (
    <div className="grid">
      <div className="page-intro">
        <div>
          <div className="page-eyebrow">Administration</div>
          <h2 className="page-heading">Residence overview</h2>
          <p className="page-description">A clear view of student activity and hostel operations.</p>
        </div>
        <Link href="/admin/credentials" className="dashboard-primary-action">
          <UsersRound size={17} /> Issue student credentials <LinkArrow size={15} />
        </Link>
      </div>
      {error && <p role="alert" className="dashboard-error">{error}</p>}
      <GateQrCard />
      <div className="grid dashboard-stats">
        {cards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.label} href={stat.href}>
              <Card className="stat-card">
                <div className="stat-top">
                  <span className="stat-icon"><Icon size={20} strokeWidth={1.8} /></span>
                  <ArrowUpRight size={16} color="var(--text-muted)" />
                </div>
                <div>
                  <div className="stat-value">{loading ? "…" : stat.value}</div>
                  <div className="stat-label">{stat.label}</div>
                  <div className="stat-note">{stat.note}</div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
      <div className="grid dashboard-columns">
        <Card>
          <div className="dashboard-card-heading">
            <div>
              <h2 className="section-title" style={{ margin: 0 }}>Recent gate activity</h2>
              <p className="muted" style={{ marginTop: 5 }}>Latest student check-ins and check-outs</p>
            </div>
            <span className="quick-link-icon"><Activity size={19} /></span>
          </div>
          {data?.activity.length ? data.activity.map((entry, index) => {
            const checkedIn = entry.action === "checked-in";
            const ActionIcon = checkedIn ? ArrowUpRight : ArrowDownRight;
            return (
              <div key={`${entry.eventAt}-${index}`} className="activity-row">
                <span className={`activity-action-icon${checkedIn ? " activity-enter" : " activity-exit"}`}>
                  <ActionIcon size={16} />
                </span>
                <div>
                  <div className="activity-title">{entry.regNo ?? entry.name} <span className="activity-action">{checkedIn ? "checked in" : "checked out"}</span></div>
                  <div className="activity-meta">{entry.hostel ?? "No hostel assigned"} · {entry.gate} · {new Date(entry.eventAt).toLocaleString()}</div>
                </div>
              </div>
            );
          }) : (
            <div className="activity-empty">
              <Activity size={22} />
              <p>{loading ? "Loading recent activity…" : "No student gate activity recorded yet."}</p>
            </div>
          )}
        </Card>
        <Card>
          <h2 className="section-title" style={{ margin: 0 }}>Quick access</h2>
          <p className="muted" style={{ marginTop: 5 }}>Common administration tasks</p>
          <div className="quick-access-list">
            <Link href="/admin/credentials" className="quick-access-link">
              <span className="quick-access-icon"><UsersRound size={17} /></span>
              <span><strong>Issue credentials</strong><small>Create a student account</small></span>
              <LinkArrow size={16} />
            </Link>
            <Link href="/admin/issues" className="quick-access-link">
              <span className="quick-access-icon"><Wrench size={17} /></span>
              <span><strong>Manage open issues</strong><small>Maintenance and transfers</small></span>
              <LinkArrow size={16} />
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
