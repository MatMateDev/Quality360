import { HduListado } from "@/components/HduListado";

/** E2-F03: "Mis HDU" del Analista QA, con filtros de célula, sprint y estado. */
export function QaHduListPage() {
  return (
    <HduListado
      titulo="Mis HDU"
      descripcion="Historias de usuario asignadas a ti."
      idBloque="mis-hdu"
      mostrarColumnaAnalista={false}
      mostrarColumnaQe
    />
  );
}
