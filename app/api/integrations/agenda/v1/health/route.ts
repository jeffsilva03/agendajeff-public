export const dynamic = "force-dynamic";

/** Disponibilidade da API. Sem autenticação e sem nenhum dado de usuário, versão interna ou configuração. */
export function GET() {
  return Response.json({ success: true, data: { status: "ok", service: "agendajeff-integrations", apiVersion: "v1" } }, {
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
