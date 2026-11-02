// Datas sempre como string "AAAA-MM-DD" no fuso America/Sao_Paulo.
// Aritmética feita ao meio-dia UTC para não escorregar de dia.

export const FUSO = "America/Sao_Paulo";

export const minutos = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export const hhmm = (min: number): string =>
  `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

const meioDia = (iso: string) => new Date(`${iso}T12:00:00Z`);

export const diaDaSemana = (iso: string): number => meioDia(iso).getUTCDay();

export const somarDias = (iso: string, n: number): string =>
  new Date(meioDia(iso).getTime() + n * 864e5).toISOString().slice(0, 10);

export const diasEntre = (de: string, ate: string): number =>
  Math.round((meioDia(ate).getTime() - meioDia(de).getTime()) / 864e5);

/** "07:30" → "7h30", "13:00" → "13h" */
export const horaCurta = (hhmm: string): string => {
  const [h, m] = hhmm.split(":");
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
};

/** Data e hora locais de São Paulo para um instante. */
export function agoraSP(instante: Date = new Date()): { data: string; hora: string } {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: FUSO,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instante)
      .map((p) => [p.type, p.value]),
  );
  return { data: `${partes.year}-${partes.month}-${partes.day}`, hora: `${partes.hour}:${partes.minute}` };
}

/** true se "HH:MM" cai em [inicio, fim), aceitando janela que cruza a meia-noite. */
export function dentroDaJanela(hora: string, inicio: string, fim: string): boolean {
  const h = minutos(hora), a = minutos(inicio), b = minutos(fim);
  return a <= b ? h >= a && h < b : h >= a || h < b;
}
