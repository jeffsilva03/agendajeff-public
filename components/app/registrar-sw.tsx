"use client";

import { useEffect } from "react";
import { URL_SW } from "@/lib/sw";

export function RegistrarSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register(URL_SW).catch(() => {});
  }, []);
  return null;
}
