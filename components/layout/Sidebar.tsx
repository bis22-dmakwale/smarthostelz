// components/layout/Sidebar.tsx — desktop only
"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Building2, ChevronDown, CircleHelp, Menu } from "lucide-react";
import { navIcons, type NavItem } from "./navigation";
import SignOutButton from "./SignOutButton";

export default function Sidebar({ nav }: { nav: NavItem[] }) {
  const path = usePathname();
  const primary = nav.filter((item) => item.primary);
  const crucial = nav.filter((item) => !item.primary && item.crucial);
  const more = nav.filter((item) => !item.primary && !item.crucial);
  const moreActive = more.some((item) => path.startsWith(item.href));
  // Starts open when landing on a page hidden in the menu; the user can then toggle it freely.
  const [menuOpen, setOpen] = useState(moreActive);

  const renderLink = (item: NavItem) => {
    const active = path.startsWith(item.href);
    const Icon = navIcons[item.icon] ?? CircleHelp;
    return (
      <Link key={item.href} href={item.href} className={`nav-link${active ? " nav-link-active" : ""}`} aria-current={active ? "page" : undefined}>
        <span className="nav-link-icon"><Icon size={18} strokeWidth={1.8} /></span>
        {item.label}
      </Link>
    );
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark"><Image src="/logo-white.png" alt="MUBAS crest" width={36} height={36} priority /></span>
        <div>
          <div className="brand-name">MUBAS Hostels</div>
          <div className="brand-caption">Residence portal</div>
        </div>
      </div>
      <div className="nav-caption">Workspace</div>
      <nav className="nav-list" aria-label="Main navigation">
        {primary.map(renderLink)}
        {(crucial.length > 0 || more.length > 0) && (
          <div className="nav-group" role="group" aria-label="Menu">
            {crucial.map(renderLink)}
            {more.length > 0 && (
              <>
                <button type="button" className="nav-link nav-group-toggle"
                        aria-expanded={menuOpen} aria-controls="nav-more-menu" onClick={() => setOpen((value) => !value)}>
                  <span className="nav-link-icon"><Menu size={18} strokeWidth={1.8} /></span>
                  <span className="nav-group-label">{menuOpen ? "Show less" : "More"}</span>
                  <ChevronDown size={16} className={`nav-chevron${menuOpen ? " nav-chevron-open" : ""}`} />
                </button>
                {menuOpen && <div id="nav-more-menu" className="nav-submenu">{more.map(renderLink)}</div>}
              </>
            )}
          </div>
        )}
      </nav>
      <div className="sidebar-footer">
        <Building2 size={17} />
        <span>Malawi University of<br />Business and Applied Sciences</span>
      </div>
      <SignOutButton className="sidebar-signout" />
    </aside>
  );
}