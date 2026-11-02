import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { autenticarToken } from "@/lib/api/auth";
import { registrarFerramentas } from "@/lib/mcp/ferramentas";
import { recursoMcp } from "@/lib/mcp/config";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const servidor = createMcpHandler((server) => registrarFerramentas(server), {
  serverInfo: { name: "agendajeff", version: "1.0.0" },
});

/**
 * Só aceita Bearer validado no Supabase Auth (token OAuth de um cliente autorizado pelo usuário ou
 * token de sessão do próprio usuário). Sem token válido: 401 com WWW-Authenticate apontando para
 * os metadados do recurso protegido (RFC 9728), que é como o cliente descobre onde fazer login.
 */
async function verificarToken(_req: Request, token?: string): Promise<AuthInfo | undefined> {
  if (!token) return undefined;
  try {
    const identidade = await autenticarToken(token);
    return {
      token,
      clientId: identidade.clienteOAuth ?? "sessao-do-usuario",
      scopes: [],
      resource: new URL(recursoMcp(_req)),
      extra: { identidade },
    };
  } catch {
    return undefined;
  }
}

const comAuth = withMcpAuth(servidor, verificarToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource/mcp",
});

export { comAuth as GET, comAuth as POST, comAuth as DELETE };
