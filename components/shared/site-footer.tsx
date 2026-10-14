import Link from "next/link";
import { Scissors } from "lucide-react";

import { APP_NAME } from "@/config/app";
import { mainNavLinks } from "@/config/navigation";

// Static year — acceptable for a copyright notice.
// Update manually or via CI when a new year begins.
const CURRENT_YEAR = 2025;

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="container mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {/* Brand */}
          <div className="flex flex-col gap-3">
            <Link
              href="/"
              className="flex items-center gap-2 font-semibold text-base"
            >
              <Scissors className="size-4 text-primary" aria-hidden="true" />
              <span>{APP_NAME}</span>
            </Link>
            <p className="text-sm text-muted-foreground max-w-xs">
              Premium hair salon services. Book your appointment online,
              anytime.
            </p>
          </div>

          {/* Navigation */}
          <div>
            <h3 className="mb-3 text-sm font-semibold">Navigation</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {mainNavLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact — TODO: populate from salon_settings once admin UI is live */}
          <div>
            <h3 className="mb-3 text-sm font-semibold">Contact</h3>
            <address className="not-italic space-y-1 text-sm text-muted-foreground">
              <p>Raj Faded Studio</p>
              <p>India</p>
            </address>
          </div>
        </div>

        <div className="mt-10 border-t border-border pt-6 text-center text-xs text-muted-foreground">
          <p>
            &copy; {CURRENT_YEAR} {APP_NAME}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
