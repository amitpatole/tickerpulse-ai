```typescript
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import KeyboardShortcutsProvider from "@/components/layout/KeyboardShortcutsProvider";
import SSEAccessibilityAnnouncer from "@/components/accessibility/SSEAccessibilityAnnouncer";
import { SidebarStateProvider } from "@/components/layout/SidebarStateProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TickerPulse AI v3.0",
  description: "Multi-agent AI stock research and monitoring dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-950 text-slate-200`}
      >
        <SSEAccessibilityAnnouncer />
        <SidebarStateProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 min-w-0 overflow-x-hidden">
              <KeyboardShortcutsProvider>
                {children}
              </KeyboardShortcutsProvider>
            </main>
          </div>
        </SidebarStateProvider>
      </body>
    </html>
  );
}
```