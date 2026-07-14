import { Syne, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  weight: ["600", "700", "800"],
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta-sans",
  weight: ["400", "500", "600", "700"],
});

export const metadata = {
  title: "Feel-Good News",
  description: "Weekly ranked feel-good news articles for talking-point generation",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`dark ${syne.variable} ${plusJakarta.variable}`}>
      <body>{children}</body>
    </html>
  );
}
