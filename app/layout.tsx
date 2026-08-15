/**
 * DossierBox — Root Layout
 *
 * Composes the global CSS, site header, and site footer into a consistent
 * shell. Private account routes perform their own server-side authorization.
 */
import "./globals.css";
import "@/styles/print.css";
import { SiteHeader } from "@/ui";
import { SiteFooter } from "@/ui";
import { Viewport, type Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    default: "DossierBox — Professional career documents from your real information",
    template: "%s | DossierBox",
  },
  description:
    "DossierBox turns your real career information into professional documents suited to a specific purpose. Start from your reusable profile, choose a document purpose, and preview, share, and download a polished PDF.",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "DossierBox — Professional career documents",
    description:
      "Turn your real career information into purpose-built professional documents. Preview, share, and download as PDF — from a reusable profile you control.",
    url: "https://dossierbox.com",
    siteName: "DossierBox",
    locale: "en-US",
    type: "website",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        <main id="main-content">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
