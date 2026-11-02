import { esquemas, hojeSP } from "@/lib/api/parametros";
import { rotaDeLeitura } from "@/lib/api/rota";
import { visaoDoDia } from "@/lib/api/servicos/hoje";

export const dynamic = "force-dynamic";

/** Visão do dia (padrão: hoje em São Paulo), com a mesma lógica da tela Hoje. */
export const GET = rotaDeLeitura("today", esquemas.hoje, ({ id, params, notas }) => visaoDoDia(id, params.date ?? hojeSP(), notas));
