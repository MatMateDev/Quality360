# Quality360 · Fixture E7 (bandejas por rol)

Carga el fixture de la sección 3 de `docs/backlog/e7-bandejas-por-rol.md`, con el que
`q360-qa` certifica E7. Es independiente de la semilla MVP (`../mvp`) para no mezclar datos:
los valores esperados de los casos (10 usuarios activos, 8 HDU...) solo se cumplen sobre una
base vacía, sin los usuarios de la semilla MVP.

```
npm run seed:e7
```

Requiere Supabase local, Organización (`PERMITIR_CARGA_SEMILLA=true`) y Certificaciones
levantados, y el mismo `X_Q360_SERVICIO_TOKEN` de Organización. Lee `infrastructure/seed/mvp/.env.carga`
(que genera `node infrastructure/local/preparar-entorno.mjs`) y la llave pública de
`apps/web/.env.local`; `ORGANIZACION_URL` y `CERTIFICACIONES_URL` cambian los puertos.
Es idempotente: se puede repetir sin duplicar ni retroceder nada.

## Qué carga

| Elemento | Detalle |
| --- | --- |
| Células | CEL-A, CEL-B, CEL-C (y un sprint «Sprint E7») |
| Usuarios (`<clave>@quality360.local`, contraseña de demo) | `adm1`, `qe1`, `qe2`, `ana1`..`ana4`, `lid1` (Líder de CEL-A y CEL-B), `lid2` (Líder sin células), `aud1` (Auditor), `inact1` (QE desactivado) |
| Supervisión | QE1 supervisa a ANA1 y ANA2; QE2 supervisa a ANA3; ANA4 no tiene QE |
| HDU `E7-H1`..`E7-H8` | Las del backlog: H1 (3 aprobados y el 4 por aprobar), H2 (entregable 2 rechazado con «Falta evidencia de datos»), H3, H4, H5 (sin analista), H6 (8 aprobados), H7 (cerrada, certificado) y H8 (pendiente de cierre, 10 aprobados y certificado) |

El estado de cada checklist se logra con las operaciones reales de Certificaciones, con la sesión
de la analista y del QE que corresponden (marcar con enlace, aprobar, rechazar, generar el
certificado). H7 la cierra `adm1`, igual que en el portal. Nada se escribe en la base a mano.

## Valores que se pueden verificar

Sobre una base vacía, `GET /v1/bandeja/*` entrega los valores de la sección 3 del backlog:
ANA1 2/0/1, ANA2 2/1/0, QE1 con 4 acciones (H5 asignar, H1 aprobar, H6 certificar, H8 cerrar),
LID1 con 2 células, 5 abiertas, 1 cerrada, 1 sin analista y 1 certificado, ADM1 con 10 activos
(1/2/4/2/1 por rol), 1 inactivo, ANA4 sin QE, LID2 sin células, CEL-C sin líder y 8 HDU, y AUD1 con
8 HDU y 2 certificados.
