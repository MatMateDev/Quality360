import type { Rol } from "@/types/dominio";

/**
 * Franja «HDU bloqueada» sobre el encabezado del detalle (diseño E4 §4.2). Solo se muestra con impedimentos reales
 * cargados: si la sección está indisponible no se afirma ni se niega el bloqueo. Para el Analista la frase no
 * menciona el cierre porque no es quien cierra.
 */
export function AvisoHduBloqueada({ abiertos, rol }: { abiertos: number; rol: Rol }) {
  const cantidad = `${abiertos} ${abiertos === 1 ? "impedimento abierto" : "impedimentos abiertos"}`;
  return (
    <p className="aviso-bloqueada" role="status" data-testid="hdu-bloqueada">
      <span aria-hidden="true">⊘</span>
      <span>
        HDU bloqueada: {cantidad}.{" "}
        {rol === "ANALISTA_QA" ? "Tu QE responsable lo gestiona." : "No se podrá cerrar hasta resolverlos."}
      </span>
      <a href="#impedimentos">Ver impedimentos</a>
    </p>
  );
}
