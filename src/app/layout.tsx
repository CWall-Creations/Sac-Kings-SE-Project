import type { Metadata } from "next";
import "./globals.css";

/**
 * Root layout.
 *
 * No webfont: the palette specifies the system sans throughout, including for
 * large figures, so there is nothing to download and no layout shift while it
 * arrives. `--font-sans` is defined in globals.css.
 */
export const metadata: Metadata = {
  title: "Shot Profile Dashboard",
  description:
    "Which shots are efficient or inefficient — shot selection and shot making for twelve players across the 2024-25 season.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
