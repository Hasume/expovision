import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { DocumentLanguageSync } from "@/features/document-language";
import { PwaRegister } from "@/features/pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "Expovision AI Academy",
  description: "Managed IT/AI route by Expovision",
  manifest: "/manifest.json",
  icons: {
    icon: "/brand/logo-icon.png",
    shortcut: "/brand/logo-icon.png",
    apple: "/brand/logo-icon.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <PwaRegister />
        <Suspense fallback={null}>
          <DocumentLanguageSync />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
