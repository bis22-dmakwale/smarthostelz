// components/layout/MobileNav.tsx — mobile bottom nav
"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { navIcons, type NavItem } from "./navigation";

export default function MobileNav({ nav }: { nav: NavItem[] }) {
  const path = usePathname();
  const [openFor, setOpenFor] = useState<string | null>(null);
  const bar = nav.filter((item) => item.primary || item.crucial);
  const more = nav.filter((item) => !item.primary && !item.crucial);
  const moreActive = more.some((item) => path.startsWith(item.href));
  // The sheet is tied to the page it was opened on, so navigating closes it.
  const open = openFor === path;

  return (
    <>
      {open && <button type="button" className="mobile-more-backdrop" aria-label="Close menu" onClick={() => setOpenFor(null)} />}
      {open && (
        <div className="mobile-more-sheet" id="mobile-more-menu" role="menu">
          {more.map((item) => {
            const active = path.startsWith(item.href);
            const Icon = navIcons[item.icon] ?? navIcons.home;
            return (
              <Link key={item.href} href={item.href} role="menuitem" onClick={() => setOpenFor(null)}
                    className={`mobile-more-link${active ? " mobile-more-link-active" : ""}`} aria-current={active ? "page" : undefined}>
                <Icon size={18} strokeWidth={1.8} />
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
      <nav className="mobile-nav" aria-label="Main navigation">
        {bar.map((item) => {
          const active = path.startsWith(item.href);
          const Icon = navIcons[item.icon] ?? navIcons.home;
          return (
            <Link key={item.href} href={item.href} className={`mobile-nav-link${active ? " mobile-nav-link-active" : ""}`} aria-current={active ? "page" : undefined}>
              <Icon size={19} strokeWidth={1.8} />
              {item.label}
            </Link>
          );
        })}
        {more.length > 0 && (
          <button type="button" className={`mobile-nav-link mobile-nav-button${open || moreActive ? " mobile-nav-link-active" : ""}`}
                  aria-expanded={open} aria-controls="mobile-more-menu" onClick={() => setOpenFor(open ? null : path)}>
            {open ? <X size={19} strokeWidth={1.8} /> : <Menu size={19} strokeWidth={1.8} />}
            More
          </button>
        )}
      </nav>
    </>
  );
}
