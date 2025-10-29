import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FPL Decision Helper",
  description: "EO-aware FPL assistant for smart captaincy, XI, and transfer decisions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ConvexClientProvider>
          <div className="min-h-screen bg-background">
            <nav className="border-b">
              <div className="container mx-auto px-4 py-4">
                <div className="flex items-center justify-between">
                  <h1 className="text-2xl font-bold text-primary">FPL Decision Helper</h1>
                  <div className="flex gap-4">
                    <a href="/" className="hover:text-primary transition-colors">Dashboard</a>
                    <a href="/captain" className="hover:text-primary transition-colors">Captain</a>
                    <a href="/xi" className="hover:text-primary transition-colors">XI</a>
                    <a href="/transfers" className="hover:text-primary transition-colors">Transfers</a>
                    <a href="/data-entry" className="hover:text-primary transition-colors">Data Entry</a>
                    <a href="/settings" className="hover:text-primary transition-colors">Settings</a>
                  </div>
                </div>
              </div>
            </nav>
            <main className="container mx-auto px-4 py-8">
              {children}
            </main>
          </div>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
