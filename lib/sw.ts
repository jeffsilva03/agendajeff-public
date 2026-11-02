/**
 * Endereço do service worker. Em desenvolvimento ele não guarda nada em cache: o modo dev
 * reaproveita nomes de arquivos com conteúdo novo, e o cache entregaria código velho.
 */
export const URL_SW = process.env.NODE_ENV === "production" ? "/sw.js" : "/sw.js?dev=1";
