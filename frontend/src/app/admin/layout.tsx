"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AdminLayout } from "@/features/admin/layout";

export default function AdminRootLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/admin/login") {
    return <>{children}</>;
  }
  return <AdminLayout>{children}</AdminLayout>;
}
