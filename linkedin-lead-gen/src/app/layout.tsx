import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "LinkedIn Lead Gen",
  description: "AI-powered lead generation from LinkedIn",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen">
        <nav className="border-b border-gray-800 bg-gray-900/50 backdrop-blur sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-8">
            <span className="font-bold text-lg text-white">
              Lead Gen
            </span>
            <div className="flex gap-6 text-sm">
              <Link
                href="/"
                className="text-gray-400 hover:text-white transition"
              >
                Dashboard
              </Link>
              <Link
                href="/leads"
                className="text-gray-400 hover:text-white transition"
              >
                Leads
              </Link>
              <Link
                href="/drafts"
                className="text-gray-400 hover:text-white transition"
              >
                Drafts
              </Link>
              <Link
                href="/settings"
                className="text-gray-400 hover:text-white transition"
              >
                Settings
              </Link>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
