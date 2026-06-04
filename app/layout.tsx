import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PE Returns Calculator",
  description: "Private Equity Bruto IRR vs Netto IRR Calculator",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
