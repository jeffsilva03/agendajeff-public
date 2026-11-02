import { Navegacao } from "@/components/app/navegacao";
import { CronometroFlutuante } from "@/components/app/cronometro-flutuante";
import { PaletaComandos } from "@/components/app/paleta-comandos";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="md:flex">
      <Navegacao />
      <main className="min-w-0 flex-1 pt-[env(safe-area-inset-top)] pb-24 md:pb-0">{children}</main>
      <CronometroFlutuante />
      <PaletaComandos />
    </div>
  );
}
