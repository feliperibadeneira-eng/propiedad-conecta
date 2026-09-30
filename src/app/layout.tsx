import type { Metadata } from "next";
import "./globals.css";
import { BRAND_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${BRAND_NAME} — Encuentra la propiedad que estás buscando`,
  description:
    "Publica lo que buscas y conecta con agentes inmobiliarios que pueden ayudarte a encontrarlo.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="flex min-h-screen flex-col antialiased">
        {children}
      </body>
    </html>
  );
}
