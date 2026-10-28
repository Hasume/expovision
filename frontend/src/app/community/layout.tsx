"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { CommunityShell } from "@/shared/ui/components";

/**
 * Single shell for the hub: without it every page mounted its own CommunityShell, so each
 * navigation restarted the /community/chats/unread poller and the profile fetch, causing a
 * request storm and upstream overload (503).
 * The `/community` sign-in page stays without the shell.
 */
export default function CommunityLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/community") {
    return <>{children}</>;
  }
  return <CommunityShell>{children}</CommunityShell>;
}
