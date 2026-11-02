// Cifra dos tokens do Auth0 em repouso (AES-256-GCM). A chave fica só na variável CLASSROOM_TOKEN_KEY do servidor.
import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** "v1.<iv>.<tag>.<cifrado>" em base64url. */
export function cifrar(texto: string, chave: Buffer, contexto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave, iv);
  c.setAAD(Buffer.from(contexto)); // amarra o token ao usuário: não serve se copiado para outra linha
  const dados = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), dados.toString("base64url")].join(".");
}

export function decifrar(guardado: string, chave: Buffer, contexto: string): string {
  const [versao, iv, tag, dados] = guardado.split(".");
  if (versao !== "v1" || !iv || !tag || !dados) throw new Error("token guardado em formato desconhecido");
  const d = createDecipheriv("aes-256-gcm", chave, Buffer.from(iv, "base64url"));
  d.setAAD(Buffer.from(contexto));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(dados, "base64url")), d.final()]).toString("utf8");
}
