import { apagarUsuarioE2E } from "./ambiente";

export default async function limpar() {
  await apagarUsuarioE2E();
}
