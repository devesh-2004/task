import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Keyset Product Browser",
  description: "Consistent cursor pagination over 200k products",
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
