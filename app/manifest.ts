import type { MetadataRoute } from "next";

// Widget do painel de Widgets do Windows 11 (PWA instalado pelo Edge). O tipo do Next ainda não conhece "widgets".
const widgets = [{
  name: "Cadeia: hoje",
  short_name: "Hoje",
  description: "Hábitos do dia, próximas tarefas, agenda, metas do mês e uma frase para o empurrão.",
  tag: "cadeia-hoje",
  template: "cadeia-hoje",
  ms_ac_template: "/widgets/agenda.json",
  data: "/api/widget?formato=adaptive",
  type: "application/json",
  screenshots: [{ src: "/widgets/screenshot.png", sizes: "600x400", label: "Widget Cadeia: hoje" }],
  icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
  auth: false,
  update: 1800,
  multiple: false,
}];

export default function manifest(): MetadataRoute.Manifest {
  return {
    ...({ widgets } as object),
    name: "Cadeia: hábitos, agenda e freelas",
    short_name: "Cadeia",
    description: "Hábitos em cadeia, agenda e freelas do Jefferson",
    lang: "pt-BR",
    start_url: "/hoje",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0d0f12",
    theme_color: "#0d0f12",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
