import type { ReactNode, SVGProps } from "react";

/** Iconos decorativos de la pantalla de acceso (aria-hidden: el significado lo da siempre el texto). */
function Base({
  tamano = 18,
  children,
  ...resto
}: Omit<SVGProps<SVGSVGElement>, "children"> & { tamano?: number; children: ReactNode }) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...resto}
    >
      {children}
    </svg>
  );
}

type PropsIcono = { tamano?: number; className?: string };

export function IconoError(props: PropsIcono) {
  return (
    <Base strokeWidth={2.2} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" />
    </Base>
  );
}

export function IconoReloj(props: PropsIcono) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Base>
  );
}

export function IconoExito(props: PropsIcono) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.7 2.7L16 9.5" />
    </Base>
  );
}

export function IconoOjo(props: PropsIcono) {
  return (
    <Base {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </Base>
  );
}

export function IconoOjoTachado(props: PropsIcono) {
  return (
    <Base {...props}>
      <path d="M2 12s3.5-7 10-7c2 0 3.7.7 5.2 1.6M22 12s-3.5 7-10 7c-2 0-3.7-.7-5.2-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M3 3l18 18" />
    </Base>
  );
}

export function IconoEscudo(props: PropsIcono) {
  return (
    <Base {...props}>
      <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </Base>
  );
}

export function IconoVisto({ tamano = 14, className }: PropsIcono) {
  return (
    <Base tamano={tamano} className={className} stroke="#5fdcea" strokeWidth={3}>
      <path d="M5 12l5 5 9-10" />
    </Base>
  );
}

export function IconoFlechaAtras(props: PropsIcono) {
  return (
    <Base {...props}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </Base>
  );
}

/** Spinner del botón «Ingresando…»; el giro se desactiva con `prefers-reduced-motion`. */
export function Cargando({ tamano = 18 }: { tamano?: number }) {
  return (
    <svg
      className="acceso-spinner"
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={3}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" stroke="#7aa2f0" />
      <path d="M12 3a9 9 0 0 1 9 9" stroke="#ffffff" />
    </svg>
  );
}
