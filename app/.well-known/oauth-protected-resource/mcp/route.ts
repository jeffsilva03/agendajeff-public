import { generateProtectedResourceMetadata, metadataCorsOptionsRequestHandler } from "mcp-handler";
import { emissorOAuth, recursoMcp } from "@/lib/mcp/config";

export const dynamic = "force-dynamic";

/** Metadados do recurso protegido (RFC 9728) para o servidor MCP em /mcp. Público e sem dados de usuário. */
export function GET(req: Request) {
  const corpo = generateProtectedResourceMetadata({
    authServerUrls: [emissorOAuth()],
    resourceUrl: recursoMcp(req),
    additionalMetadata: { resource_name: "AgendaJeff (somente leitura)", bearer_methods_supported: ["header"] },
  });
  return Response.json(corpo, { headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" } });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
