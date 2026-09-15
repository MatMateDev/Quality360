# Historias de usuario · Quality360

Fuente: `Historias_de_usuario_Quality360.xlsx` (hoja «Historias de Usuario»). Prefijo F = frontend, B = backend. Escenarios en formato Contexto → Evento → Resultado.

## ÉPICA 1 — ACCESO, PORTALES Y ORGANIZACIÓN QA

Autenticación, autorización por rol y ámbito, portales de inicio y administración de usuarios, roles y supervisión.

### E1-F01 · Usuario de Quality360

Quiero ingresar al portal de inicio de sesión e introducir mis credenciales. Para acceder a la plataforma de forma segura.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Formulario de ingreso | El usuario accede a la pantalla de inicio de sesión. | Visualiza el formulario. | Se muestran los campos de correo y contraseña, con opción de mostrar u ocultar la contraseña. |
| 2 | Campos obligatorios | El usuario deja el correo o la contraseña en blanco. | Presiona Ingresar. | El sistema valida los campos obligatorios y marca los que faltan sin enviar la solicitud. |
| 3 | Credenciales incorrectas | El usuario ingresa credenciales válidas en formato pero incorrectas. | Presiona Ingresar. | Se indica que el ingreso está en proceso y luego se presenta un mensaje genérico de credenciales incorrectas, sin revelar si el correo existe. |

### E1-F02 · Quality Engineer (QE)

Quiero ingresar al portal del QE después de iniciar sesión. Para acceder a las funciones de supervisión de mi equipo.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Redirección al portal QE | El usuario tiene rol QE y credenciales válidas. | Inicia sesión. | Es dirigido a su portal, que muestra su identidad y la navegación de supervisión. |
| 2 | Acceso a ruta de otro rol | El QE está autenticado. | Intenta abrir una ruta administrativa o de analista. | Se presenta acceso denegado o se redirige al portal autorizado. |
| 3 | Navegación disponible | El QE está en su portal. | Revisa el menú. | Solo aparecen opciones de supervisión (equipo, historias supervisadas, perfil, cerrar sesión). |

### E1-F03 · Quality Engineer (QE)

Quiero ver mi panel de inicio con un resumen de mis analistas e historias bajo supervisión. Para identificar mi ámbito de trabajo y acceder a su seguimiento.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Resumen con datos | El QE tiene analistas e historias asignadas. | Ingresa al panel de inicio. | Se muestra la cantidad de analistas supervisados y de HDU bajo supervisión, con acceso a ambos listados. |
| 2 | Sin datos | El QE no tiene analistas ni historias asignadas. | Ingresa al panel de inicio. | Se informa explícitamente la ausencia de datos, sin mostrar cifras ficticias. |
| 3 | Error de consulta | El servicio de resumen no responde. | Ingresa al panel de inicio. | Se diferencia el estado de error del estado de carga y de la ausencia de datos, con opción de reintentar. |

### E1-F04 · Quality Engineer (QE)

Quiero consultar el listado de analistas QA que superviso. Para reconocer los integrantes de mi equipo.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Listado vigente | El QE tiene relaciones de supervisión vigentes. | Abre la sección de analistas. | Se muestran únicamente los analistas con supervisión vigente, identificados por nombre y correo. |
| 2 | Relaciones finalizadas | Un analista fue reasignado a otro QE. | Abre la sección de analistas. | El analista reasignado no aparece en el listado. |
| 3 | Sin analistas | El QE no tiene analistas asignados. | Abre la sección de analistas. | Se informa que no hay analistas asignados. |

### E1-F05 · Analista QA

Quiero ingresar al portal del QA después de iniciar sesión. Para acceder a las funciones correspondientes a mi trabajo de certificación.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Redirección al portal QA | El usuario tiene rol Analista QA. | Inicia sesión. | Es dirigido a su portal, con su identidad y la navegación correspondiente. |
| 2 | Sin funciones administrativas | El analista está en su portal. | Revisa el menú y las rutas. | No se presentan funciones administrativas ni de supervisión. |
| 3 | Ruta no autorizada | El analista está autenticado. | Intenta abrir una ruta de QE o Administrador. | Se presenta acceso denegado o se redirige a su portal. |

### E1-F06 · Analista QA

Quiero ver mi panel de inicio con mi QE supervisor y un resumen de mis historias asignadas. Para identificar mis responsabilidades y a quién acudir ante un impedimento.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Panel con supervisor e historias | El analista tiene QE vigente e historias asignadas. | Ingresa al panel de inicio. | Se muestra el nombre del QE supervisor y la cantidad de HDU asignadas, con acceso a sus historias. |
| 2 | Sin supervisor | El analista no tiene QE vigente. | Ingresa al panel de inicio. | Se informa que no tiene supervisor asignado. |
| 3 | Conteo no disponible | La capacidad de HDU (E2) aún no está habilitada. | Ingresa al panel de inicio. | El portal indica que el conteo de historias todavía no está disponible. |

### E1-F07 · Administrador

Quiero ingresar al portal de administración después de iniciar sesión. Para acceder a la configuración de usuarios y organización QA.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Redirección al portal administrativo | El usuario tiene rol Administrador. | Inicia sesión. | Es dirigido a su portal con los accesos administrativos habilitados. |
| 2 | Accesos habilitados | El Administrador está en su portal. | Revisa la navegación. | Se presentan accesos a usuarios, roles y supervisión. |
| 3 | Sesión expirada | La sesión del Administrador expiró. | Intenta abrir el portal. | Se le solicita iniciar sesión nuevamente. |

### E1-F08 · Administrador

Quiero ver mi panel de inicio con accesos a usuarios, roles y relaciones de supervisión. Para administrar la estructura de acceso de la plataforma.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Panel administrativo | El Administrador ingresa a su panel. | Visualiza el panel. | Se muestran accesos a gestión de usuarios, roles y supervisión. |
| 2 | Error de carga | El servicio administrativo no responde. | Ingresa al panel. | Se informa el error de carga sin mostrar cifras ficticias. |
| 3 | Navegación directa | El Administrador está en el panel. | Selecciona un acceso. | Se abre la pantalla correspondiente. |

### E1-F09 · Administrador

Quiero utilizar una pantalla para registrar usuarios, actualizar sus datos, asignar su rol y activar o desactivar su acceso. Para mantener vigente el acceso de los participantes.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Listar y buscar | Existen usuarios registrados. | Abre la pantalla de usuarios y busca por nombre o correo. | Se listan los usuarios y el buscador filtra los resultados. |
| 2 | Validación de datos | El Administrador registra un usuario con datos incompletos. | Guarda el formulario. | Se validan los datos obligatorios y se indican los errores. |
| 3 | Confirmación de cambios sensibles | El Administrador desactiva un usuario o cambia su rol. | Confirma la operación. | Se solicita confirmación previa y se muestra el resultado de la operación. |

### E1-F10 · Administrador

Quiero utilizar una pantalla para asignar o cambiar el QE supervisor de un analista QA. Para mantener actualizada la organización del equipo.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Selección de analista y QE | Existen analistas y QE activos. | Selecciona un analista y un QE. | Se muestra la relación vigente del analista antes de confirmar. |
| 2 | Motivo del cambio | El analista ya tiene un QE vigente. | Asigna un nuevo QE. | Se solicita el motivo del cambio antes de guardar. |
| 3 | Historial de supervisión | El analista ha tenido varios supervisores. | Consulta el historial. | Se muestran las relaciones anteriores con fechas y motivos. |

### E1-F11 · Usuario autenticado

Quiero consultar mi nombre, correo y rol en la plataforma. Para verificar con qué identidad y permisos estoy trabajando.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Datos del perfil | El usuario está autenticado. | Abre su perfil. | Se muestran su nombre, correo y rol. |
| 2 | Rol de solo lectura | El usuario está en su perfil. | Intenta modificar el rol. | El rol no es editable desde el perfil personal. |
| 3 | Datos actualizados | El Administrador cambió el rol del usuario. | El usuario vuelve a abrir su perfil. | Se refleja el rol vigente. |

### E1-F12 · Usuario autenticado

Quiero cerrar sesión desde mi portal. Para finalizar mi acceso a la plataforma.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Opción visible | El usuario está en su portal. | Busca la opción de salir. | La opción de cerrar sesión es visible desde cualquier pantalla. |
| 2 | Cierre efectivo | El usuario está autenticado. | Presiona Cerrar sesión. | Se muestra la pantalla de inicio de sesión. |
| 3 | Navegación hacia atrás | El usuario cerró sesión. | Presiona volver atrás en el navegador. | No se puede consultar información protegida sin autenticarse nuevamente. |

### E1-B01 · Usuario registrado

Quiero que el sistema valide mis credenciales y mi acceso activo. Para iniciar una sesión segura.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Credenciales válidas | El usuario está activo y registrado en el proveedor de autenticación. | Envía credenciales correctas. | Se valida mediante el proveedor y se crea una sesión. |
| 2 | Usuario inactivo | El usuario fue desactivado. | Envía credenciales correctas. | Se rechaza el acceso sin revelar si el correo existe. |
| 3 | Intentos repetidos | Se registran múltiples intentos fallidos. | Envía un nuevo intento. | Se aplica protección frente a intentos repetidos de ingreso. |

### E1-B02 · Usuario autenticado

Quiero que el sistema habilite únicamente las operaciones y los datos que me corresponden. Para trabajar dentro de mis responsabilidades.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Solicitud sin autenticación | No hay sesión válida. | Se invoca una operación protegida. | La solicitud es rechazada. |
| 2 | Ámbito de analista | Un QA intenta consultar datos de otro analista. | Se invoca la consulta. | Se impide el acceso por ámbito. |
| 3 | Ámbito de QE | Un QE intenta consultar un equipo ajeno. | Se invoca la consulta. | Se verifica sesión, rol y ámbito y se rechaza la solicitud. |

### E1-B03 · Quality Engineer (QE)

Quiero que el sistema entregue el resumen de mi equipo y de las historias bajo mi supervisión. Para consultar mi situación inicial al ingresar al portal.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Cálculo sobre datos autorizados | El QE tiene equipo e historias. | Solicita el resumen. | Se calculan cantidades solo sobre datos autorizados del QE. |
| 2 | Consulta válida sin registros | El QE no tiene registros. | Solicita el resumen. | Se devuelve cero únicamente cuando la consulta válida no encuentra registros. |
| 3 | Fuente no disponible | La fuente de historias no responde. | Solicita el resumen. | Se informa que una fuente necesaria no está disponible. |

### E1-B04 · Quality Engineer (QE)

Quiero que el sistema identifique a los analistas que superviso actualmente. Para consultar la composición vigente de mi equipo.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Relaciones vigentes | Existen relaciones activas y finalizadas. | Solicita su equipo. | Se devuelven solo relaciones vigentes, excluyendo las finalizadas. |
| 2 | Restricción al QE autenticado | Un QE solicita el equipo de otro QE. | Invoca la consulta. | Se rechaza, salvo acceso administrativo autorizado. |
| 3 | Acceso administrativo | Un Administrador consulta el equipo de un QE. | Invoca la consulta. | Se devuelve la información por estar autorizado. |

### E1-B05 · Analista QA

Quiero que el sistema entregue mi supervisor vigente y el resumen de mis historias asignadas. Para conocer mi ámbito de trabajo al ingresar al portal.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Supervisor e historias | El analista tiene QE vigente e historias. | Solicita su resumen. | Se obtiene el supervisor vigente y las historias del analista autenticado. |
| 2 | Ausencia de supervisor | El analista no tiene QE vigente. | Solicita su resumen. | Se representa explícitamente la ausencia de supervisor. |
| 3 | Resumen de otro QA | Un analista solicita el resumen de otro. | Invoca la consulta. | Se impide sin permiso. |

### E1-B06 · Administrador

Quiero que el sistema entregue la información inicial de usuarios, roles y supervisión. Para acceder a la administración de la plataforma.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Solo acceso administrativo | Un usuario no administrador solicita la información. | Invoca la consulta. | Se rechaza la solicitud. |
| 2 | Información consistente | El Administrador solicita el resumen. | Invoca la consulta. | Se devuelve información consistente con el registro de usuarios y supervisión. |
| 3 | Datos recién modificados | Se acaba de registrar un usuario. | Invoca la consulta. | El nuevo usuario se refleja en la información entregada. |

### E1-B07 · Administrador

Quiero que el sistema registre usuarios y permita actualizar sus datos y estado de acceso. Para mantener un registro vigente de participantes.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Correo único | Ya existe un usuario con el mismo correo. | Registra un nuevo usuario. | Se rechaza por unicidad del correo tras validar campos. |
| 2 | Identificador estable | Se actualiza el correo de un usuario. | Guarda los cambios. | El identificador interno se mantiene estable y se coordina con el proveedor de autenticación. |
| 3 | Usuario desactivado | Un usuario fue desactivado. | Intenta una operación protegida. | Se impiden nuevas operaciones protegidas. |

### E1-B08 · Administrador

Quiero que el sistema permita asignar o modificar el rol de un usuario autorizado. Para establecer sus responsabilidades y permisos.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Rol definido | Se envía un rol fuera del catálogo. | Asigna el rol. | Se aceptan únicamente roles definidos. |
| 2 | Último administrador | Existe un solo administrador activo. | Intenta cambiar su rol. | Se evita dejar la plataforma sin administradores activos. |
| 3 | Relaciones incompatibles | Un QE con analistas supervisados cambia a rol QA. | Intenta cambiar el rol. | Se exige resolver las relaciones incompatibles antes de cambiar el rol. |

### E1-B09 · Administrador

Quiero que el sistema registre la relación entre un QE y sus analistas y conserve sus cambios. Para mantener trazabilidad de la organización del equipo.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Validación de roles | Se intenta asignar como supervisor a un usuario que no es QE o inactivo. | Registra la relación. | Se rechaza: el supervisor debe ser QE y el supervisado QA, ambos activos. |
| 2 | Un QE vigente por analista | El analista ya tiene un QE. | Registra un nuevo QE. | Se finaliza la relación anterior y se crea la nueva en una misma transacción. |
| 3 | Varios analistas por QE | El QE ya supervisa analistas. | Se le asigna otro analista. | Se permite la relación adicional. |

### E1-B10 · Usuario autenticado

Quiero que el sistema entregue mis datos de identidad y rol vigente. Para reconocer mi perfil dentro de la plataforma.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Identidad desde la sesión | El usuario tiene sesión válida. | Solicita su perfil. | La identidad se obtiene desde la sesión validada. |
| 2 | Datos mínimos | El usuario solicita su perfil. | Recibe la respuesta. | Se devuelven únicamente los datos necesarios. |
| 3 | Sin secretos | El usuario solicita su perfil. | Recibe la respuesta. | No se exponen contraseñas, secretos ni credenciales. |

### E1-B11 · Usuario autenticado

Quiero que el sistema controle la expiración y finalización de mi sesión. Para impedir que mi acceso continúe cuando deje de ser válido.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Sesión expirada | La sesión superó su vigencia. | Invoca una operación protegida. | La solicitud es rechazada. |
| 2 | Cierre de sesión | El usuario cierra sesión. | Invoca el cierre. | Se invalida la sesión de aplicación y se impide su renovación. |
| 3 | Revocación en el proveedor | Se cierra la sesión. | Se evalúa el proveedor de autenticación. | El alcance de revocación del proveedor queda definido y probado. |

### E1-B12 · Administrador

Quiero que el sistema registre los cambios de usuarios, roles y supervisión. Para conocer quién realizó cada modificación y cuándo.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Registro de auditoría | Se modifica un usuario, rol o supervisión. | Se confirma la operación. | Se registra actor, fecha, operación, recurso y cambios relevantes. |
| 2 | Motivo en supervisión | Se cambia el QE de un analista. | Se confirma el cambio. | Se conserva el motivo del cambio. |
| 3 | Datos sensibles | Se registra un cambio de credenciales. | Se genera el registro. | Se excluyen contraseñas y tokens de los registros. |

## ÉPICA 2 — GESTIÓN DE HISTORIAS DE USUARIO (HDU)

Registro, asignación, estados y consulta de las HDU bajo certificación, organizadas por célula y sprint.

### E2-F01 · Quality Engineer (QE)

Quiero registrar una nueva HDU con su identificador, título, célula, sprint y prioridad. Para iniciar su seguimiento de certificación.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Registro exitoso | El QE completa el formulario con datos válidos. | Presiona Guardar. | La HDU se crea en estado Pendiente y aparece en el listado. |
| 2 | Datos obligatorios | Faltan el identificador o el título. | Presiona Guardar. | Se indican los campos faltantes y no se crea la HDU. |
| 3 | Identificador duplicado | Ya existe una HDU con el mismo identificador. | Presiona Guardar. | Se informa el duplicado y se solicita corregirlo. |

### E2-F02 · Quality Engineer (QE)

Quiero asignar o reasignar el analista QA responsable de una HDU. Para distribuir la carga de certificación en mi equipo.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Asignación desde mi equipo | El QE abre una HDU sin analista. | Selecciona un analista supervisado. | La HDU queda asignada y visible para ese analista. |
| 2 | Analista fuera del equipo | El QE busca un analista que no supervisa. | Despliega el selector. | Solo se listan analistas de su equipo. |
| 3 | Reasignación | La HDU ya tiene analista. | Selecciona otro analista y confirma. | Se solicita confirmación y se registra el cambio. |

### E2-F03 · Analista QA

Quiero ver el listado de mis HDU asignadas con filtros por célula, sprint y estado. Para organizar mi trabajo de certificación.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Listado filtrado | El analista tiene HDU en varios sprints. | Aplica el filtro por sprint. | Se muestran solo las HDU del sprint elegido. |
| 2 | Sin resultados | Ningún registro cumple los filtros. | Aplica los filtros. | Se informa que no hay HDU con esos criterios. |
| 3 | Solo mis historias | El analista consulta el listado. | Visualiza los resultados. | Solo aparecen HDU asignadas a él. |

### E2-F04 · Usuario autenticado

Quiero ver el detalle de una HDU con su información, responsables, estado y avance. Para conocer su situación completa.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Detalle completo | El usuario tiene acceso a la HDU. | Abre el detalle. | Se muestran datos, QE, analista, estado, célula, sprint y avance del checklist. |
| 2 | HDU sin acceso | El usuario no está relacionado con la HDU. | Intenta abrir el detalle. | Se presenta acceso denegado. |
| 3 | Cambio de estado | El usuario autorizado está en el detalle. | Cambia el estado a uno válido. | Se actualiza el estado y se muestra la fecha del cambio. |

### E2-B01 · Quality Engineer (QE)

Quiero que el sistema persista las HDU con sus atributos y relaciones. Para mantener un registro único y trazable.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Creación persistente | Se recibe una HDU válida. | Se procesa la creación. | Se almacena con célula, sprint, prioridad, QE creador y fecha. |
| 2 | Validación de esquema | Se reciben datos inválidos. | Se procesa la solicitud. | Se rechaza indicando los errores de validación. |
| 3 | Unicidad | El identificador ya existe. | Se procesa la creación. | Se rechaza por duplicidad. |

### E2-B02 · Quality Engineer (QE)

Quiero que el sistema valide las transiciones de estado de una HDU. Para respetar el orden del proceso de certificación.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Transición válida | La HDU está en Pendiente. | Se solicita pasar a Diseño de pruebas. | Se acepta y registra la transición. |
| 2 | Transición inválida | La HDU está en Pendiente. | Se solicita pasar a Cerrada. | Se rechaza indicando las transiciones permitidas. |
| 3 | Cierre con checklist incompleto | Faltan entregables por completar. | Se solicita el estado Cerrada. | Se rechaza hasta completar el checklist. |

### E2-B03 · Analista QA

Quiero que el sistema filtre las HDU según mi rol y asignación. Para trabajar solo con las historias que me corresponden.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Analista | Un QA consulta el listado. | Se procesa la consulta. | Se devuelven solo HDU con analistaId igual al usuario. |
| 2 | QE | Un QE consulta el listado. | Se procesa la consulta. | Se devuelven HDU donde es responsable o de sus analistas. |
| 3 | Administrador | Un Administrador consulta el listado. | Se procesa la consulta. | Se devuelven todas las HDU. |

### E2-B04 · Administrador

Quiero que el sistema registre los cambios de asignación y estado de cada HDU. Para contar con trazabilidad del proceso.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Historial de estado | Cambia el estado de una HDU. | Se confirma el cambio. | Se registra estado anterior, nuevo, actor y fecha. |
| 2 | Historial de asignación | Se reasigna el analista. | Se confirma el cambio. | Se registra el analista anterior, el nuevo y el motivo. |
| 3 | Consulta del historial | Un usuario autorizado solicita el historial. | Se procesa la consulta. | Se devuelve en orden cronológico. |

## ÉPICA 3 — CERTIFICACIÓN Y ENTREGABLES

Checklist de 10 entregables con trazabilidad (quién/cuándo), evidencias y generación del certificado de cierre.

### E3-F01 · Analista QA

Quiero ver el checklist de 10 entregables de una HDU con su estado de cumplimiento. Para saber qué falta para certificarla.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Checklist completo | El analista abre una HDU. | Visualiza el checklist. | Se muestran los 10 entregables en orden, con estado, responsable y fecha de cada uno. |
| 2 | Porcentaje de cumplimiento | Hay entregables completados. | Visualiza el checklist. | Se muestra el porcentaje de avance calculado. |
| 3 | Solo lectura | Un usuario sin permiso abre la HDU. | Visualiza el checklist. | No puede marcar entregables. |

### E3-F02 · Analista QA

Quiero marcar un entregable como completado adjuntando evidencia. Para registrar el avance de la certificación.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Marcar con evidencia | El entregable está pendiente. | Lo marca y adjunta un enlace o archivo. | Queda completado con mi nombre y fecha. |
| 2 | Orden del proceso | El entregable anterior obligatorio está pendiente. | Intenta marcar el siguiente. | Se informa que debe completar el anterior. |
| 3 | Desmarcar | El entregable está completado. | Lo desmarca indicando motivo. | Se registra el retroceso y su motivo. |

### E3-F03 · Quality Engineer (QE)

Quiero aprobar los entregables que requieren revisión del QE. Para asegurar la calidad del proceso antes del cierre.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Aprobación | Un entregable está pendiente de aprobación. | Lo aprueba. | Queda aprobado con nombre y fecha del QE. |
| 2 | Rechazo con observaciones | El entregable no cumple. | Lo rechaza con comentario. | Vuelve a pendiente y el analista ve las observaciones. |
| 3 | Pendientes de aprobación | Existen varios entregables por aprobar. | Abre su bandeja. | Se listan agrupados por HDU. |

### E3-F04 · Quality Engineer (QE)

Quiero generar y descargar el certificado de una HDU con los 10 entregables completos. Para entregar evidencia formal de cierre a la célula.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Generación | Los 10 entregables están completos y aprobados. | Presiona Generar certificado. | Se descarga un PDF con folio, fechas y responsable de cada entregable. |
| 2 | Checklist incompleto | Falta un entregable. | Visualiza el botón. | El botón está deshabilitado y muestra el motivo. |
| 3 | Certificado existente | La HDU ya fue certificada. | Vuelve al detalle. | Puede descargar nuevamente el mismo certificado. |

### E3-B01 · Analista QA

Quiero que el sistema registre cada entregable como un registro con responsable y fecha. Para que el checklist sea evidencia auditable.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Registro individual | Se marca un entregable. | Se procesa la solicitud. | Se guarda completadoPor, completadoEn y evidencia. |
| 2 | Unicidad por HDU | Se intenta duplicar un entregable. | Se procesa la solicitud. | Se rechaza: un registro por clave y HDU. |
| 3 | Permisos | Un usuario sin rol autorizado marca un entregable. | Se procesa la solicitud. | Se rechaza la operación. |

### E3-B02 · Quality Engineer (QE)

Quiero que el sistema valide el orden y las aprobaciones del checklist. Para que el proceso de certificación sea consistente.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Orden obligatorio | El entregable previo está pendiente. | Se marca el siguiente. | Se rechaza indicando la dependencia. |
| 2 | Aprobación de QE | Un entregable requiere aprobación. | El analista intenta aprobarlo. | Se rechaza: solo el QE responsable puede aprobar. |
| 3 | Cálculo de cumplimiento | Cambia el estado de un entregable. | Se recalcula. | El porcentaje se actualiza sobre los 10 entregables. |

### E3-B03 · Quality Engineer (QE)

Quiero que el sistema genere el certificado en PDF con código verificable. Para respaldar formalmente el cierre de la HDU.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Generación con folio | El checklist está completo y aprobado. | Se solicita el certificado. | Se genera un PDF con folio único y se almacena. |
| 2 | Verificación | Alguien consulta un folio. | Invoca la verificación. | Se confirma HDU, fecha y validez del certificado. |
| 3 | Precondición incumplida | Falta un entregable. | Se solicita el certificado. | Se rechaza indicando el faltante. |

### E3-B04 · Administrador

Quiero que el sistema audite los cambios en entregables y certificados. Para conocer quién hizo cada cambio y cuándo.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Registro de cambio | Se marca, desmarca o aprueba un entregable. | Se confirma. | Se registra actor, fecha, valor anterior y nuevo. |
| 2 | Motivo de retroceso | Se desmarca un entregable. | Se confirma. | Se conserva el motivo. |
| 3 | Consulta | Un usuario autorizado pide la bitácora de una HDU. | Se procesa. | Se devuelve el historial completo. |

## ÉPICA 4 — IMPEDIMENTOS Y RIESGOS

Registro, seguimiento y resolución de impedimentos; clasificación del nivel de riesgo de cada HDU.

### E4-F01 · Analista QA

Quiero registrar un impedimento sobre una HDU indicando tipo, descripción y responsable de resolverlo. Para que mi QE pueda gestionarlo oportunamente.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Registro | El analista está en el detalle de la HDU. | Registra el impedimento. | La HDU queda marcada como bloqueada y el impedimento aparece en su detalle. |
| 2 | Datos obligatorios | Falta la descripción. | Presiona Guardar. | Se solicita completar los datos obligatorios. |
| 3 | Notificación al QE | Se registra el impedimento. | Se guarda. | El QE supervisor lo ve en su panel. |

### E4-F02 · Quality Engineer (QE)

Quiero ver los impedimentos abiertos de mi equipo priorizados por antigüedad y riesgo. Para intervenir antes de que afecten la certificación.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Listado priorizado | Existen impedimentos abiertos. | Abre la sección. | Se listan ordenados por riesgo y días abiertos, con HDU y analista. |
| 2 | Sin impedimentos | No hay impedimentos abiertos. | Abre la sección. | Se informa que el equipo no tiene bloqueos. |
| 3 | Filtro por célula | Hay impedimentos en varias células. | Filtra por célula. | Se muestran solo los de la célula elegida. |

### E4-F03 · Quality Engineer (QE)

Quiero resolver o escalar un impedimento registrando la acción tomada. Para dejar trazabilidad de la gestión.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Resolución | El impedimento está abierto. | Lo marca como resuelto con comentario. | La HDU deja de estar bloqueada y se registra la fecha. |
| 2 | Escalamiento | El impedimento excede mi ámbito. | Lo escala indicando a quién. | Queda en estado escalado con el responsable indicado. |
| 3 | Reapertura | Un impedimento resuelto vuelve a ocurrir. | Lo reabre. | Se conserva el historial anterior. |

### E4-F04 · Quality Engineer (QE)

Quiero establecer y visualizar el nivel de riesgo de cada HDU. Para priorizar la supervisión.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Nivel de riesgo | El QE abre una HDU. | Selecciona riesgo Alto, Medio o Bajo con justificación. | Se guarda y se muestra con un semáforo. |
| 2 | Riesgo sugerido | La HDU tiene impedimentos abiertos o atraso. | Abre la HDU. | Se sugiere un nivel de riesgo que el QE puede confirmar. |
| 3 | Listado por riesgo | Existen HDU con distintos riesgos. | Filtra por riesgo Alto. | Se muestran solo las HDU de riesgo alto. |

### E4-B01 · Analista QA

Quiero que el sistema registre los impedimentos como entidad vinculada a la HDU. Para gestionarlos con estados y responsables.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Creación | Se recibe un impedimento válido. | Se procesa. | Se guarda con HDU, tipo, descripción, creador, responsable y fecha. |
| 2 | Bloqueo de la HDU | Se crea un impedimento abierto. | Se procesa. | La HDU se marca como bloqueada automáticamente. |
| 3 | Ámbito | Un analista registra un impedimento en una HDU ajena. | Se procesa. | Se rechaza. |

### E4-B02 · Quality Engineer (QE)

Quiero que el sistema controle el ciclo de vida de los impedimentos. Para mantener la información consistente.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Estados válidos | El impedimento está abierto. | Se solicita resolver o escalar. | Se acepta y registra actor y fecha. |
| 2 | Desbloqueo | Se resuelve el último impedimento abierto. | Se procesa. | La HDU deja de estar bloqueada. |
| 3 | Transición inválida | El impedimento está resuelto. | Se solicita escalar. | Se rechaza; solo puede reabrirse. |

### E4-B03 · Quality Engineer (QE)

Quiero que el sistema calcule un riesgo sugerido a partir de impedimentos y atraso. Para apoyar la priorización del QE.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Impedimento abierto | La HDU tiene un impedimento abierto. | Se calcula el riesgo. | Se sugiere al menos riesgo Medio. |
| 2 | Atraso en sprint | La HDU está por cerrar sprint con cumplimiento bajo. | Se calcula el riesgo. | Se sugiere riesgo Alto. |
| 3 | Confirmación manual | El QE fija un riesgo distinto. | Se guarda. | Prevalece el valor del QE y se registra la justificación. |

### E4-B04 · Administrador

Quiero que el sistema audite la gestión de impedimentos y riesgos. Para tener trazabilidad de las intervenciones.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Registro | Cambia el estado de un impedimento o el riesgo. | Se confirma. | Se registra actor, fecha, valor anterior y nuevo. |
| 2 | Consulta | Un usuario autorizado pide el historial. | Se procesa. | Se devuelve cronológicamente. |
| 3 | Retención | Se cierra la HDU. | Se consulta el historial. | Se conserva el registro completo. |

## ÉPICA 5 — INTEGRACIÓN CON JIRA CLOUD

Sincronización de lectura de HDU desde Jira Cloud e importación alternativa por CSV/JSON.

### E5-F01 · Administrador

Quiero configurar la conexión con Jira Cloud (sitio, credenciales y proyecto). Para habilitar la sincronización de HDU.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Configuración válida | El Administrador ingresa los datos. | Presiona Probar conexión. | Se confirma la conexión y se guarda la configuración. |
| 2 | Credenciales inválidas | El token es incorrecto. | Presiona Probar conexión. | Se informa el error sin exponer el token. |
| 3 | Credenciales protegidas | La configuración existe. | Vuelve a abrir la pantalla. | El token se muestra enmascarado. |

### E5-F02 · Quality Engineer (QE)

Quiero sincronizar las HDU de un proyecto Jira hacia Quality360. Para no registrarlas manualmente.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Sincronización | La conexión está configurada. | Presiona Sincronizar. | Se muestran las HDU nuevas y actualizadas, con resumen del resultado. |
| 2 | Sin cambios | No hay historias nuevas. | Presiona Sincronizar. | Se informa que no hubo cambios. |
| 3 | Error de API | Jira no responde. | Presiona Sincronizar. | Se informa el error y se sugiere la importación alternativa. |

### E5-F03 · Quality Engineer (QE)

Quiero importar HDU desde un archivo CSV o JSON. Para contar con una alternativa cuando Jira no esté disponible.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Importación válida | El archivo cumple el formato. | Sube el archivo. | Se muestra una vista previa y luego se importan las HDU. |
| 2 | Formato inválido | El archivo tiene columnas faltantes. | Sube el archivo. | Se indican los errores por fila sin importar nada. |
| 3 | Duplicados | Algunas HDU ya existen. | Confirma la importación. | Se actualizan las existentes y se informan cuántas. |

### E5-F04 · Quality Engineer (QE)

Quiero ver el estado y el historial de sincronizaciones. Para confiar en la información importada.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Última sincronización | Existen sincronizaciones previas. | Abre el panel de integración. | Se muestra fecha, resultado y cantidad de HDU de la última ejecución. |
| 2 | Historial | Hay varias ejecuciones. | Abre el historial. | Se listan con fecha, origen (Jira/CSV) y resultado. |
| 3 | Detalle de errores | Una ejecución falló parcialmente. | Abre el detalle. | Se muestran las filas o issues con error. |

### E5-B01 · Administrador

Quiero que el sistema almacene la configuración de Jira de forma segura. Para proteger las credenciales de integración.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Cifrado | Se guarda un token. | Se procesa. | Se almacena cifrado y nunca se devuelve en claro. |
| 2 | Prueba de conexión | Se solicita probar. | Se invoca la API de Jira. | Se devuelve el resultado sin exponer credenciales. |
| 3 | Solo administrador | Un QE intenta configurar. | Se procesa. | Se rechaza. |

### E5-B02 · Quality Engineer (QE)

Quiero que el sistema consuma la API REST de Jira Cloud y mapee las issues a HDU. Para sincronizar la información de lectura.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Mapeo de campos | Se obtienen issues del proyecto. | Se procesa. | Clave, título, sprint, estado y responsable se mapean a la HDU. |
| 2 | Paginación | El proyecto tiene más issues que el tamaño de página. | Se procesa. | Se recorren todas las páginas. |
| 3 | Límite de tasa | Jira responde con límite excedido. | Se procesa. | Se reintenta con espera y se registra el evento. |

### E5-B03 · Quality Engineer (QE)

Quiero que el sistema importe HDU desde CSV/JSON validando su contenido. Para mantener la calidad de los datos.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Validación | Se recibe un archivo. | Se procesa. | Se valida esquema, tipos y campos obligatorios. |
| 2 | Upsert | Una HDU ya existe. | Se procesa. | Se actualiza sin duplicar y se conserva su checklist. |
| 3 | Transacción | Falla una fila en modo estricto. | Se procesa. | No se importa ninguna y se devuelve el detalle. |

### E5-B04 · Administrador

Quiero que el sistema registre cada ejecución de sincronización o importación. Para tener trazabilidad de la integración.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Registro | Termina una ejecución. | Se procesa. | Se guarda origen, actor, fecha, totales y errores. |
| 2 | Consulta | Se solicita el historial. | Se procesa. | Se devuelve ordenado por fecha. |
| 3 | Sin secretos | Se registra un error de autenticación. | Se guarda. | No se incluyen tokens en el registro. |

## ÉPICA 6 — INDICADORES Y DASHBOARDS

Dashboards de cumplimiento, avance, riesgos, impedimentos y carga de trabajo para la supervisión del QE.

### E6-F01 · Quality Engineer (QE)

Quiero ver un dashboard con el cumplimiento de certificación de mi equipo. Para supervisar el avance de un vistazo.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Indicadores | Existen HDU con avance. | Abre el dashboard. | Se muestran HDU totales, certificadas, en curso, bloqueadas y cumplimiento promedio. |
| 2 | Filtro por sprint y célula | Hay varios sprints y células. | Aplica filtros. | Los indicadores se recalculan según la selección. |
| 3 | Sin datos | No hay HDU en el filtro. | Aplica filtros. | Se informa que no hay datos, sin cifras ficticias. |

### E6-F02 · Quality Engineer (QE)

Quiero ver un semáforo de riesgo e impedimentos por célula. Para identificar dónde intervenir primero.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Semáforo | Existen HDU con distintos riesgos. | Abre la vista por célula. | Cada célula muestra su color según riesgo máximo e impedimentos abiertos. |
| 2 | Drill-down | Una célula está en rojo. | La selecciona. | Se listan las HDU que generan el riesgo. |
| 3 | Actualización | Se resuelve un impedimento. | Vuelve a la vista. | El semáforo refleja el nuevo estado. |

### E6-F03 · Quality Engineer (QE)

Quiero ver la carga de trabajo de cada analista de mi equipo. Para distribuir las HDU de forma equilibrada.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Carga por analista | Los analistas tienen HDU asignadas. | Abre la vista de carga. | Se muestra por analista la cantidad de HDU por estado y su cumplimiento. |
| 2 | Sobrecarga | Un analista supera el umbral configurado. | Abre la vista. | Se destaca visualmente. |
| 3 | Sin asignaciones | Un analista no tiene HDU. | Abre la vista. | Aparece con cero, diferenciado de un error. |

### E6-F04 · Quality Engineer (QE)

Quiero ver la tendencia histórica del cumplimiento y exportar el dashboard. Para reportar el avance a la célula.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Tendencia | Existen snapshots diarios. | Abre la gráfica de tendencia. | Se muestra la evolución del cumplimiento por sprint. |
| 2 | Exportación | El QE está en el dashboard. | Presiona Exportar. | Se descarga un PDF o CSV con los indicadores filtrados. |
| 3 | Sin historial | No hay snapshots. | Abre la gráfica. | Se informa que aún no hay historial. |

### E6-B01 · Quality Engineer (QE)

Quiero que el sistema calcule los indicadores de cumplimiento sobre datos autorizados. Para que el dashboard sea confiable.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Cálculo por ámbito | El QE solicita indicadores. | Se procesa. | Se calculan solo sobre HDU de su ámbito. |
| 2 | Filtros | Se envían sprint y célula. | Se procesa. | Los agregados respetan los filtros. |
| 3 | Consistencia | Cambia un entregable. | Se solicita el dashboard. | Los indicadores reflejan el cambio. |

### E6-B02 · Quality Engineer (QE)

Quiero que el sistema agregue riesgo e impedimentos por célula y analista. Para alimentar el semáforo y la carga de trabajo.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Agregación por célula | Existen HDU con riesgo e impedimentos. | Se procesa. | Se devuelve por célula el riesgo máximo y los impedimentos abiertos. |
| 2 | Agregación por analista | Se solicita la carga. | Se procesa. | Se devuelven HDU por estado y cumplimiento por analista. |
| 3 | Umbral | Se configura un umbral de carga. | Se procesa. | Se marca a los analistas que lo superan. |

### E6-B03 · Administrador

Quiero que el sistema genere un snapshot diario de indicadores. Para disponer de tendencia histórica.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Generación programada | Llega la hora configurada. | Se ejecuta la tarea. | Se guarda un snapshot por célula y sprint. |
| 2 | Idempotencia | La tarea se ejecuta dos veces el mismo día. | Se ejecuta. | No se duplica el snapshot. |
| 3 | Consulta | Se solicita la serie histórica. | Se procesa. | Se devuelve ordenada por fecha. |

### E6-B04 · Quality Engineer (QE)

Quiero que el sistema exporte los indicadores del dashboard. Para compartir reportes con la célula.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Exportación CSV | Se solicita CSV. | Se procesa. | Se genera con los indicadores filtrados. |
| 2 | Exportación PDF | Se solicita PDF. | Se procesa. | Se genera con encabezado, filtros aplicados y fecha. |
| 3 | Ámbito | Un QE exporta. | Se procesa. | Solo incluye datos de su ámbito. |
