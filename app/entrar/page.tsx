"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { criarClienteNavegador } from "@/lib/supabase/client";

type Modo = "senha" | "codigo" | "criar";

const traduzir = (msg: string) => {
  if (/invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos.";
  if (/token has expired or is invalid/i.test(msg)) return "Código inválido ou expirado. Peça um novo.";
  if (/signups not allowed|user not found/i.test(msg)) return "Não existe conta com esse e-mail.";
  if (/already registered/i.test(msg)) return "Já existe conta com esse e-mail. Entre com a senha.";
  if (/at least/i.test(msg)) return "A senha precisa ter pelo menos 8 caracteres.";
  return msg;
};

export default function EntrarPage() {
  const router = useRouter();
  const supabase = criarClienteNavegador();
  const [modo, setModo] = useState<Modo>("senha");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [codigo, setCodigo] = useState("");
  const [codigoEnviado, setCodigoEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setOcupado(true);
    try {
      if (modo === "senha") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
      } else if (modo === "criar") {
        const { error } = await supabase.auth.signUp({ email, password: senha });
        if (error) throw error;
      } else if (!codigoEnviado) {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
        if (error) throw error;
        setCodigoEnviado(true);
        return;
      } else {
        const { error } = await supabase.auth.verifyOtp({ email, token: codigo, type: "email" });
        if (error) throw error;
      }
      // Volta para o consentimento OAuth, se veio de lá. Só caminhos internos de /oauth/ (sem redirecionamento aberto).
      const proximo = new URLSearchParams(window.location.search).get("next");
      router.replace(proximo && /^\/oauth\/[\w/?=&%.-]*$/.test(proximo) && !proximo.startsWith("//") ? proximo : "/hoje");
      router.refresh();
    } catch (err) {
      setErro(traduzir((err as Error).message));
    } finally {
      setOcupado(false);
    }
  }

  const trocar = (m: Modo) => { setModo(m); setErro(null); setCodigoEnviado(false); setCodigo(""); };

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-12">
      <span aria-hidden className="mb-8 grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
        <svg viewBox="0 0 16 16" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="4" cy="8" r="2" /><circle cx="12" cy="8" r="2" /><path d="M6 8h4" />
        </svg>
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">Cadeia</h1>
      <p className="mt-2 text-muted-foreground">
        {modo === "criar" ? "Crie sua conta com e-mail e senha." : "Entre para ver o seu dia."}
      </p>

      <form onSubmit={enviar} className="mt-8 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" autoComplete="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} disabled={codigoEnviado} className="h-11 text-base" />
        </div>

        {modo !== "codigo" && (
          <div className="space-y-2">
            <Label htmlFor="senha">Senha</Label>
            <Input id="senha" type="password" required minLength={8}
              autoComplete={modo === "criar" ? "new-password" : "current-password"}
              value={senha} onChange={(e) => setSenha(e.target.value)} className="h-11 text-base" />
          </div>
        )}

        {modo === "codigo" && codigoEnviado && (
          <div className="space-y-2">
            <Label htmlFor="codigo">Código de 6 dígitos</Label>
            <Input id="codigo" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required
              value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
              className="numeros h-14 text-center text-2xl font-semibold tracking-[0.4em]" autoFocus />
            <p className="text-sm text-muted-foreground">Enviamos para {email}. Confira também o spam.</p>
          </div>
        )}

        {erro && <p role="alert" className="text-sm font-medium text-destructive">{erro}</p>}

        <Button type="submit" size="lg" className="h-11 w-full text-[15px]" disabled={ocupado}>
          {modo === "senha" && "Entrar"}
          {modo === "criar" && "Criar conta"}
          {modo === "codigo" && (codigoEnviado ? "Entrar com o código" : "Enviar código")}
        </Button>
      </form>

      <div className="mt-6 flex flex-col items-start gap-3 text-sm">
        {modo !== "codigo" && (
          <button type="button" className="underline underline-offset-4" onClick={() => trocar("codigo")}>
            Entrar com código por e-mail
          </button>
        )}
        {modo !== "senha" && (
          <button type="button" className="underline underline-offset-4" onClick={() => trocar("senha")}>
            Entrar com senha
          </button>
        )}
        {modo !== "criar" && (
          <button type="button" className="text-muted-foreground underline underline-offset-4" onClick={() => trocar("criar")}>
            Ainda não tenho conta
          </button>
        )}
      </div>
    </main>
  );
}
