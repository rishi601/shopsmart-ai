import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShopSmart AI | Personalized Shopping",
  description: "Discover products picked for your interests, manage your cart, and shop securely.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
