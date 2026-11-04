import {
  ArrowLeftRight,
  BedDouble,
  CreditCard,
  Building2,
  ScanLine,
  House,
  KeyRound,
  LayoutDashboard,
  PackageSearch,
  ReceiptText,
  UsersRound,
  Settings,
  VolumeX,
  Wrench,
} from "lucide-react";

export const navIcons = {
  dashboard: LayoutDashboard,
  credentials: KeyRound,
  students: UsersRound,
  issues: Wrench,
  receipts: ReceiptText,
  payments: CreditCard,
  lostFound: PackageSearch,
  home: House,
  checkin: ScanLine,
  transfer: ArrowLeftRight,
  noise: VolumeX,
  bookings: BedDouble,
  hostels: Building2,
  gate: ScanLine,
  settings: Settings,
} as const;

export type NavIcon = keyof typeof navIcons;
/**
 * `primary`  – top-level tabs (Home, Bookings), always visible.
 * `crucial`  – inside the dropdown, but shown straight away.
 * (neither)  – inside the dropdown, revealed only when "More" is clicked.
 */
export interface NavItem { href: string; label: string; icon: NavIcon; primary?: boolean; crucial?: boolean; }
