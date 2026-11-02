export { Check, CircleSlash, Ellipsis, Undo2, X, TriangleAlert as AlertTriangle } from "lucide-react";
import type { SVGProps } from "react";

/** Meio círculo: o "mínimo" conta como feito, mas é visualmente distinto. */
export function HalfCircle(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" />
    </svg>
  );
}
