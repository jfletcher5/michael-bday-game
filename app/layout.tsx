import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getCurrentSeasonConfig } from "./lib/seasons";
import GlobalNotifications from "./components/GlobalNotifications";
import PollModal from "./components/PollModal";
import EventOverlay from "./components/EventOverlay";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Favicon is the current season's exclusive ball, resolved at build time.
const seasonBallIcon = getCurrentSeasonConfig()?.seasonBall.imageUrl;

export const metadata: Metadata = {
  title: "Michael's Drop Game",
  description: "Survive the rising platforms!",
  icons: seasonBallIcon
    ? { icon: [{ url: seasonBallIcon, type: "image/svg+xml" }] }
    : undefined,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <GlobalNotifications />
        <PollModal />
        <EventOverlay />
      </body>
    </html>
  );
}
