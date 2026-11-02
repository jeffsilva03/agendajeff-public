import { agoraSP } from "@motor";

/** Data local de hoje, ou ?data=AAAA-MM-DD em desenvolvimento para conferir outros dias. */
export function dataDaPagina(param: string | string[] | undefined) {
  const agora = agoraSP();
  const simulada = process.env.NODE_ENV !== "production" && typeof param === "string" && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : null;
  return { data: simulada ?? agora.data, hora: simulada ? null : agora.hora, simulada: !!simulada };
}
