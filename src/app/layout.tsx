import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Preload Material Symbols font for icon rendering reliability
const materialSymbolsUrl = "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=block";

export const metadata: Metadata = {
  title: "Wishubest — Global Medical Tourism Marketplace",
  description: "Compare and book verified doctors, hospitals, accommodations and translators worldwide. Secure platform payments, multilingual support.",
  keywords: ["medical tourism", "healthcare", "doctors", "hospitals", "telemedicine", "medical travel"],
  icons: { icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg" },
};

/**
 * Extract the locale from the `x-locale` request header (set by middleware
 * when a locale-prefixed path like /en/... is matched). Falls back to 'en'
 * for non-locale routes (/dashboard, /api, /).
 */
async function getLocaleFromHeaders(): Promise<string> {
  const headersList = await headers()
  return headersList.get("x-locale") || "en"
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocaleFromHeaders()

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={materialSymbolsUrl} />
      </head>
      <body className={`${inter.variable} font-sans antialiased bg-background text-foreground`}>
        {children}
        <Toaster />
        <SonnerToaster position="top-center" richColors />
      </body>
    </html>
  );
}
