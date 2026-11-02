// Gera um calendário iCalendar (RFC 5545) com compromissos, dias sem aula e prazos.
import { ocorrenciasDePrazos, resolverDia, somarDias, type Contexto } from "@motor";

const escapar = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const dataIcs = (iso: string) => iso.replace(/-/g, "");
const horaIcs = (hhmm: string) => `${hhmm.replace(":", "")}00`;

/** Quebra linhas em 75 octetos (exigência da RFC). */
function dobrar(linha: string) {
  const partes: string[] = [];
  let atual = "";
  for (const ch of linha) {
    if (new TextEncoder().encode(atual + ch).length > 73) { partes.push(atual); atual = " " + ch; } else atual += ch;
  }
  partes.push(atual);
  return partes.join("\r\n");
}

export function gerarIcs(ctx: Contexto, hoje: string, carimbo: string, diasAntes = 30, diasDepois = 180): string {
  const de = somarDias(hoje, -diasAntes), ate = somarDias(hoje, diasDepois);
  const ev: string[][] = [];
  const base = (uid: string) => [`UID:${uid}@cadeia`, `DTSTAMP:${carimbo}`];

  for (let d = de; d <= ate; d = somarDias(d, 1)) {
    const dia = resolverDia(d, ctx);
    for (const c of dia.compromissos) {
      if (c.inicio) {
        const fim = c.fim ?? `${String(Math.min(23, Number(c.inicio.slice(0, 2)) + 1)).padStart(2, "0")}:${c.inicio.slice(3)}`;
        ev.push([...base(`${c.id}-${d}`), `DTSTART;TZID=America/Sao_Paulo:${dataIcs(d)}T${horaIcs(c.inicio)}`, `DTEND;TZID=America/Sao_Paulo:${dataIcs(d)}T${horaIcs(fim)}`,
          `SUMMARY:${escapar(c.titulo)}`, ...(c.local ? [`LOCATION:${escapar(c.local)}`] : []), ...(c.fim ? [] : ["DESCRIPTION:Sem horário de término"])]);
      } else {
        ev.push([...base(`${c.id}-${d}`), `DTSTART;VALUE=DATE:${dataIcs(d)}`, `DTEND;VALUE=DATE:${dataIcs(somarDias(d, 1))}`, `SUMMARY:${escapar(c.titulo)}`]);
      }
    }
    for (const a of dia.aulas)
      ev.push([...base(`aula-${a.id}-${d}`), `DTSTART;TZID=America/Sao_Paulo:${dataIcs(d)}T${horaIcs(a.inicio)}`, `DTEND;TZID=America/Sao_Paulo:${dataIcs(d)}T${horaIcs(a.fim)}`,
        `SUMMARY:${escapar(a.disciplina)}`, ...(a.sala ? [`LOCATION:${escapar(a.sala)}`] : []), ...(a.professor ? [`DESCRIPTION:${escapar(`Professor(a): ${a.professor}`)}`] : [])]);
    if (dia.diaDeAula && !dia.temAula && dia.motivoSemAula)
      ev.push([...base(`semaula-${d}`), `DTSTART;VALUE=DATE:${dataIcs(d)}`, `DTEND;VALUE=DATE:${dataIcs(somarDias(d, 1))}`,
        `SUMMARY:${escapar(/sem aula/i.test(dia.motivoSemAula) ? dia.motivoSemAula : `Sem aula (${dia.motivoSemAula})`)}`, "TRANSP:TRANSPARENT"]);
  }
  for (const p of ocorrenciasDePrazos(ctx.eventos, de, ate).filter((o) => o.tipo === "prazo"))
    ev.push([...base(`${p.eventoId}-${p.data}`), `DTSTART;VALUE=DATE:${dataIcs(p.data)}`, `DTEND;VALUE=DATE:${dataIcs(somarDias(p.data, 1))}`,
      `SUMMARY:${escapar(p.titulo.startsWith("Prazo") || p.titulo.startsWith("Entrega") ? p.titulo : `Prazo: ${p.titulo}`)}`, "TRANSP:TRANSPARENT",
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapar(p.titulo)}`, "TRIGGER:-PT15H", "END:VALARM"]);

  const linhas = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Cadeia//Agenda//PT-BR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Cadeia", "X-WR-TIMEZONE:America/Sao_Paulo", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
    // Brasil sem horário de verão desde 2019: fuso fixo -03:00.
    "BEGIN:VTIMEZONE", "TZID:America/Sao_Paulo", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:-0300", "TZOFFSETTO:-0300", "TZNAME:-03", "END:STANDARD", "END:VTIMEZONE",
    ...ev.flatMap((e) => ["BEGIN:VEVENT", ...e, "END:VEVENT"]),
    "END:VCALENDAR",
  ];
  return linhas.map(dobrar).join("\r\n") + "\r\n";
}
