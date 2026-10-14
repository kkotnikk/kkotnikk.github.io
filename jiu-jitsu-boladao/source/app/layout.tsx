import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jiu-Jitsu Boladão",
  description: "Aprenda jiu-jitsu com aulas organizadas e acompanhe seu progresso.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
