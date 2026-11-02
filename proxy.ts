import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Renova a sessão do Supabase a cada requisição e manda para /entrar quem não está logado.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista) => {
        for (const { name, value } of lista) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of lista) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  // /calendario é protegido pelo token secreto do link. A API de integração e o MCP fazem a própria
  // autenticação (respondem 401 em JSON, sem redirecionar), assim como /api/classroom (sessão ou segredo do cron);
  // /.well-known são metadados públicos do OAuth.
  const caminho = request.nextUrl.pathname;
  const publica = ["/entrar", "/calendario/", "/api/integrations/", "/api/widget", "/.well-known/", "/widgets/", "/api/classroom/"].some((p) => caminho.startsWith(p)) || caminho === "/mcp";
  if (!data?.claims && !publica) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    // O consentimento OAuth volta para a mesma tela depois do login (com o authorization_id).
    url.search = caminho.startsWith("/oauth/") ? `?next=${encodeURIComponent(caminho + request.nextUrl.search)}` : "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\.(?:svg|png|jpg|webp)$).*)"],
};
