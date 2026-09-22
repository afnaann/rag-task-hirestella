import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Afnan PK — Agentic AI Engineer | Grounded RAG Portfolio",
  description:
    "Personal portfolio of Afnan PK, Agentic AI Engineer based in Dubai, UAE. Features a production-grade document-grounded RAG assistant.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
