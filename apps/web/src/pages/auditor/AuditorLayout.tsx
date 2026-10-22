import type { ReactNode } from "react";
import { useBandejaAuditor } from "@/api/bandejas";
import { AvisoSoloLectura, EncabezadoBandeja, GrupoContadores } from "@/components/bandeja/Estructura";
import { PestanasAuditor } from "@/components/bandeja/PestanasAuditor";
import { TarjetaContador } from "@/components/bandeja/TarjetaContador";

/**
 * Marco común de las cuatro pestañas del Auditor (E7-F06): encabezado, aviso de solo lectura, contadores
 * (cada uno con su estado) y pestañas. No hay `<form>` ni `button[type=submit]` en ninguna.
 */
export function AuditorLayout({ children }: { children: ReactNode }) {
  // Los contadores no dependen de la pestaña ni de sus filtros.
  const contadores = useBandejaAuditor(null);
  const datos = contadores.data;
  return (
    <div data-testid="bandeja-auditor">
      <EncabezadoBandeja etiqueta="Portal Auditor" descripcion="Consulta global de HDU, certificados, bitácora y auditoría de usuarios.">
        <AvisoSoloLectura texto="Vista de solo lectura. Puedes consultar y exportar, no modificar." />
      </EncabezadoBandeja>

      <GrupoContadores compacto>
        <TarjetaContador consulta={contadores} id="hdu-total" clave="hdu-total" titulo="HDU totales" contador={datos?.contadores.hduTotal} />
        <TarjetaContador consulta={contadores} id="certificados" clave="certificados" titulo="Certificados" contador={datos?.contadores.certificados} />
        <TarjetaContador consulta={contadores} id="eventos-7d" clave="eventos-7d" titulo="Eventos (7 días)" contador={datos?.contadores.eventos7d} />
        <TarjetaContador
          consulta={contadores}
          id="cambios-usuarios-7d"
          clave="cambios-usuarios-7d"
          titulo="Cambios de usuarios (7 días)"
          contador={datos?.contadores.cambiosUsuarios7d}
        />
      </GrupoContadores>

      <PestanasAuditor />
      {children}
    </div>
  );
}
