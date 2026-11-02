import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RegistrarSW } from "@/components/app/registrar-sw";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cadeia",
  description: "Hábitos, agenda e freelas do Jefferson",
  appleWebApp: { capable: true, title: "Cadeia", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0f12" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${GeistSans.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full" suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          <TooltipProvider delayDuration={300}>
            {children}
            <Toaster position="top-center" />
            <RegistrarSW />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
