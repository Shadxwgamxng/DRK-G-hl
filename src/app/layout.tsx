import type { Metadata, Viewport } from "next";
import "@fontsource/open-sans/400.css";
import "@fontsource/open-sans/600.css";
import "@fontsource/open-sans/700.css";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/pwa";

export const metadata: Metadata = {
  title: { default: "KFZ-Warte – DRK Ortsverein Göhl e.V.", template: "%s · KFZ-Warte DRK Göhl" },
  description: "Fahrzeug-, Material- und Mängelverwaltung der KFZ-Warte",
  manifest: "/manifest.webmanifest",
  applicationName: "KFZ-Warte",
  appleWebApp: { capable: true, title: "KFZ-Warte", statusBarStyle: "default" },
  icons: { icon: [{ url: "/icons/favicon-32.png", sizes: "32x32" }, { url: "/icons/icon-192.png", sizes: "192x192" }], apple: "/icons/apple-touch-icon.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#e60005",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-dvh">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
