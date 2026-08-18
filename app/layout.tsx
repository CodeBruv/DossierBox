/**
 * DossierBox — Root Layout
 *
 * Composes the global CSS, site header, and site footer into a consistent
 * shell. Private account routes perform their own server-side authorization.
 */
import "./globals.css";
import "@/styles/print.css";
import { SiteHeader, SiteFooter, ThemeProvider } from "@/ui";
import { auth } from "@/auth/auth";
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
    { media: "(prefers-color-scheme: light)", color: "#f6f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#101917" },
  ],
};

const themeInitializer = `
  try {
    const stored = localStorage.getItem("dossierbox-theme");
    const preference = ["light", "dark", "system"].includes(stored) ? stored : "system";
    document.documentElement.dataset.theme = preference;
    document.documentElement.style.colorScheme = preference === "system" ? "light dark" : preference;
  } catch (_) {
    document.documentElement.dataset.theme = "system";
    document.documentElement.style.colorScheme = "light dark";
  }
`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const authenticated = Boolean(session?.user);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitializer }} />
      </head>
      <body>
        <ThemeProvider>
          <SiteHeader authenticated={authenticated} />
          <main id="main-content">{children}</main>
          <SiteFooter authenticated={authenticated} />
        </ThemeProvider>
      </body>
    </html>
  );
}
