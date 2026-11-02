// Endereços do servidor MCP e do servidor de autorização (Supabase Auth, OAuth 2.1).
import { getPublicOrigin } from "mcp-handler";

/** Emissor dos tokens: tem que bater com o `issuer` dos metadados do Supabase Auth. */
export const emissorOAuth = () => process.env.SUPABASE_JWT_ISSUER || `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`;

/** URL pública do recurso MCP (o `resource` do RFC 9728). Em produção, fixe MCP_RESOURCE_URL. */
export const recursoMcp = (req: Request) => process.env.MCP_RESOURCE_URL || `${getPublicOrigin(req)}/mcp`;
