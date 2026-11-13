import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false };
export const metadata: Metadata = {
  title: "FitMind AI — Sua evolução começa na mente",
  description: "Seu espaço inteligente para treinar, acompanhar resultados e evoluir."
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body className={manrope.variable}>{children}</body></html>;
}
