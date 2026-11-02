import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O teste de produção compila em outra pasta para não corromper o servidor de desenvolvimento.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Permite abrir o servidor de desenvolvimento pelo celular na mesma rede.
  allowedDevOrigins: (process.env.DEV_ALLOWED_ORIGINS ?? "").split(",").map((origem) => origem.trim()).filter(Boolean),
  // A tela de consentimento OAuth não pode ser embutida em outro site (proteção contra clickjacking).
  async headers() {
    return [{
      source: "/oauth/:caminho*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "Referrer-Policy", value: "no-referrer" },
      ],
    }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
