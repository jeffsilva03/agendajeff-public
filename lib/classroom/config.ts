// Configuração da integração com o APIClassroom. Só no servidor: nada daqui vai para o navegador.
import "server-only";

/** Único destino permitido em produção (sem URL vinda do usuário: evita SSRF). */
export const API_CLASSROOM_PRODUCAO = "https://apiclassroom.vercel.app";

export interface ConfigClassroom {
  api: string;          // base REST do APIClassroom
  audience: string;     // resource/audience exigido pelo APIClassroom
  emissor: string;      // issuer do Auth0, com barra final
  clientId: string;
  clientSecret: string;
  chave: Buffer;        // 32 bytes para AES-256-GCM
  emailsPermitidos: string[] | null;
}

/** Lê e valida as variáveis. Devolve null (integração indisponível) quando faltar algo, sem expor o motivo ao cliente. */
export function configClassroom(): ConfigClassroom | null {
  const producao = process.env.NODE_ENV === "production";
  // Fora de produção dá para apontar para o simulador local dos testes; em produção, só o domínio oficial.
  const api = (producao ? API_CLASSROOM_PRODUCAO : process.env.CLASSROOM_API_URL || API_CLASSROOM_PRODUCAO).replace(/\/+$/, "");
  const dominio = process.env.CLASSROOM_AUTH0_DOMAIN?.trim();
  const clientId = process.env.CLASSROOM_AUTH0_CLIENT_ID?.trim();
  const clientSecret = process.env.CLASSROOM_AUTH0_CLIENT_SECRET?.trim();
  const chaveB64 = process.env.CLASSROOM_TOKEN_KEY?.trim();
  if (!dominio || !clientId || !clientSecret || !chaveB64) return null;
  if (!/^[a-z0-9.-]+\.auth0\.com$/i.test(dominio) && !(!producao && /^127\.0\.0\.1:\d+$/.test(dominio))) return null;
  const chave = Buffer.from(chaveB64, "base64");
  if (chave.length !== 32) return null;
  const emails = process.env.CLASSROOM_EMAILS_PERMITIDOS?.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean) ?? [];
  const esquema = /^127\.0\.0\.1:/.test(dominio) ? "http" : "https";
  return {
    api, audience: process.env.CLASSROOM_AUDIENCE?.trim() || `${API_CLASSROOM_PRODUCAO}/mcp`,
    emissor: `${esquema}://${dominio}/`, clientId, clientSecret, chave, emailsPermitidos: emails.length ? emails : null,
  };
}

/** A conta do AgendaJeff pode usar a integração? (Com a lista vazia, qualquer conta logada; o APIClassroom ainda exige o dono.) */
export const contaPermitida = (cfg: ConfigClassroom, email: string | null | undefined) =>
  !cfg.emailsPermitidos || (!!email && cfg.emailsPermitidos.includes(email.toLowerCase()));
