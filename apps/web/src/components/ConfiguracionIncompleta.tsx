/** Pantalla que reemplaza al portal cuando se construyó sin variables obligatorias. */
export function ConfiguracionIncompleta({ faltantes }: { faltantes: string[] }) {
  return (
    <main className="configuracion-incompleta" data-testid="configuracion-incompleta" role="alert">
      <h1>Falta configurar el portal</h1>
      <p>Esta versión se construyó sin estas variables de entorno obligatorias:</p>
      <ul>
        {faltantes.map((nombre) => (
          <li key={nombre}>
            <code>{nombre}</code>
          </li>
        ))}
      </ul>
      <p>
        Agrégalas en la configuración del despliegue y vuelve a desplegar. Las variables <code>VITE_*</code> se
        incorporan al compilar, así que guardarlas no basta: hace falta un despliegue nuevo.
      </p>
    </main>
  );
}
