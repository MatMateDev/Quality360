import { useCumplimiento } from "@/api/indicadores";
import { BarraFiltros } from "@/components/bandeja/BarraFiltros";
import { GrupoContadores } from "@/components/bandeja/Estructura";
import { campoCelula, campoSprint } from "@/components/indicadores/camposFiltro";
import { filtrosDeUrl, useContextoIndicadores, useInformarVista } from "@/components/indicadores/contexto";
import { AvisoFuenteNoDisponible, BloqueConsulta, SinDatos } from "@/components/indicadores/estados";
import { TarjetaMetrica } from "@/components/TarjetaMetrica";
import { formatearPorcentaje } from "@/lib/formato";
import type { ConteoIndicador } from "@/types/dominio";

const CLAVES = ["totales", "certificadas", "cerradas-excepcion", "en-curso", "sin-iniciar", "bloqueadas", "cumplimiento"] as const;

function valorDe(indicador: ConteoIndicador): number | null {
  return indicador.estado === "ok" ? indicador.valor : null;
}

/** Cumplimiento (E6-F01): siete cifras con estado propio. Un dato caído dice «No disponible», nunca 0 (D169). */
export function PestanaCumplimiento() {
  const { filtros, opciones } = useContextoIndicadores();
  const { celulaId, sprintId } = filtrosDeUrl(filtros);
  const consulta = useCumplimiento({ celulaId, sprintId });
  useInformarVista(consulta.data?.generadoEn, consulta.isPending);
  const datos = consulta.data;

  const ambitoVacio = Boolean(datos?.sinDatos && datos.motivoSinDatos === "AMBITO_VACIO");
  const campos = [campoCelula(opciones.data), campoSprint(opciones.data)];
  const totalOk = datos && !datos.sinDatos && datos.hduTotales.estado === "ok" ? datos.hduTotales.valor : null;

  return (
    <section data-testid="pestana-cumplimiento">
      {ambitoVacio ? null : <BarraFiltros filtros={filtros} campos={campos} clave="cumplimiento" total={totalOk ?? undefined} etiquetaPlural="HDU en el filtro" />}

      <div role="status" className="sr-anuncio" data-testid="anuncio-recalculo">
        {datos && !consulta.isFetching ? (datos.sinDatos ? "Sin HDU con esos filtros" : `Indicadores actualizados: ${datos.hduTotales.valor ?? 0} HDU`) : ""}
      </div>

      <BloqueConsulta
        clave="cumplimiento"
        consulta={consulta}
        esqueleto={
          <GrupoContadores titulo="Resumen">
            {CLAVES.map((c) => (
              <TarjetaMetrica key={c} id={`${c}-carga`} titulo="Cargando" estado="cargando" />
            ))}
          </GrupoContadores>
        }
      >
        {datos ? (
          datos.sinDatos ? (
            <SinDatos
              mensaje={ambitoVacio ? "Aún no tienes HDU en tu ámbito" : "No hay HDU con esos filtros"}
              onLimpiar={ambitoVacio ? undefined : () => filtros.limpiar(["celula", "sprint"])}
            />
          ) : (
            <Cifras datos={datos} onReintentar={() => void consulta.refetch()} />
          )
        ) : null}
      </BloqueConsulta>
    </section>
  );
}

function Cifras({ datos, onReintentar }: { datos: NonNullable<ReturnType<typeof useCumplimiento>["data"]>; onReintentar: () => void }) {
  const certificaciones = [datos.certificadas, datos.enCurso, datos.sinIniciar, datos.cumplimientoPromedio].some((c) => c.estado !== "ok");
  const impedimentos = datos.bloqueadas.estado !== "ok";
  const cuadre = [datos.certificadas, datos.cerradasConExcepcion, datos.enCurso, datos.sinIniciar].every((c) => c.estado === "ok") && datos.hduTotales.estado === "ok";
  const v = (c: ConteoIndicador) => valorDe(c) ?? 0;
  const cumplimiento = datos.cumplimientoPromedio;

  return (
    <>
      {certificaciones ? (
        <AvisoFuenteNoDisponible
          mensaje="No pudimos consultar el avance de los entregables. Las cifras que dependen de él no se muestran para no entregar datos inexactos."
          onReintentar={onReintentar}
        />
      ) : null}
      {impedimentos ? (
        <AvisoFuenteNoDisponible mensaje="No pudimos consultar los impedimentos. La cifra de bloqueadas no se muestra para no entregar datos inexactos." onReintentar={onReintentar} />
      ) : null}

      <GrupoContadores titulo="Resumen">
        <TarjetaMetrica
          id="cumplimiento"
          clave="cumplimiento"
          testIdValor="indicador-cumplimiento"
          clase="tarjeta-resumen--ancha"
          titulo="Cumplimiento promedio"
          estado={cumplimiento.estado}
          valor={cumplimiento.valor === null ? undefined : formatearPorcentaje(cumplimiento.valor)}
          mensajeIndisponible="No disponible"
          detalle="Promedio del avance real de cada HDU (cada entregable aprobado suma 10 %)."
        />
        <TarjetaMetrica id="totales" clave="totales" testIdValor="indicador-totales" titulo="HDU totales" estado={datos.hduTotales.estado} valor={datos.hduTotales.valor ?? undefined} detalle="en el filtro" mensajeIndisponible="No disponible" />
        <TarjetaMetrica
          id="bloqueadas"
          clave="bloqueadas"
          testIdValor="indicador-bloqueadas"
          titulo="Bloqueadas"
          estado={datos.bloqueadas.estado}
          valor={datos.bloqueadas.valor ?? undefined}
          atencion
          detalle="Transversal: también cuentan en su estado."
          mensajeIndisponible="No disponible"
        />
      </GrupoContadores>

      <GrupoContadores titulo="Estado de las HDU">
        <TarjetaMetrica id="certificadas" clave="certificadas" testIdValor="indicador-certificadas" titulo="Certificadas" estado={datos.certificadas.estado} valor={datos.certificadas.valor ?? undefined} mensajeIndisponible="No disponible" />
        <TarjetaMetrica
          id="cerradas-excepcion"
          clave="cerradas-excepcion"
          testIdValor="indicador-cerradas-excepcion"
          titulo="Cerradas con excepción (sin certificado)"
          estado={datos.cerradasConExcepcion.estado}
          valor={datos.cerradasConExcepcion.valor ?? undefined}
          detalle="Cerradas sin los 10 entregables."
          mensajeIndisponible="No disponible"
        />
        <TarjetaMetrica id="en-curso" clave="en-curso" testIdValor="indicador-en-curso" titulo="En curso" estado={datos.enCurso.estado} valor={datos.enCurso.valor ?? undefined} mensajeIndisponible="No disponible" />
        <TarjetaMetrica id="sin-iniciar" clave="sin-iniciar" testIdValor="indicador-sin-iniciar" titulo="Sin iniciar" estado={datos.sinIniciar.estado} valor={datos.sinIniciar.valor ?? undefined} mensajeIndisponible="No disponible" />
      </GrupoContadores>

      {cuadre ? (
        <p className="nota-cuadre" data-testid="nota-cuadre">
          Certificadas + Cerradas con excepción + En curso + Sin iniciar = HDU totales ({v(datos.certificadas)} + {v(datos.cerradasConExcepcion)} + {v(datos.enCurso)} + {v(datos.sinIniciar)} ={" "}
          {v(datos.hduTotales)}).
        </p>
      ) : null}
    </>
  );
}
