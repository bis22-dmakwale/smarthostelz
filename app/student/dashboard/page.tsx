"use client";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { ArrowRight, ArrowUpRight, PackageSearch, ScanLine, Wrench, ArrowLeftRight, VolumeX, ReceiptText, House } from "lucide-react";
import { useApiResource } from "@/components/hostel/useApiResource";

type Assignment = { hostel: string; room: string } | null;
type Event = { action: "checked-in" | "checked-out"; eventAt: string }[];

export default function StudentDashboard() {
  const assignment = useApiResource<Assignment>("/api/hostel/assignment");
  const activity = useApiResource<Event>("/api/hostel/checkins");
  const status = activity.data?.[0]?.action ?? "none";

  return (
    <div className="grid">
      <div className="page-intro">
        <div>
          <div className="page-eyebrow">Student portal</div>
          <h2 className="page-heading">Your residence, at a glance</h2>
          <p className="page-description">Manage your accommodation and stay connected with the hostel office.</p>
        </div>
      </div>
      <Card className="student-room-card">
        <div className="student-room-copy">
          <div className="student-room-kicker"><House size={16} /> Current accommodation</div>
          <div className="student-room-title">
            {assignment.loading ? "Loading your room…" : assignment.data ? assignment.data.hostel : "No room assigned"}
          </div>
          <div className="student-room-subtitle">
            {assignment.data ? `Room ${assignment.data.room}` : "Contact the hostel office for assistance"}
          </div>
          <div className="student-room-status">
            <Badge status={status === "checked-in" ? "success" : status === "checked-out" ? "info" : "warning"}>
              {status === "none" ? "No recent gate activity" : status === "checked-in" ? "Currently checked in" : "Currently checked out"}
            </Badge>
          </div>
          {assignment.error && <p role="alert" className="student-room-error">{assignment.error}</p>}
        </div>
        <div className="student-room-art" aria-hidden="true"><House size={112} strokeWidth={.8} /></div>
        <Link href="/student/checkin" className="student-room-button">
          <span><ScanLine size={17} /> Check in or out <ArrowRight size={16} /></span>
        </Link>
      </Card>
      <div className="section-heading">
        <div><h3>Quick actions</h3><p>Get things done with a few taps.</p></div>
      </div>
      <div className="grid grid-3">
        {[
          { href: "/student/maintenance", icon: Wrench, label: "Report a repair", description: "Tell us about a room issue" },
          { href: "/student/transfer", icon: ArrowLeftRight, label: "Request transfer", description: "Ask to change your room" },
          { href: "/student/lostfound", icon: PackageSearch, label: "Lost & found", description: "Report or find an item" },
        ].map((action) => (
          <Link key={action.href} href={action.href} className="action-card-link">
            <Card className="action-card">
              <span className="quick-link-icon"><action.icon size={20} /></span>
              <span className="action-card-copy">
                <strong>{action.label}</strong>
                <small>{action.description}</small>
              </span>
              <ArrowUpRight size={17} className="action-card-arrow" />
            </Card>
          </Link>
        ))}
      </div>
      <div className="section-heading section-heading-spaced">
        <div><h3>Residence services</h3><p>Keep up with your account and the services available to you.</p></div>
      </div>
      <div className="grid grid-2 student-service-grid">
        {[
          { href: "/student/complaints", icon: VolumeX, title: "Anonymous noise report", subtitle: "Send a private report to the hostel office." },
          { href: "/student/receipts", icon: ReceiptText, title: "Payment receipts", subtitle: "View your payment history and tracking numbers." },
          { href: "/student/checkin", icon: ScanLine, title: "Gate activity", subtitle: "Review your digital hostel visit history." },
        ].map((item) => (
          <Link key={item.href} href={item.href} className="service-card-link">
            <Card className="service-card">
              <span className="service-icon"><item.icon size={19} /></span>
              <div><strong>{item.title}</strong><p className="muted">{item.subtitle}</p></div>
              <ArrowRight size={16} className="service-arrow" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
