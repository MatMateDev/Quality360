from pathlib import Path
import xml.etree.ElementTree as ET
from html import escape
import math
import textwrap

OUT = Path(__file__).resolve().parent
PAGES = []
BLUE='#e8f0fc'; GREEN='#e4f3ed'; GRAY='#f2f4f7'; AMBER='#fff2d8'

class Diagram:
    def __init__(self,title,scope,description,notes,w=1400,h=850):
        self.title,self.scope,self.description,self.notes=title,scope,description,notes
        self.w,self.h=w,h; self.nodes=[]; self.edges=[]; PAGES.append(self)
    def n(self,id,label,x,y,w=220,h=90,kind='box',fill=BLUE):
        self.nodes.append(dict(id=id,label=label,x=x,y=y,w=w,h=h,kind=kind,fill=fill)); return id
    def e(self,a,b,label='',points=None,dashed=False,arrow=True,ends=None):
        self.edges.append(dict(a=a,b=b,label=label,points=points,dashed=dashed,arrow=arrow,ends=ends))
    def lookup(self,id): return next(n for n in self.nodes if n['id']==id)
    def route(self,e):
        a,b=self.lookup(e['a']),self.lookup(e['b'])
        if e['points']: return e['points']
        ac=(a['x']+a['w']/2,a['y']+a['h']/2); bc=(b['x']+b['w']/2,b['y']+b['h']/2)
        dx,dy=bc[0]-ac[0],bc[1]-ac[1]
        def bound(n,c,dx,dy):
            f=min(n['w']/2/abs(dx) if dx else 1e9,n['h']/2/abs(dy) if dy else 1e9)
            return (c[0]+dx*f,c[1]+dy*f)
        return [bound(a,ac,dx,dy),bound(b,bc,-dx,-dy)]

d=Diagram('01 Mapa de actores','Contexto completo del MVP',
'El QE supervisa y el analista certifica. El administrador configura el acceso y la organización. Los sistemas externos apoyan la operación y no son roles humanos.',
['El responsable externo puede ser un equipo sin cuenta: el QE registra su seguimiento.', 'Jira es una integración condicionada a disponibilidad. CSV y JSON permiten validar el MVP con datos anonimizados.', 'Profesor y equipo Capstone evalúan y construyen el producto; no son roles operativos del portal.'])
d.n('sys','Quality360\nSeguimiento de certificaciones QA',540,320,320,140)
d.n('qe','Quality Engineer\nSupervisa analistas\nGestiona escalamientos',70,170,280,110)
d.n('qa','Analista QA\nCertifica historias\nRegistra evidencias',70,500,280,110)
d.n('adm','Administrador\nUsuarios, roles y supervisión',550,60,300,100)
d.n('ext','Responsable externo\nResuelve el impedimento\nPuede no tener cuenta',1010,540,300,110,fill=AMBER)
d.n('auth','Proveedor de identidad\nAutenticación y sesiones',1010,120,300,100,fill=GRAY)
d.n('jira','Jira / archivos CSV y JSON\nInformación de origen',1010,320,300,100,fill=GRAY)
d.e('qe','sys','Supervisión');d.e('qa','sys','Certificación');d.e('adm','sys','Configuración')
d.e('sys','auth','Validación de identidad');d.e('jira','sys','Importación')
d.e('qe','ext','Coordinación fuera del portal',[(210,170),(210,30),(1350,30),(1350,595),(1310,595)],True)
d.e('sys','ext','Referencia de responsabilidad',dashed=True,arrow=False)

d=Diagram('02 Casos de uso UML','Épica E1 con contexto de evolución',
'Los actores especializados heredan las funciones comunes del usuario. Iniciar sesión es un caso independiente; tener una sesión válida es precondición de los casos protegidos.',
['Asociación sin flecha: participación del actor. Triángulo vacío: generalización hacia Usuario.', 'Los casos azules pertenecen a E1. Los casos ámbar corresponden a E2–E6 y muestran continuidad del producto.', 'La autenticación no se modela como include de cada consulta: ocurre antes y su sesión se valida en cada solicitud.'],1600,1020)
d.n('boundary','Quality360',350,35,1170,940,'boundary', '#ffffff')
d.n('user','Usuario',50,90,110,100,'actor')
d.n('admin','Administrador',40,400,130,100,'actor')
d.n('qe','QE',40,620,130,100,'actor')
d.n('qa','Analista QA',40,840,130,100,'actor')
for id in ['admin','qe','qa']:
    d.e(id,'user','',[(40,d.lookup(id)['y']+50),(20,d.lookup(id)['y']+50),(20,140),(50,140)],ends='generalization')
for id,label,x,y in [('login','UC01 Iniciar sesión',440,90),('profile','UC02 Consultar perfil',780,90),('logout','UC03 Cerrar sesión',1120,90),('users','UC04 Gestionar usuarios y roles',470,300),('supervision','UC05 Gestionar supervisión',1050,300),('adminhome','UC06 Consultar inicio administrador',770,440),('qehome','UC07 Consultar inicio QE',470,590),('team','UC08 Consultar analistas supervisados',1050,590),('qahome','UC09 Consultar inicio QA',470,800)]:
    d.n(id,label,x,y,300,80,'ellipse')
d.n('later','E2–E6\nGestionar HU, certificaciones\ne impedimentos',1050,790,350,120,'ellipse',AMBER)
for id in ['login','profile','logout']: d.e('user',id,arrow=False,points=[(160,140),(310,140),(310,70),(d.lookup(id)['x']+150,70),(d.lookup(id)['x']+150,90)])
for a,b in [('admin','users'),('admin','supervision'),('admin','adminhome'),('qe','qehome'),('qe','team'),('qa','qahome')]: d.e(a,b,arrow=False)
d.e('qa','later',arrow=False,points=[(170,930),(850,930),(1225,930),(1225,910)])
d.n('idp','Proveedor\nde identidad',1330,190,150,70,'actor',GRAY); d.e('idp','login',arrow=False,points=[(1330,225),(410,225),(410,130),(440,130)])

d=Diagram('03 Diagrama de actividad UML','E1 Inicio de sesión y acceso por rol',
'La actividad cubre el ingreso, la validación de identidad y estado, la decisión de rol y la carga del panel. La autorización se vuelve a comprobar en las consultas protegidas.',
['Las guardas entre corchetes son excluyentes. Las ramas de rol convergen en una carga común de panel.', 'La falla de consulta se distingue de una lista vacía; no se inventan contadores.', 'El cierre de sesión y la expiración se cubren mediante E1-F12 y E1-B11.'],1400,1060)
for id,label,x in [('l1','Usuario',20),('l2','Portal React',360),('l3','Identidad y backend',820)]: d.n(id,label,x,20,320 if x==20 else 440 if x==360 else 550,1010,'boundary','#ffffff')
d.n('start','',160,80,26,26,'initial','#172033')
d.n('enter','Ingresar credenciales',65,145,230,65)
d.n('send','Validar campos y enviar',405,145,310,65)
d.n('validate','Validar credenciales\ny usuario activo',880,145,370,70)
d.n('valid','¿Acceso válido?',975,255,180,100,'diamond')
d.n('error','Mostrar error genérico\ny permitir reintento',420,270,300,70,fill=AMBER)
d.n('session','Establecer sesión\ny consultar rol vigente',880,410,370,70)
d.n('role','Rol',505,420,140,100,'diamond')
d.n('ad','Portal Administrador',385,580,150,75); d.n('qe','Portal QE',550,580,130,75); d.n('qa','Portal QA',695,580,110,75)
d.n('merge','',565,710,30,30,'diamond')
d.n('load','Solicitar panel autorizado',430,785,300,65)
d.n('permit','Validar rol y ámbito\nConsultar datos permitidos',900,780,340,75)
d.n('show','Mostrar panel o estado\nde error / sin información',430,920,300,65)
d.n('end','',575,1000,25,25,'final')
d.e('start','enter');d.e('enter','send');d.e('send','validate');d.e('validate','valid')
d.e('valid','error','[No]');d.e('error','enter','Reintentar',[(420,305),(330,305),(330,177),(295,177)])
d.e('valid','session','[Sí]');d.e('session','role')
d.e('role','ad','[Administrador]',[(505,470),(460,470),(460,580)])
d.e('role','qe','[QE]',[(575,520),(615,550),(615,580)])
d.e('role','qa','[QA]',[(645,470),(750,470),(750,580)])
for id in ['ad','qe','qa']: d.e(id,'merge')
d.e('merge','load');d.e('load','permit');d.e('permit','show','Respuesta',[(1070,855),(1070,950),(730,950)])
d.e('show','end')

d=Diagram('04 Diagrama de clases UML','Modelo conceptual del dominio',
'Las clases expresan el dominio y sus multiplicidades. Las asociaciones conceptuales entre servicios se implementan con identificadores y contratos, no con claves foráneas entre propietarios de datos.',
['Supervisión mantiene vigencia. Restricción: un QA tiene como máximo un QE supervisor activo; ambos extremos de la relación son Usuario con el rol correspondiente.', 'Una HU puede pasar por varios sprints y tener varios ciclos de certificación; como máximo uno activo. HistoriaSprint preserva la participación histórica.', 'Cada certificación registra analista y QE por ID, con historial de asignación. Rol es una enumeración de tres valores en E1.', 'Las clases mostradas son el núcleo. Evidencia, Ejecución y Defecto se mantienen como entidades separadas; el detalle de plantillas e integración queda para diseño físico.'],1700,1240)
classes=[('u','Usuario\n+ id: UUID\n+ nombre: String\n+ rol: Rol\n+ activo: Boolean',50,60),('s','Supervisión\n+ id: UUID\n+ qeId: UUID\n+ analistaId: UUID\n+ desde: DateTime\n+ hasta: DateTime?',410,60),('c','Célula\n+ id: UUID\n+ nombre: String',850,60),('sp','Sprint\n+ id: UUID\n+ inicio: Date\n+ fin: Date',1280,60),('a','AsignaciónCertificación\n+ analistaId: UUID\n+ qeId: UUID\n+ desde: DateTime\n+ hasta: DateTime?\n+ motivo: String',50,380),('cert','Certificación\n+ id: UUID\n+ ciclo: Integer\n+ estado: EstadoQA\n+ riesgo: Nivel\n+ cerrar()',410,380),('hu','HistoriaUsuario\n+ id: UUID\n+ codigoOrigen: String\n+ titulo: String\n+ estadoOrigen: String',850,380),('hs','HistoriaSprint\n+ historiaId: UUID\n+ sprintId: UUID\n+ vigente: Boolean',1280,380),('ent','Entregable\n+ id: UUID\n+ estado: EstadoEntrega\n+ aplicable: Boolean\n+ actualizar()',50,740),('imp','Impedimento\n+ id: UUID\n+ prioridad: Nivel\n+ estado: EstadoImp\n+ fechaCompromiso: Date?\n+ fechaResolucion: Date?',410,740),('ex','EjecuciónPrueba\n+ id: UUID\n+ casoReferencia: String\n+ resultado: Resultado',850,740),('df','Defecto\n+ id: UUID\n+ referenciaOrigen: String\n+ severidad: Nivel\n+ estado: String',1280,740),('ev','Evidencia\n+ id: UUID\n+ enlace: URL\n+ fecha: DateTime',50,1030),('ac','AcciónImpedimento\n+ id: UUID\n+ autorId: UUID\n+ tipo: TipoAccion\n+ descripcion: String\n+ fecha: DateTime',410,1030)]
for id,label,x,y in classes: d.n(id,label,x,y,280,175,'class',GREEN if id in ['cert','ent','ex','df','ev','a'] else BLUE)
for a,b,label in [('u','s','1 usuario / 0..* relaciones por rol'),('c','sp','1 / 0..*'),('c','hu','1 / 0..*'),('sp','hs','1 / 0..*'),('hu','hs','1 / 0..*'),('hu','cert','1 / 0..*'),('cert','a','1 / 1..*'),('cert','imp','1 / 0..*'),('ent','ev','1 / 0..*'),('imp','ac','1 / 0..*')]: d.e(a,b,label,arrow=False)
d.e('cert','ent','1 / 1..*',[(410,510),(190,650),(190,740)],arrow=False)
d.e('cert','ex','1 / 0..*',[(690,470),(780,470),(780,690),(990,690),(990,740)],arrow=False)
d.e('cert','df','1 / 0..*',[(690,420),(740,420),(740,640),(1420,640),(1420,740)],arrow=False)

d=Diagram('05 Diagrama de componentes UML','Arquitectura propuesta de cuatro microservicios',
'React consume un gateway que enruta y compone consultas. Cada microservicio encapsula sus reglas y datos; el proveedor de identidad autentica y los servicios autorizan cada recurso.',
['Dependencia discontinua: uso de un contrato. Los nombres sobre los enlaces identifican APIs o protocolos.', 'La información del dashboard se compone en el gateway; una caída parcial debe reportarse como información no disponible.', 'Integraciones incorpora historias a través de la API de Organización. Los otros servicios conservan la propiedad exclusiva de sus datos.'],1450,900)
for id,label,x,y,w in [('web','«component»\nPortal React',70,80,260),('auth','«component externo»\nProveedor de identidad',1080,80,290),('gw','«component»\nGateway y composición',540,80,330),('org','«component»\nOrganización y seguimiento',50,360,290),('cert','«component»\nCertificaciones',420,360,260),('imp','«component»\nImpedimentos',770,360,260),('int','«component»\nIntegraciones',1120,360,260)]:d.n(id,label,x,y,w,100,'component')
d.e('web','gw','HTTPS REST',dashed=True);d.e('web','auth','Autenticar',[(200,80),(200,35),(1225,35),(1225,80)],True)
for id in ['org','cert','imp','int']:d.e('gw',id,'API REST',dashed=True)
for id,x,label in [('org',50,'organizacion'),('cert',420,'certificaciones'),('imp',770,'impedimentos'),('int',1120,'integraciones')]:
    d.n(id+'db','«data store»\nPostgreSQL\n'+label,x,650,260,110,'box',GRAY);d.e(id,id+'db','SQL privado',dashed=True)
d.e('int','org','Importar HU mediante API',[(1250,460),(1250,545),(195,545),(195,460)],True)
d.n('note','Todos los servicios validan identidad, rol y ámbito.\nSin escrituras ni consultas SQL entre esquemas de otros servicios.',430,785,620,70,'box',AMBER)

d=Diagram('06 Diagrama de comunicación UML','E1 Escenario exitoso de ingreso del QE',
'Los objetos intercambian mensajes numerados. La numeración determina el orden; la posición de los objetos no representa tiempo. El proveedor devuelve una sesión y el backend verifica sus credenciales.',
['1: el QE envía credenciales. 1.1 y 1.2: el portal autentica y recibe sesión.', '2: el portal solicita su resumen. 2.1: el gateway valida la sesión. 2.2: Organización valida rol, usuario activo y ámbito; 2.2.1 consulta datos.', '2.3 y 2.4: se devuelve el resumen. 3: el portal muestra el panel. Una identidad inválida termina con rechazo, sin consultar datos protegidos.', 'Trazabilidad: E1-F01, F02, F03 y E1-B01, B02, B03.'],1500,820)
d.n('qe',':QE',60,330,150,100,'actor'); d.n('ui',':PortalReact',380,330,260,100)
d.n('auth',':ProveedorIdentidad',400,70,280,90,fill=GRAY);d.n('gw',':Gateway',900,330,240,100)
d.n('org',':Organización',900,610,260,90); d.n('db',':RepositorioOrganización',1200,610,270,90,fill=GRAY)
d.e('qe','ui','1: ingresar credenciales');d.e('ui','auth','1.1: autenticar',[(445,330),(445,160)])
d.e('auth','ui','1.2: sesión',[(610,160),(610,330)],True)
d.e('ui','gw','2: solicitar inicio QE',[(640,350),(900,350)])
d.e('gw','ui','2.4: resumen autorizado',[(900,415),(640,415)],True)
d.e('gw','auth','2.1: verificar sesión',[(1020,330),(1020,115),(680,115)])
d.e('gw','org','2.2: obtener inicio autorizado',[(960,430),(960,610)])
d.e('org','gw','2.3: resumen',[(1120,610),(1120,430)],True)
d.e('org','db','2.2.1: consultar equipo y HU')
d.e('ui','qe','3: mostrar panel',[(450,430),(450,520),(130,520),(130,430)])

d=Diagram('07 Diagrama de despliegue UML','Topología objetivo para demostración del MVP',
'La propuesta despliega el frontend, el gateway y cuatro procesos independientes. Una instancia PostgreSQL puede alojar esquemas privados con credenciales diferentes para reducir operación en el Capstone.',
['Los nodos representan ubicaciones de ejecución; los elementos interiores son artefactos desplegados.', 'El navegador solo accede a endpoints públicos HTTPS. PostgreSQL no se expone al navegador.', 'Compartir instancia es un compromiso del MVP: mantiene fallos y mantenimiento compartidos. El aislamiento lógico exige permisos, no solo nombres de esquema.', 'Supabase es una opción de alojamiento PostgreSQL y autenticación. No sustituye los cuatro microservicios de negocio.'],1450,950)
d.n('client','«device» Equipo del usuario',30,60,340,240,'boundary')
d.n('browser','«executionEnvironment»\nNavegador\n«artifact» React',70,140,260,100,'node')
d.n('host','«node» Host de aplicación',430,40,640,840,'boundary')
d.n('gateway','«executionEnvironment» Contenedor\n«artifact» Gateway',570,120,360,100,'node')
for id,label,y in [('org','Organización',290),('cert','Certificaciones',430),('imp','Impedimentos',570),('int','Integraciones',710)]:d.n(id,'«executionEnvironment» Contenedor\n«artifact» '+label,580,y,350,100,'node')
d.n('managed','«node» Plataforma administrada',1120,40,300,840,'boundary')
d.n('auth','«executionEnvironment»\nIdentidad / Auth',1150,130,240,110,'node',GRAY)
d.n('db','«executionEnvironment»\nPostgreSQL\n4 esquemas privados\n4 credenciales de servicio',1150,410,240,200,'node',GRAY)
d.n('ext','«node externo»\nJira Cloud',40,670,270,120,'node',AMBER)
d.e('browser','gateway','HTTPS');d.e('browser','auth','HTTPS Auth',[(200,140),(200,20),(1270,20),(1270,130)])
for id in ['org','cert','imp','int']:
    n=d.lookup(id);d.e('gateway',id,'REST interno',[(570,170),(500,170),(500,n['y']+50),(580,n['y']+50)])
    d.e(id,'db','SQL / TLS',[(930,n['y']+50),(1100,n['y']+50),(1100,510),(1150,510)])
d.e('int','ext','HTTPS',[(580,760),(310,760)])

d=Diagram('08 Diagrama de paquetes UML','Organización propuesta del repositorio',
'Los paquetes agrupan código y contratos. Una flecha discontinua apunta al paquete utilizado. Compartir contratos no implica compartir entidades de persistencia ni lógica de negocio.',
['Cada paquete de servicio contiene API, aplicación, dominio, infraestructura, migraciones y pruebas propias.', 'El dominio no depende de infraestructura. La infraestructura implementa interfaces definidas por el núcleo.', 'Fase 1 conserva evidencias académicas; docs incorpora arquitectura, modelo, backlog y validación.', 'El repositorio actual contiene src y documentación de Fase 1; esta estructura es una propuesta de evolución.'],1450,950)
for id,label,x,y,w,h in [('web','apps.web\nPortales y componentes React',60,80,310,110),('gw','apps.gateway\nRutas y composición',540,80,330,110),('ct','contracts\nOpenAPI y mensajes versionados',1040,80,340,110),('org','services.organizacion\napi / aplicación / dominio\ninfraestructura / migraciones',60,350,310,130),('cert','services.certificaciones\napi / aplicación / dominio\ninfraestructura / migraciones',410,350,310,130),('imp','services.impedimentos\napi / aplicación / dominio\ninfraestructura / migraciones',760,350,300,130),('int','services.integraciones\napi / aplicación / dominio\ninfraestructura / migraciones',1100,350,300,130),('infra','infrastructure\nContenedores y configuración',60,680,340,110),('tests','tests\nIntegración y extremo a extremo',530,680,380,110),('docs','docs y Fase 1\nDiseño y evidencias',1050,680,350,110)]:d.n(id,label,x,y,w,h,'package',GRAY if id in ['infra','tests','docs'] else BLUE)
d.e('web','ct','«use»',[(215,80),(215,35),(1210,35),(1210,80)],True)
d.e('gw','ct','«use»',dashed=True)
for id in ['org','cert','imp','int']:
    n=d.lookup(id);d.e(id,'ct','«use»',[(n['x']+n['w']/2,350),(n['x']+n['w']/2,260),(1210,260),(1210,190)],True)
d.e('tests','ct','«use»',[(910,735),(1430,735),(1430,135),(1380,135)],True)
d.n('rule','Dependencias internas de cada servicio\nAPI → Aplicación → Dominio ← Infraestructura\nLas migraciones pertenecen al servicio propietario.',450,830,640,85,'box',AMBER)

d=Diagram('09 Blueprint del servicio','Recorrido QA y QE con soporte operativo',
'El blueprint relaciona acciones de las personas, experiencia visible, trabajo interno y sistemas de soporte. E1 habilita el acceso; E2–E6 completan el seguimiento de certificaciones.',
['La línea de interacción separa las acciones del usuario de la interfaz. La línea de visibilidad separa la interfaz del trabajo interno.', 'La línea de interacción interna separa procesos de negocio del soporte tecnológico.', 'El responsable externo resuelve fuera del portal; el QE registra la acción y confirma su seguimiento.', 'Puntos de control: acceso denegado, datos incompletos, evidencia faltante, impedimento sin responsable y cierre no permitido.'],1650,1080)
cols=['Acceder\nE1','Organizar trabajo\nE1 y E2','Certificar\nE3','Gestionar bloqueo\nE4','Supervisar y cerrar\nE3 y E6']
rows=[('Evidencia visible',['Formulario y portal\nsegún rol','Equipo y HU\nasignadas','Checklist y\nevidencias','Ficha e historial\ndel impedimento','Resumen y\ncertificación cerrada']),('Acción de la persona',['Usuario ingresa\ncredenciales','Administrador vincula\nQE y QA; QE asigna HU','QA registra entregables\ny resultados','QA reporta; QE asigna\ny escala','QE revisa; QA solicita\ncierre según reglas']),('Interfaz visible',['Validación y mensajes\nPanel por rol','Pantallas de equipo\ny asignación','Detalle de certificación\ny carga de evidencias','Formulario y línea\nde seguimiento','Dashboard y resultado\nde validación del cierre']),('Proceso interno',['Autenticar y autorizar\nusuario activo','Validar roles, ámbito\ny vigencia de asignación','Validar cambios\ny calcular cumplimiento','Guardar responsable,\ntransición y acción QE','Validar condiciones\ny registrar cierre']),('Soporte tecnológico',['Auth + Gateway\nOrganización','Organización\nPostgreSQL privado','Certificaciones\nDatos y evidencias','Impedimentos\nHistorial persistente','Gateway + servicios\nAuditoría']),('Control y falla',['Credenciales inválidas\nAcceso denegado','QA sin supervisor\nAsignación incompatible','Evidencia pendiente\nDato no aplicable','Responsable pendiente\nFecha vencida','Fuente no disponible\nCierre rechazado'])]
for j,c in enumerate(cols): d.n('head'+str(j),c,250+j*270,35,255,80,'box',BLUE)
for i,(label,values) in enumerate(rows):
    y=140+i*140
    d.n('r'+str(i),label,20,y,215,110,'box',GRAY)
    for j,v in enumerate(values):d.n(f'b{i}{j}',v,250+j*270,y,255,110,'box',GREEN if i==3 else AMBER if i==5 else '#ffffff')
    if i in [1,2,3]:
        line=['Línea de interacción','Línea de visibilidad','Línea de interacción interna'][i-1]
        d.n('line'+str(i),line,260,y+113,1300,24,'text','#ffffff')

# Ajustes de notación y legibilidad compartidos por ambas salidas.
uc=PAGES[1];uc.w=1900
uc.lookup('idp').update(x=1660,y=190,w=180,h=110)
next(e for e in uc.edges if e['a']=='idp')['points']=[(1660,240),(1540,240),(1540,225),(410,225),(410,130),(440,130)]
next(e for e in uc.edges if e['a']=='qe' and e['b']=='team')['points']=[(170,680),(300,680),(300,715),(1200,715),(1200,670)]
PAGES[2].lookup('ad')['label']='Portal\nAdministrador'
PAGES[2].lookup('qa').update(x=690,w=105)
cl=PAGES[3]
next(e for e in cl.edges if e['a']=='hu' and e['b']=='cert')['points']=[(850,535),(690,535)]
next(e for e in cl.edges if e['a']=='u' and e['b']=='s').update(label='1 / 0..*',points=[(330,115),(410,115)])
cl.e('u','s','1 / 0..*',[(330,200),(410,200)],arrow=False)
cl.notes.append('Usuario se asocia dos veces a Supervisión: extremo superior QE supervisor y extremo inferior analista supervisado. Cada relación referencia exactamente uno de cada rol.')
PAGES[5].w=1700
PAGES[5].lookup('db').update(x=1360,w=290)
PAGES[7].w=1550
next(e for e in PAGES[7].edges if e['a']=='tests')['points']=[(720,790),(720,930),(1490,930),(1490,135),(1380,135)]
for diagram in PAGES:
    for n in diagram.nodes:
        if n['kind'] in ['actor','class','boundary','text']:continue
        width=max(12,int((n['w']-32)/8.4))
        n['label']='\n'.join('\n'.join(textwrap.wrap(line,width=width,break_long_words=False)) for line in n['label'].split('\n'))

def svg(d):
    parts=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {d.w} {d.h}" role="img" aria-label="{escape(d.title)}"><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto"><path d="M1 1 L9 5 L1 9" fill="none" stroke="#46566b"/></marker><marker id="gen" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto"><path d="M1 1 L11 6 L1 11 Z" fill="white" stroke="#46566b"/></marker></defs><rect width="100%" height="100%" fill="white"/>']
    def text(label,x,y,size=17,anchor='middle'):
        return f'<text x="{x}" y="{y}" font-family="Arial,sans-serif" font-size="{size}" text-anchor="{anchor}" fill="#172033">{escape(label)}</text>'
    def node(n):
        x,y,w,h,k=n['x'],n['y'],n['w'],n['h'],n['kind']; fill=n['fill']
        a=[]
        if k=='actor':
            cx=x+w/2;a.append(f'<g stroke="#334155" stroke-width="2" fill="none"><circle cx="{cx}" cy="{y+15}" r="12"/><path d="M{cx} {y+27}v30 m-25 -17h50 m-25 17l-20 25 m20 -25l20 25"/></g>')
        elif k in ['ellipse','initial','final']:
            a.append(f'<ellipse cx="{x+w/2}" cy="{y+h/2}" rx="{w/2}" ry="{h/2}" fill="{fill}" stroke="#46566b" stroke-width="1.5"/>')
            if k=='final':a.append(f'<circle cx="{x+w/2}" cy="{y+h/2}" r="{w/2-5}" fill="#172033"/>')
        elif k=='diamond':a.append(f'<polygon points="{x+w/2},{y} {x+w},{y+h/2} {x+w/2},{y+h} {x},{y+h/2}" fill="{fill}" stroke="#46566b"/>')
        elif k!='text':
            a.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{10 if k=="box" else 0}" fill="{fill}" stroke="#46566b" stroke-width="1.3"/>')
            if k=='package':a.append(f'<rect x="{x}" y="{y-15}" width="{w*.42}" height="15" fill="{fill}" stroke="#46566b"/>')
            if k=='class':a.append(f'<path d="M{x} {y+37}h{w}" stroke="#46566b"/>')
        elif n['id'].startswith('line'):
            a.append(f'<path d="M{x} {y+h/2}h{w}" stroke="#74849b" stroke-dasharray="5 4"/>')
        lines=n['label'].split('\n'); fs=16 if k=='class' else 17
        if k=='actor': sy=y+99
        elif k=='boundary':sy=y+25
        elif k=='class':sy=y+25
        else:sy=y+h/2-(len(lines)-1)*11+6
        for i,l in enumerate(lines):
            if k=='text':
                tw=len(l)*8.5+20;a.append(f'<rect x="{x+w/2-tw/2}" y="{sy-17}" width="{tw}" height="22" fill="white"/>')
            a.append(text(l,x+w/2,sy+(i*23 if k!='class' else 0 if i==0 else 24+i*21),fs))
        return ''.join(a)
    for n in d.nodes:
        if n['kind']=='boundary':parts.append(node(n))
    for e in d.edges:
        pts=d.route(e); s=' '.join(f'{x},{y}' for x,y in pts)
        marker='gen' if e['ends']=='generalization' else 'arrow'
        parts.append(f'<polyline points="{s}" fill="none" stroke="#46566b" stroke-width="1.5"'+(' stroke-dasharray="6 4"' if e['dashed'] else '')+(f' marker-end="url(#{marker})"' if e['arrow'] else '')+'/>')
    for n in d.nodes:
        if n['kind']!='boundary':parts.append(node(n))
    for e in d.edges:
        if not e['label']:continue
        if ' / ' in e['label'] and d==PAGES[3]:
            pts=d.route(e)
            for t,p,q in [(e['label'].split(' / ')[0],pts[0],pts[1]),(e['label'].split(' / ')[1],pts[-1],pts[-2])]:
                dx,dy=q[0]-p[0],q[1]-p[1];length=math.hypot(dx,dy);x=p[0]+dx/length*22;y=p[1]+dy/length*22-9
                parts.append(f'<rect x="{x-16}" y="{y-13}" width="32" height="18" fill="white"/>');parts.append(text(t,x,y,13))
            continue
        pts=d.route(e); a,b=pts[(len(pts)-1)//2],pts[(len(pts)-1)//2+1];x=(a[0]+b[0])/2;y=(a[1]+b[1])/2-8
        width=len(e['label'])*7.2+10
        x=max(width/2+10,min(x,d.w-width/2-10))
        parts.append(f'<rect x="{x-width/2}" y="{y-14}" width="{width}" height="19" fill="white"/>');parts.append(text(e['label'],x,y,13))
    parts.append('</svg>');return ''.join(parts)

def drawio():
    mx=ET.Element('mxfile',host='app.diagrams.net',agent='Quality360',version='24.7.17')
    for i,d in enumerate(PAGES):
        page=ET.SubElement(mx,'diagram',id=f'quality360-{i+1}',name=d.title)
        model=ET.SubElement(page,'mxGraphModel',dx=str(d.w),dy=str(d.h),grid='1',gridSize='10',page='1',pageScale='1',pageWidth=str(d.w),pageHeight=str(d.h),math='0',shadow='0')
        root=ET.SubElement(model,'root');ET.SubElement(root,'mxCell',id='0');ET.SubElement(root,'mxCell',id='1',parent='0')
        for n in d.nodes:
            k=n['kind'];shape={'actor':'shape=umlActor;','ellipse':'ellipse;','diamond':'rhombus;','initial':'ellipse;','final':'shape=doubleEllipse;','package':'shape=folder;tabWidth=100;tabHeight=15;','text':'text;strokeColor=none;','class':'rounded=0;align=left;spacingLeft=12;','node':'shape=cube;size=10;','component':'shape=component;','boundary':'rounded=0;verticalAlign=top;spacingTop=12;'}.get(k,'rounded=1;')
            style=shape+f'whiteSpace=wrap;html=0;fontFamily=Arial;fontSize=17;fillColor={n["fill"]};strokeColor=#46566b;fontColor=#172033;'
            if k=='class':style='swimlane;startSize=37;horizontal=1;whiteSpace=wrap;html=0;fontFamily=Arial;fontSize=16;fillColor='+n['fill']+';strokeColor=#46566b;'
            cell=ET.SubElement(root,'mxCell',id=n['id'],value=n['label'].split('\n')[0] if k=='class' else n['label'],style=style,vertex='1',parent='1')
            ET.SubElement(cell,'mxGeometry',x=str(n['x']),y=str(n['y']),width=str(n['w']),height=str(n['h']),attrib={'as':'geometry'})
            if k=='class':
                body=ET.SubElement(root,'mxCell',id=n['id']+'-body',value='\n'.join(n['label'].split('\n')[1:]),style='text;html=0;align=left;verticalAlign=top;spacingLeft=14;spacingTop=8;fontSize=16;whiteSpace=wrap;',vertex='1',parent=n['id'])
                ET.SubElement(body,'mxGeometry',x='0',y='37',width=str(n['w']),height=str(n['h']-37),attrib={'as':'geometry'})
        for j,e in enumerate(d.edges):
            style='edgeStyle=none;rounded=0;html=0;fontSize=13;labelBackgroundColor=#ffffff;strokeColor=#46566b;'+('dashed=1;' if e['dashed'] else '')+('endArrow=block;endFill=0;' if e['ends']=='generalization' else 'endArrow=open;' if e['arrow'] else 'endArrow=none;')
            pts=d.route(e)
            a,b=d.lookup(e['a']),d.lookup(e['b'])
            style+=f'exitX={(pts[0][0]-a["x"])/a["w"]};exitY={(pts[0][1]-a["y"])/a["h"]};entryX={(pts[-1][0]-b["x"])/b["w"]};entryY={(pts[-1][1]-b["y"])/b["h"]};exitPerimeter=0;entryPerimeter=0;'
            multi=d==PAGES[3] and ' / ' in e['label']
            cell=ET.SubElement(root,'mxCell',id=f'edge{j}',value='' if multi else e['label'],style=style,edge='1',parent='1',source=e['a'],target=e['b'])
            geom=ET.SubElement(cell,'mxGeometry',relative='1',attrib={'as':'geometry'})
            if multi:
                for mi,m in enumerate(e['label'].split(' / ')):
                    lab=ET.SubElement(root,'mxCell',id=f'mult{j}-{mi}',value=m,style='edgeLabel;html=0;align=center;verticalAlign=middle;resizable=0;fontSize=13;labelBackgroundColor=#ffffff;',vertex='1',connectable='0',parent=f'edge{j}')
                    lg=ET.SubElement(lab,'mxGeometry',x='-0.75' if mi==0 else '0.75',y='-12',relative='1',attrib={'as':'geometry'})
                    ET.SubElement(lg,'mxPoint',attrib={'as':'offset'})
            if len(pts)>2:
                ar=ET.SubElement(geom,'Array',attrib={'as':'points'})
                for x,y in pts[1:-1]:ET.SubElement(ar,'mxPoint',x=str(x),y=str(y))
    ET.indent(mx);ET.ElementTree(mx).write(OUT/'Quality360_modelos.drawio',encoding='utf-8',xml_declaration=True)

def main():
    drawio()
    nav=''.join(f'<li><a href="#d{i}">{escape(d.title)}</a></li>' for i,d in enumerate(PAGES))
    sections=[]
    for i,d in enumerate(PAGES):
        picture=svg(d);ET.fromstring(picture)
        (OUT/f'diagrama-{i+1:02}.svg').write_text(picture,encoding='utf-8')
        sections.append(f'<section id="d{i}"><p class="scope">{escape(d.scope)}</p><h2>{escape(d.title)}</h2><p>{escape(d.description)}</p><figure>{picture}<figcaption>Figura {i+1}. {escape(d.title[3:])}. Modelo propuesto de Quality360.</figcaption></figure><ul>'+''.join('<li>'+escape(n)+'</li>' for n in d.notes)+'</ul></section>')
    html='''<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quality360 Modelo funcional y arquitectura</title><style>
    *{box-sizing:border-box}body{margin:0;background:#eef2f6;color:#172033;font:17px/1.6 Arial,sans-serif}main{max-width:1500px;margin:auto;background:white;padding:55px 65px}h1{font-size:38px;line-height:1.15;color:#000}h2{font-size:27px;line-height:1.25;color:#000}.scope{font-size:14px;color:#46617c;letter-spacing:.04em}section{padding:30px 0;border-top:1px solid #d9e1eb;scroll-margin-top:20px}figure{margin:25px 0}svg{width:100%;height:auto;display:block}figcaption{font-size:14px;color:#526174;margin-top:12px}li{margin:8px 0}a{color:#185cad}nav ol{columns:2}table{border-collapse:collapse;width:100%;margin:20px 0}th,td{border:1px solid #d9d9d9;padding:12px;text-align:left}th{background:#e8f0fc}button{padding:10px 18px;border:1px solid #bcc9d9;background:white;border-radius:6px;cursor:pointer}@media(max-width:750px){main{padding:25px 18px}nav ol{columns:1}}@media print{@page{size:A3 landscape;margin:16mm}body{background:white;font-size:11pt}main{padding:0;max-width:none}section{break-before:page;border:0;padding:0}figure{break-inside:avoid}svg{max-height:210mm}button,nav{display:none}h1{font-size:28pt}h2{font-size:20pt}}
    </style><main><header><p class="scope">CAPSTONE · DISEÑO PROPUESTO · VERSIÓN 1 · 9 SEPTIEMBRE 2026</p><h1>Quality360 Modelo funcional y arquitectura</h1><p>Este documento presenta los actores, comportamientos y estructura de una plataforma para supervisar certificaciones QA. El Quality Engineer supervisa a los analistas; cada analista certifica historias de usuario y registra entregables, resultados e impedimentos. La arquitectura propuesta distribuye esas responsabilidades entre cuatro microservicios.</p><p>El prototipo existente es una aplicación React con datos locales, selección simulada de roles y checklist. Los diagramas describen su evolución objetivo, no capacidades de backend ya implementadas. La primera épica habilita autenticación, portales por rol, perfil, usuarios y supervisión; las épicas siguientes completan la operación QA.</p><button onclick="window.print()">Imprimir o guardar como PDF</button></header><h2>Alcance y decisiones</h2><p>Se contemplan tres roles activos: Administrador, QE y Analista QA, con un rol por usuario en E1. Un analista puede estar temporalmente sin supervisor y tener como máximo un QE vigente. La certificación conserva el contexto histórico de sus responsables. El acceso exige identidad válida, usuario activo y autorización sobre el recurso.</p><p>Organización y seguimiento, Certificaciones, Impedimentos e Integraciones son servicios independientes. PostgreSQL mantiene datos privados por servicio. Un gateway compone el inicio y el dashboard. Jira se incorpora mediante una integración acotada; CSV y JSON permiten trabajar con información simulada o anonimizada.</p><nav><h2>Contenido</h2><ol>'''+nav+'''</ol></nav>'''+''.join(sections)+'''<section><h2>Trazabilidad con la primera épica</h2><table><tr><th>Capacidad</th><th>Frontend</th><th>Backend</th><th>Diagramas principales</th></tr><tr><td>Inicio de sesión y permisos</td><td>E1-F01, F02, F05, F07</td><td>E1-B01, B02</td><td>Casos de uso, actividad, comunicación</td></tr><tr><td>Panel QE y equipo</td><td>E1-F03, F04</td><td>E1-B03, B04</td><td>Actores, casos de uso, clases</td></tr><tr><td>Panel QA</td><td>E1-F06</td><td>E1-B05</td><td>Casos de uso, actividad</td></tr><tr><td>Panel administrativo y usuarios</td><td>E1-F08, F09</td><td>E1-B06, B07, B08, B12</td><td>Casos de uso, clases, componentes</td></tr><tr><td>Supervisión</td><td>E1-F10</td><td>E1-B09, B12</td><td>Clases, blueprint</td></tr><tr><td>Perfil y cierre de sesión</td><td>E1-F11, F12</td><td>E1-B10, B11</td><td>Casos de uso</td></tr></table><h2>Reglas y validación del diseño</h2><p>Las pruebas deben verificar rechazo de credenciales inválidas, desactivación de usuario, acceso cruzado entre analistas y equipos, cambio de supervisor con historial, sesión expirada y errores parciales al cargar el inicio. Un contador cero representa una consulta exitosa sin resultados. Una fuente caída debe indicar indisponibilidad.</p><p>Los diagramas de actores y blueprint son modelos de contexto y servicio, respectivamente. Los restantes utilizan notación UML: elipses para casos de uso, guardas y nodos de control en actividad, clases con atributos y multiplicidades, componentes y nodos estereotipados, mensajes numerados en comunicación y dependencias en paquetes. La lectura de multiplicidades sigue el orden origen / destino indicado en cada asociación.</p><h2>Uso del archivo editable</h2><p>Abrir Quality360_modelos.drawio desde Archivo → Abrir desde → Dispositivo en diagrams.net o draw.io. Las nueve pestañas corresponden a los nueve modelos de este documento. Las figuras, textos y conectores son objetos editables; no son capturas pegadas. El HTML incorpora los diagramas y no requiere conexión para su lectura.</p><h2>Base documental</h2><ul><li>README.md: propósito, ejecución local y roles del prototipo.</li><li>src/App.jsx y package.json: implementación React, datos locales y separación actual de analistaId y qeResponsableId.</li><li>Fase 1 / Evidencias Individuales / Diario de reflexión de José Seguel: seguimiento de certificaciones y uso de datos simulados o anonimizados.</li><li>Autoevaluaciones de Fase 1: contexto académico y competencias a desarrollar.</li><li>Roadmap de implementación proporcionado: 18 semanas de definición, construcción, integración y validación.</li><li>Backlog E1 de esta conversación: doce HDU Frontend y doce HDU Backend.</li></ul></section></main></html>'''
    (OUT/'Quality360_documento_modelos.html').write_text(html,encoding='utf-8')
    tree=ET.parse(OUT/'Quality360_modelos.drawio')
    assert len(tree.findall('diagram'))==9
    for page in tree.findall('diagram'):
        cells=page.findall('.//mxCell');ids={c.get('id') for c in cells}
        assert len(ids)==len(cells)
        for cell in cells:
            if cell.get('edge'):assert cell.get('source') in ids and cell.get('target') in ids
    print('OK: nueve páginas draw.io, conectores válidos y nueve SVG embebidos en HTML.')
    print(OUT/'Quality360_documento_modelos.html');print(OUT/'Quality360_modelos.drawio')

if __name__=='__main__':main()
