import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Portfolio — RAG Assessment",
  description:
    "Document-grounded AI assistant for technical assessment. Chat powered by Retrieval-Augmented Generation.",
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
