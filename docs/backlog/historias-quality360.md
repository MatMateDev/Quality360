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

### E1-F13 · Usuario de Quality360

> Agregada el 2026-10-15 junto con el rediseño del inicio de sesión; aún no está en `Historias_de_usuario_Quality360.xlsx`.

Quiero recuperar mi acceso cuando olvido mi contraseña. Para volver a ingresar al portal sin depender del administrador.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Solicitud del enlace | El usuario está en la pantalla de inicio de sesión. | Selecciona «¿Olvidaste tu contraseña?», ingresa su correo y presiona Enviar enlace. | Se valida que el correo sea obligatorio y tenga formato válido, y se muestra siempre la misma confirmación, sin revelar si el correo está registrado. |
| 2 | Nueva contraseña | El usuario abre el enlace recibido por correo. | Ingresa y repite la nueva contraseña y presiona Guardar. | Se exige un mínimo de 8 caracteres y que ambas coincidan. Al guardar, se cierra la sesión de recuperación y el usuario vuelve al inicio de sesión con un aviso de contraseña actualizada. |
| 3 | Enlace inválido o ya usado | El enlace expiró o ya fue utilizado. | El usuario lo abre. | Se informa que el enlace no es válido y se ofrece solicitar uno nuevo, sin dar acceso al portal. |

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

### E1-B13 · Usuario registrado

> Agregada el 2026-10-15 junto con E1-F13; aún no está en `Historias_de_usuario_Quality360.xlsx`.

Quiero que el sistema gestione de forma segura el restablecimiento de mi contraseña. Para que solo quien controla mi correo pueda cambiarla.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Envío del enlace | Se solicita la recuperación para un correo. | El proveedor de autenticación procesa la solicitud. | Solo si el correo está registrado se envía un enlace de un solo uso, válido por un tiempo limitado. La respuesta es idéntica para correos registrados e inexistentes. |
| 2 | Cambio de contraseña | Se usa un enlace válido. | Se fija la nueva contraseña. | La contraseña anterior deja de ser válida, las sesiones previas no pueden renovarse y la sesión de recuperación no habilita el acceso al portal. |
| 3 | Redirección y abuso | Se solicita con una dirección de retorno no autorizada o se repiten las solicitudes. | El proveedor procesa la solicitud. | Solo se redirige a direcciones autorizadas y se limita la frecuencia de envíos, sin revelar si el correo existe. |

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

## ÉPICA 7 — BANDEJAS POR ROL

> Agregada el 2026-10-21; aún no está en `Historias_de_usuario_Quality360.xlsx`. Fuente completa (reglas de negocio, fixture y 100 casos de prueba): `docs/backlog/e7-bandejas-por-rol.md`. Decisiones D28–D53 en `docs/arquitectura/decisiones-mvp.md`.

Bandeja de inicio por rol para Analista QA, QE, Líder QA, Administrador y Auditor; roles de solo lectura, células del Líder y consultas con exportación del Auditor.

### E7-F01 · Usuario autenticado

Quiero entrar automáticamente a la bandeja de mi rol y que solo vea las opciones que me corresponden. Para empezar a trabajar sin pasar por pantallas ajenas.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Redirección por rol | El usuario tiene credenciales válidas y un rol asignado. | Inicia sesión. | Es dirigido a la bandeja de su rol: Analista QA a `/qa`, QE a `/qe`, Líder QA a `/lider`, Administrador a `/admin`, Auditor a `/auditor`. La pantalla muestra su nombre y rol. |
| 2 | Menú según rol | El usuario está en su bandeja. | Revisa el menú. | Solo aparecen las opciones de su rol, con «Bandeja» en primer lugar. El Líder y el Auditor no ven opciones de creación ni de edición. |
| 3 | Bandeja ajena | El usuario está autenticado con un rol. | Abre por URL la bandeja o una pantalla de otro rol. | Ve «No tienes acceso a esta sección» con el botón «Ir a mi bandeja» y no se carga ningún dato. Sin sesión, lo envían al inicio de sesión y, tras ingresar, llega a su propia bandeja aunque la ruta pedida fuera de otro rol. |

### E7-F02 · Analista QA

Quiero una bandeja con mis HDU ordenadas por lo que me falta hacer. Para corregir primero lo observado y avanzar el siguiente entregable.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Bandeja con trabajo | El analista tiene HDU asignadas, algunas con observaciones del QE. | Abre su bandeja. | Ve los contadores «Abiertas», «Con observaciones» y «Esperando aprobación», y la lista de sus HDU con las observadas primero, el avance y el siguiente entregable de cada una. |
| 2 | Sin HDU, sin supervisor o fuente caída | El analista no tiene HDU, o no tiene QE vigente, o Certificaciones no responde. | Abre su bandeja. | Sin HDU: contadores en 0 y «No tienes HDU asignadas». Sin QE: «Sin supervisor asignado». Con Certificaciones caída: los contadores de observaciones y de aprobación dicen «No disponible» y la lista de HDU sigue visible sin avance. Nunca se muestra 0 por una fuente caída. |
| 3 | Filtros y solo mis HDU | Existen HDU de otros analistas. | Filtra por estado o por «Solo con observaciones» y abre una HDU. | Solo aparecen HDU propias; al abrir una se llega a su detalle y checklist. Una HDU ajena abierta por URL da acceso denegado. |

### E7-F03 · Quality Engineer (QE)

Quiero una bandeja con lo que requiere mi acción. Para no revisar HDU una por una y desbloquear a mi equipo.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Acciones pendientes | El QE es responsable de HDU con entregables por aprobar, sin analista, listas para certificar y listas para cerrar. | Abre su bandeja. | Ve los contadores «Por aprobar», «Sin analista», «Listas para certificar» y «Listas para cerrar», más su resumen de equipo, y una lista donde cada fila indica la acción pendiente y tiene su botón. |
| 2 | Sin pendientes o fuente caída | El QE no tiene acciones, o Certificaciones no responde. | Abre su bandeja. | Sin acciones: «No tienes acciones pendientes» con los contadores en 0. Con Certificaciones caída: los contadores y filas que dependen del checklist dicen «No disponible»; «Sin analista» y el resumen del equipo siguen visibles. |
| 3 | Acción y ámbito | Hay una HDU de un analista suyo cuyo QE responsable es otro QE. | Usa el botón de una fila y revisa la lista. | El botón lleva a la pantalla de esa acción (aprobaciones, asignación o detalle). La HDU donde otro QE es responsable no aparece en la lista de acciones. |

### E7-F04 · Líder QA

Quiero una bandeja con todas las HDU de las células que tengo a cargo. Para conocer el estado de certificación de mis células sin depender de cada QE.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | HDU de mis células | El líder tiene dos células con HDU de distintos QE y estados. | Abre su bandeja. | Ve sus células, los contadores, el resumen por célula y la lista de HDU de esas células con QE, analista, avance y certificado. No aparece ninguna HDU de otra célula. |
| 2 | Sin células o fuente caída | El líder no tiene células vigentes, o Certificaciones no responde. | Abre su bandeja. | Sin células: «Aún no tienes células asignadas. Pide al Administrador que te las asigne», sin tablas ni cifras ficticias. Con Certificaciones caída: avance y certificado dicen «No disponible» y la lista de HDU se mantiene. |
| 3 | Solo lectura | El líder abre una HDU de su célula. | Revisa la pantalla. | Ve datos, checklist, evidencias y certificado, y puede descargar el certificado. No hay botones para marcar, aprobar, asignar, cambiar estado ni generar certificado. Una HDU de otra célula da acceso denegado. |

### E7-F05 · Administrador

Quiero una bandeja con lo que falta configurar y con mis últimos cambios. Para mantener la organización al día.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Pendientes de configuración | Hay analistas sin QE, líderes sin células y células sin líder. | Abre su bandeja. | Ve los contadores de usuarios (activos con desglose por rol, e inactivos), analistas sin QE, QE sin analistas, líderes sin células, células sin líder y HDU totales, y la lista de pendientes con un botón por fila. |
| 2 | Todo en orden o fuente caída | No hay pendientes, o el servicio de Organización no responde. | Abre su bandeja. | Sin pendientes: «No hay pendientes de configuración» y contadores en 0. Con error: mensaje de error con «Reintentar», sin cifras ficticias (E1-F08#2); los accesos a usuarios, roles y supervisión siguen disponibles. |
| 3 | Ir a resolver | Hay un líder sin células. | Pulsa «Asignar células» en su fila. | Abre la pantalla de usuarios con ese usuario seleccionado. Los últimos cambios de la bandeja incluyen la asignación recién hecha al volver. |

### E7-F06 · Auditor

Quiero consultar todas las HDU, checklists, evidencias, certificados, la bitácora y la auditoría de usuarios, con filtros y exportación. Para verificar la trazabilidad sin poder modificar nada.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Consulta global | Existen HDU de varias células, certificados y eventos. | Abre su bandeja y recorre las cuatro pestañas. | Ve los contadores y, en cada pestaña, la lista completa con sus columnas, orden y paginación; el detalle de cualquier HDU muestra checklist, evidencias, historiales y certificado. |
| 2 | Filtros y exportación | El auditor aplica filtros en una pestaña. | Pulsa «Exportar CSV». | Se descarga un CSV con exactamente las filas y columnas filtradas. Sin resultados se informa «No hay registros con esos filtros» y el botón queda deshabilitado. Si supera 50.000 filas se pide acotar los filtros. |
| 3 | Solo lectura y fuente caída | El auditor está en cualquier pantalla, o una fuente no responde. | Revisa las acciones disponibles. | No existe ningún botón de marcar, aprobar, asignar, editar o crear. Si una fuente cae, solo esa pestaña dice «No disponible» con «Reintentar»; las demás siguen funcionando. |

### E7-F07 · Administrador

Quiero asignar el rol Líder QA o Auditor a un usuario y, para el Líder, elegir sus células. Para definir quién ve qué en las bandejas.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Asignar rol y células | El Administrador edita un usuario activo. | Elige el rol Líder QA, marca CEL-A y CEL-B y confirma. | El selector ofrece los 5 roles; al elegir Líder QA aparece la lista de células; se pide confirmación y se muestra el resultado. Con Auditor no aparece lista de células. |
| 2 | Validaciones | El Administrador deja a un Líder sin células, o intenta cambiar de rol a un Líder que aún las tiene. | Guarda. | Un Líder sin células se permite, con el aviso «Este líder no verá ninguna HDU hasta que le asignes células». Cambiar el rol de un Líder con células se rechaza indicando que primero debe quitárselas; no se aplica ningún cambio parcial. |
| 3 | Reflejo y rastro | El Administrador cambió las células de un Líder. | Consulta el usuario y el historial. | La pantalla muestra las células vigentes y su historial con fechas y quién las asignó; el cambio aparece en la auditoría. |

### E7-B01 · Administrador

Quiero que el sistema registre los roles Líder QA y Auditor y las células de cada Líder. Para que la visibilidad de cada usuario quede definida y trazable.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Catálogo y asignación | Existen usuarios activos y células. | El Administrador asigna el rol Líder QA con dos células. | El catálogo ofrece 5 roles; el usuario queda con rol `LIDER_QA` y dos asignaciones vigentes en `celula_lider`; se registra en la auditoría el rol y las células, con actor y fecha. |
| 2 | Reglas de integridad | Se envían datos inválidos o incompatibles. | El Administrador confirma. | Un rol fuera del catálogo se rechaza (400 `VALIDACION`, como E1-B08#1). Asignar células a quien no es Líder se rechaza (409 `ROL_INCOMPATIBLE`). Una célula inexistente se rechaza (422). Cambiar el rol de un Líder con células vigentes se rechaza (409 `RELACIONES_INCOMPATIBLES`). Se mantiene la regla del último administrador. Quitar una célula conserva el registro con `fecha_hasta`. |
| 3 | Solo el Administrador | Un usuario no administrador intenta cambiar roles o células. | Invoca la operación. | Se rechaza con 403 `ACCESO_DENEGADO` y no se modifica nada; sin sesión, 401. |

### E7-B02 · Usuario autenticado

Quiero que el sistema limite lo que veo según mi rol y me impida modificar datos si soy Líder QA o Auditor. Para que la consulta sea amplia pero segura.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Ámbito del Líder | El líder tiene células vigentes. | Consulta el listado, el detalle, el checklist, las evidencias o el certificado de una HDU. | El listado solo incluye HDU de sus células vigentes. Cualquier recurso de una HDU de otra célula responde 403 `ACCESO_DENEGADO` (D12). Un líder sin células recibe una lista vacía con 200, no un error. |
| 2 | Lectura total del Auditor | Existen HDU de todas las células. | El auditor consulta listado, detalle, checklist, evidencias, certificados e historiales. | Recibe todas las HDU y recursos asociados, incluidos URLs firmadas de corta duración para evidencias y certificados (D20). |
| 3 | Sin escritura | Un Líder o un Auditor invoca una operación que modifica datos. | Invoca crear o editar HDU, cambiar estado, asignar, marcar, desmarcar, aprobar, rechazar, generar certificado, usuarios, supervisión o células. | Todas responden 403 `ACCESO_DENEGADO`, sin cambios en los datos ni nuevos eventos de bitácora. |

### E7-B03 · Usuario autenticado

Quiero que el sistema entregue la bandeja de mi rol con contadores y lista calculados sobre mi ámbito. Para ver mi trabajo al ingresar.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Cálculo por ámbito | Cada rol tiene datos en su ámbito. | Solicita `GET /v1/bandeja/<su rol>`. | Devuelve los contadores y la lista de la sección 6 calculados solo con datos de su ámbito; un resultado vacío válido devuelve 0 con estado `ok`. |
| 2 | Fuente no disponible | Certificaciones no responde. | Solicita la bandeja de Analista, QE, Líder o Auditor. | Los bloques que dependen del checklist vienen con `estado: indisponible` y sin valor; los demás vienen `ok` y la respuesta es 200. Nunca se devuelve 0 por una fuente caída (D34). |
| 3 | Rol exclusivo | Un usuario pide la bandeja de otro rol, no tiene sesión o está desactivado. | Invoca el endpoint. | Otro rol, incluido el Administrador: 403 `ACCESO_DENEGADO`. Sin sesión o con token inválido: 401 `NO_AUTENTICADO`. Usuario desactivado: 403 `ACCESO_DENEGADO`. |

### E7-B04 · Auditor

Quiero que el sistema entregue la bitácora de checklist, la auditoría de usuarios y los certificados, con filtros y exportación. Para auditar sin poder modificar.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Consulta con filtros | Existen eventos de checklist, cambios de usuarios y certificados. | El auditor consulta cada recurso con filtros de fecha, HDU, actor, acción u operación. | Devuelve solo los registros que cumplen los filtros, ordenados del más reciente al más antiguo, paginados, con los campos de la sección 6.5. Un filtro sin coincidencias devuelve 200 con lista vacía. |
| 2 | Contenido seguro y acceso | El auditor consulta la auditoría de usuarios; otro rol intenta consultar. | Invoca los endpoints. | Ninguna fila incluye contraseñas, tokens ni secretos (E1-B12#3). Cualquier rol distinto de Auditor, incluido el Administrador, recibe 403; sin sesión, 401. |
| 3 | Exportación | El auditor pide exportar con filtros. | Invoca la exportación. | Genera un CSV con los mismos filtros y columnas que la consulta, UTF-8 con BOM, separador `;` y fechas ISO 8601. Con más de 50.000 filas responde 422 `EXPORTACION_EXCEDE_LIMITE`. Cada exportación queda registrada con actor, recurso, filtros y cantidad de filas. |

### E7-B05 · Administrador

Quiero reasignar el QE responsable de una HDU. Para liberar a un QE (por ejemplo, antes de cambiarle el rol) sin dejar HDU huérfanas.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Reasignación con motivo | Una HDU abierta tiene un QE responsable y existe otro QE activo. | El Administrador reasigna el QE responsable e indica el motivo. | La HDU queda con el nuevo QE responsable. El historial de la HDU registra el cambio (QE anterior, QE nuevo, motivo, actor y fecha) y la auditoría guarda `REASIGNAR_QE_RESPONSABLE` con antes, después y motivo, en una sola transacción. Si el QE indicado ya era el responsable, responde 200 sin registrar nada. |
| 2 | Solo el Administrador | Un usuario que no es Administrador intenta reasignar. | Invoca la operación. | Responde 403 `ACCESO_DENEGADO` al QE (también al responsable), al Analista QA, al Líder QA y al Auditor; sin sesión, 401. No cambia nada. |
| 3 | Destino inválido o HDU cerrada | El destino no es un QE activo, falta el motivo o la HDU está cerrada. | Invoca la operación. | Destino inexistente, que no es QE o inactivo: 422 `QE_INVALIDO`. Sin motivo: 400 (en blanco: 422 `MOTIVO_REQUERIDO`). HDU cerrada: 409 `HDU_CERRADA`. HDU inexistente: 404. No cambia nada. |
