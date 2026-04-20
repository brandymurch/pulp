import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pulp - SEO Content Engine",
  description: "POP + Claude content creation tool. Generate SEO-optimized content with AI.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
