/**
 * Site navigation link definitions.
 */
export interface NavLink {
  label: string;
  href: string;
}

export const mainNavLinks: NavLink[] = [
  { label: "Home", href: "/" },
  { label: "Services", href: "/services" },
  { label: "Barbers", href: "/barbers" },
  { label: "Contact", href: "/contact" },
];
