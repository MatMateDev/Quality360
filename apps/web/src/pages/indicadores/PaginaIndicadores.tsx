import { useCallback, useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useOpcionesFiltroIndicadores } from "@/api/indicadores";
import { AvisoSoloLectura, EncabezadoBandeja } from "@/components/bandeja/Estructura";
import { PestanasNav, type PestanaNav } from "@/components/bandeja/PestanasNav";
import { BotonExportar } from "@/components/indicadores/BotonExportar";
import type { ContextoIndicadores } from "@/components/indicadores/contexto";
import { useFiltrosUrl } from "@/lib/filtrosUrl";
import { formatearFechaHoraChile } from "@/lib/formato";
import type { Rol } from "@/types/dominio";

interface ConfigRol {
  etiqueta: string;
  base: string;
  descripcion: string;
  ambito: string;
  soloLectura: boolean;
}

const CONFIG: Partial<Record<Rol, ConfigRol>> = {
  QE: {
    etiqueta: "Portal QE",
    base: "/qe/indicadores",
    descripcion: "Cumplimiento de certificación de tu equipo y de los analistas que supervisas.",
    ambito: "Ámbito: HDU donde eres QE responsable y las de los analistas que supervisas.",
    soloLectura: false,
  },
  LIDER_QA: {
    etiqueta: "Portal Líder QA",
    base: "/lider/indicadores",
    descripcion: "Cumplimiento de certificación de tus células.",
    ambito: "Ámbito: HDU de las células que tienes asignadas.",
    soloLectura: true,
  },
  AUDITOR: {
    etiqueta: "Portal Auditor",
    base: "/auditor/indicadores",
    descripcion: "Cumplimiento de certificación de todas las células.",
    ambito: "Ámbito: todas las HDU.",
    soloLectura: true,
  },
};

type IdPestana = "cumplimiento" | "semaforo" | "carga" | "tendencia";

const PESTANAS: ReadonlyArray<{ id: IdPestana; sufijo: string; texto: string }> = [
  { id: "cumplimiento", sufijo: "", texto: "Cumplimiento" },
  { id: "semaforo", sufijo: "/semaforo", texto: "Semáforo" },
  { id: "carga", sufijo: "/carga", texto: "Carga" },
  { id: "tendencia", sufijo: "/tendencia", texto: "Tendencia" },
];

/**
 * Página común de indicadores (E6 §12.1): QE, Líder y Auditor montan los mismos componentes; lo que cambia es el
 * ámbito (lo decide el servidor) y `soloLectura`. Cada rol vive bajo su propio prefijo para que `RequireRole` resuelva
 * el acceso (D41). No contiene `<form>`: el único `submit` de E6 es el umbral del QE.
 */
export function PaginaIndicadores({ rol }: { rol: Rol }) {
  const config = CONFIG[rol]!;
  const filtros = useFiltrosUrl();
  const { pathname } = useLocation();
  const opciones = useOpcionesFiltroIndicadores();
  const [vista, setVista] = useState<{ generadoEn: string | null; cargando: boolean }>({ generadoEn: null, cargando: true });
  const informarVista = useCallback((v: { generadoEn: string | null; cargando: boolean }) => {
    setVista((anterior) => (anterior.generadoEn === v.generadoEn && anterior.cargando === v.cargando ? anterior : v));
  }, []);

  const resto = pathname.startsWith(config.base) ? pathname.slice(config.base.length).replace(/\/$/, "") : "";
  const activa: IdPestana = PESTANAS.find((p) => p.sufijo !== "" && p.sufijo === resto)?.id ?? "cumplimiento";

  // Las pestañas conservan célula y sprint al cambiar (§2.3); el Semáforo ignora el sprint pero lo guarda en la URL.
  const pestanas: PestanaNav[] = useMemo(() => {
    const params = new URLSearchParams();
    for (const clave of ["celula", "sprint"]) {
      const valor = filtros.params.get(clave);
      if (valor) params.set(clave, valor);
    }
    const query = params.toString() ? `?${params.toString()}` : "";
    return PESTANAS.map((p) => ({ id: p.id, a: `${config.base}${p.sufijo}${query}`, texto: p.texto, testId: `tab-${p.id}` }));
  }, [config.base, filtros.params]);

  const contexto: ContextoIndicadores = { rol, soloLectura: config.soloLectura, base: config.base, filtros, opciones, informarVista };

  return (
    <div className="pagina-indicadores" data-testid="pagina-indicadores">
      <EncabezadoBandeja etiqueta={config.etiqueta} titulo="Indicadores" descripcion={config.descripcion}>
        {config.soloLectura ? <AvisoSoloLectura /> : null}
      </EncabezadoBandeja>

      <div className="indicadores-barra">
        <PestanasNav etiqueta="Secciones de indicadores" pestanas={pestanas} activa={activa} />
        <BotonExportar vista={activa} filtros={filtros} opciones={opciones.data} cargando={vista.cargando} />
      </div>

      <div className="indicadores-linea">
        <p data-testid="texto-ambito">{config.ambito}</p>
        {vista.generadoEn ? (
          <p data-testid="actualizado-en">
            Datos al <time dateTime={vista.generadoEn}>{formatearFechaHoraChile(vista.generadoEn)}</time>
          </p>
        ) : null}
      </div>

      <Outlet context={contexto} />
    </div>
  );
}
