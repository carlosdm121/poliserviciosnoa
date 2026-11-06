# Decisiones tomadas

Registro de por qué el proyecto es como es. Antes de cambiar algo acá, leé la
razón: varias decisiones parecen arbitrarias y no lo son.

---

## D1 — Sin verificación KYC. Solo WhatsApp

**Estado:** decidido 2026-10-09, vigente

El brief original pedía validar identidad con DNI + reconocimiento facial vía
un proveedor KYC externo. Se descartó.

**Razón, con números:**

KYC completo cuesta USD 2,50-4,50 por verificación. Con conversión del 5% al
pago (que es lo realista en un marketplace local nuevo), el costo por perfil
publicado es de **USD 25** contra un ingreso de **USD 10** (los $10.000 ARS).
Se estaría pagando 2,5× lo que paga el cliente, antes de comisión de Mercado
Pago (~4%) e IVA. El modelo no cierra.

| Escenario | Costo por lead | Costo por perfil publicado |
|---|---|---|
| KYC completo al registro, 5% conv. | USD 3,00 | USD 25 (roto) |
| KYC escalonado, 12% conv. | USD 0,75 | USD 9 (al límite) |
| Sin KYC | USD 0 | USD 0 |

**Qué lo reemplaza (todo a costo cero):**

1. `Profile.whatsappVerifiedAt` — verificación por inversión: código de 6
   caracteres que el profesional envía por WhatsApp, webhook de Meta confirma
   el remitente. Prueba que el número existe y lo controla esa persona.
2. `User.emailVerifiedAt` — enlace mágico vía Resend.
3. Mercado Pago valida la identidad del pagador al cobrar con tarjeta. Quien
   pagó ya pasó por un KYC, a costo nuestro.
4. CUIT contra el padrón de ARCA, para perfiles de empresa (módulo posterior).
5. Revisión manual del admin para los primeros perfiles de cada rubro.

**Consecuencias que hay que respetar:**

- La única insignia pública es **"WhatsApp verificado"**, nunca "identidad
  verificada".
- En los legales hay que declarar que la plataforma **no** verifica identidad,
  y que Mercado Pago sí valida al pagador. Ese matiz lo tiene que revisar un
  abogado antes de publicar.
- Si algún día se necesita KYC, es **un campo opcional** en `Profile` y un
  paso extra antes de publicar. No obliga a reescribir la máquina de estados.

**Por qué KYC escalonado se descartó también:** era mejor que KYC completo
(USD 9 por perfil) pero igual cobraría 9 contra 10 de ingreso, sin margen para
comisiones e IVA. Además el formulario con selfie de DNI en el interior es la
razón número uno de abandono en el primer paso.

---

## D2 — `ProfileCoverage` desde el día 1

**Estado:** decidido 2026-10-09, vigente

El brief original usaba `Profile.cityId` (una sola ciudad). Existe un módulo de
zonas de cobertura que pide hasta 8 ciudades.

**Se incluye la tabla desde el inicio.** Agregarla después obliga a reescribir
la consulta de búsqueda, el sitemap y los filtros de ciudad, con perfiles ya
publicados y URLs indexadas. Ahora son 4 columnas y una tabla.

`Profile.coversWholeProvince` para quien atiende toda la provincia, y
`coversOtherProvinces` (array) para atender fuera de su base.

---

## D3 — `type: PERSON | COMPANY` desde el día 1

**Estado:** decidido 2026-10-09, vigente

El brief solo habla de profesionales. Hay un módulo de perfiles de empresa.

**Se agrega `type` y los campos de empresa como nullable.** Cuestan pocas
columnas. Migrarlos después obliga a reescribir el registro, el perfil público
y el KYC, con usuarios ya dados de alta.

El CUIT se guarda en claro (el contador lo necesita) más un `cuitHash` único
para impedir dos perfiles con el mismo CUIT.

---

## D4 — `canPublishProfile()` es el único dueño de la regla

**Estado:** decidido 2026-10-09, vigente

`src/services/publicacion.ts:96` es el **único** lugar donde se decide si un
perfil puede verse públicamente. La usan la búsqueda, el sitemap, la card y el
perfil público.

Las 4 condiciones: email verificado + WhatsApp verificado + suscripción ACTIVE
+ perfil completo.

**Si alguien reimplementa la decisión en su propia consulta, aparece un perfil
vencido en los resultados** y el cliente escribe a un número que ya no atiende.
Es el bug más caro del portal y la única forma de evitarlo es que la regla tenga
un solo dueño.

Por eso `CONDICION_PERFIL_PUBLICO` (el gemelo en SQL) vive en el mismo archivo:
si cambia una y no la otra, los perfiles aparecen en la búsqueda pero no se
pueden abrir, que es la peor forma de fallar.

---

## D5 — Límites con `SELECT ... FOR UPDATE`

**Estado:** decidido 2026-10-09, vigente

Los límites (10 imágenes, 2 rubros, 4 subcategorías, 8 ciudades) se validan
**dentro de una transacción con bloqueo de fila** sobre el `Profile`.

Un límite validado sin bloqueo no es un límite: es una sugerencia cuando hay
peticiones simultáneas. Dos subidas de imagen en paralelo pasan las dos de
10 → 11.

---

## D6 — Dirección visual: Brutalist / Editorial

**Estado:** decidido 2026-10-09, vigente

**No** es la estética por defecto ni glassmorphism premium.

El público abre un perfil buscando un plomero **para hoy**, con datos móviles,
a veces al sol. Necesita jerarquía brutal y carga inmediata. El lujo no vende
acá; la inmediatez sí.

- Tipografía enorme como elemento gráfico, rompiendo el grid
- Blanco y negro con **un solo acento**: verde WhatsApp `#25D366`, reservado
  **solo** al botón de contacto
- Bordes gruesos, `border-radius: 0`, sin sombras difusas
- Controles táctiles de 44px mínimo

El verde es exclusivo del botón de WhatsApp a propósito: si aparece en otro
elemento, el usuario deja de saber dónde tocar, y ese botón es la conversión.

---

## D7 — 8 grupos, no 7

**Estado:** decidido 2026-10-09, vigente

El prompt `05-rubros-subcategorias-ciudades.md` dice 8 grupos pero enumera 7.
Además "Hogar y construcción" había quedado con 19 rubros, el doble que
cualquier otro grupo, y la mitad sin relación con obra (limpieza, jardinería,
control de plagas, tapicería, alarmas).

**Se creó "Cuidado del hogar"** con esos 5 rubros. Total: 8 grupos, 57 rubros,
240 subcategorías.

Se hace ahora y no después porque mover un rubro de grupo desplaza los perfiles
entre URLs distintas y rompe el SEO ya indexado.

---

## D8 — `"use server"` es obligatorio en cada Server Action

**Estado:** descubierto 2026-10-09, vigente

Un archivo en `src/app/actions/` **sin** la directiva `"use server"` se trata
como módulo común y Next.js lo arrastra al bundle del cliente, mandando Prisma
al navegador.

`/registro` pesaba **276 kB**. Con la directiva: **105 kB**.

La app funciona igual en ambos casos, por eso el bug es silencioso. Pero en 3G
la primera página que ve el profesional tarda el doble. Presupuesto de
performance del módulo M12: JS inicial < 150 kB.

---

## D9 — `server-only` no va en módulos que importan Server Actions

**Estado:** descubierto 2026-10-09, vigente

`import 'server-only'` rompe el build cuando el módulo es importado por una
Server Action: Next.js trata las actions como frontera de cliente aunque el
código corra en el servidor.

`src/lib/email.ts` no lleva la directiva. La protección real es que el módulo
solo se alcanza a través de una action, y las actions no se ejecutan en el
navegador.

`src/lib/peticion.ts` **sí** la lleva, porque no lo importa ninguna action.

---

## D10 — Verificación con Postgres embebido

**Estado:** decidido 2026-10-09, vigente

`npm run verificar` levanta un PostgreSQL efímero (`embedded-postgres`), aplica
el schema, corre el seed dos veces para comprobar idempotencia, y después
build y lint.

**Por qué:** la máquina de desarrollo no tenía Postgres ni Docker. Instalar
Postgres por winget tardó más de 10 minutos y falló. Un script de verificación
que cualquiera puede correr vale más que un `docker-compose` que nadie levanta.

**Ampliado 2026-10-10:** el comando ahora corre, en este orden, seed x2, tests
unitarios (Vitest), flujo de verificación de WhatsApp contra la base efímera,
build y lint. `scripts/verificar.ts` es la orquestación y
`scripts/verificar-whatsapp.ts` los casos que necesitan una base real (índices
únicos, transacciones, idempotencia).

---

## D11 — El número va en claro Y con hash. Los dos

**Estado:** decidido 2026-10-10, vigente

El prompt 1.6 pide guardar solo `whatsappHash` en el perfil. **Eso no alcanza**
y es un error del prompt: sin el número en claro no hay forma de armar el
enlace `https://wa.me/{numero}` del botón de contacto, que es la conversión del
portal. El hash sirve para consultar duplicados y lista de bloqueo sin exponer
el dato en un log, no para reemplazar al dato.

| Campo | Para qué |
|---|---|
| `Profile.whatsappE164` (único) | Armar el enlace de contacto |
| `Profile.whatsappHash` (único, nullable) | Duplicados, lista de bloqueo, logs |
| `WhatsAppVerification.phoneE164` | El número cuya titularidad se prueba |
| `WhatsAppVerification.codeHash` | El código, nunca en claro |

Son índices únicos **independientes** a propósito: si el pepper rota, los
hashes cambian y los claros no, y tenerlos separados deja ver cuál de los dos
chocó cuando el índice salta.

---

## D12 — Sin `libphonenumber-js`

**Estado:** decidido 2026-10-10, vigente

El prompt 1.6.1 pide `libphonenumber-js`. No se agregó.

**Por qué:** pesa ~100 kB contra un presupuesto de bundle de 150 kB por página
(D8), y hace una sola cosa que 60 líneas propias hacen igual. La normalización
propia vive en `src/lib/phone.ts` y valida contra la lista real de 37 códigos de
área argentinos, que es lo que hace `libphonenumber` en este caso.

**Lo que se acepta a cambio:** no se puede distinguir un fijo de 7 dígitos de un
móvil cuando comparten prefijo (`381 4123456` es un fijo y el prompt lo exige
como válido). El filtro real es que el contacto es por WhatsApp: si el número no
tiene WhatsApp, el profesional ve en pantalla que no pudo verificar.

---

## D13 — Logger y rate limiter, que M1.1 dejó pendientes

**Estado:** decidido 2026-10-10, vigente

M1.1 pedía logger con redacción y rate limiter sobre Upstash. Las dependencias
estaban instaladas y el código no existía. Se escribieron recién con M1.6, que
los necesita.

**El logger no acepta excepción.** `src/lib/logger.ts` redacta por **nombre de
campo** (`email`, `phone`, `token`, `code`, `whatsapp`, `wamid`, ...) y también
por **contenido**, con una expresión que enmascara cualquier secuencia de 8 a 16
dígitos en texto libre. No hay `console.log` sueltos en código de servidor: todo
pasa por el logger.

**El rate limiter degrada, no corta.** Si Redis no responde, avisa una vez por
log y pasa a un contador en memoria. La alternativa —rechazar la verificación
porque el rate limiter no está— deja al profesional sin poder publicar, que es
peor que un límite blando. En Vercel el contador en memoria no sirve (cada
request es una instancia distinta), pero Redis caído es la excepción, no la regla.

---

## D14 — Vitest para lógica pura, script con base embebida para flujos

**Estado:** decidido 2026-10-10, vigente

Dos niveles de test, porque prueban cosas distintas:

| Nivel | Herramienta | Qué prueba |
|---|---|---|
| Lógica pura | Vitest | Normalización, hashes, extracción de código, firma |
| Flujos | `scripts/verificar-whatsapp.ts` | Índices únicos, transacciones, idempotencia, rate limit |

El flujo no va en Vitest porque necesita una base real. Levantar Postgres
dentro de cada corrida de test es lento y frágil; el proyecto ya tenía la base
embebida andando en `npm run verificar`, así que el flujo se corre ahí y se
suma al mismo comando de confianza.

Las variables de entorno de los tests están **todas explícitas en
`vitest.config.ts`**, no leídas del `.env`. Un test que depende del `.env` de la
máquina pasa local y falla en cualquier otro lado.

**Los tests encontraron tres bugs reales** que la revisión a ojo no había visto:
normalización que aceptaba `0381 15-4123456` mal, un número ya en otro perfil que
tiraba `P2002` sin capturar (pantalla en blanco), e idempotencia que no se
registraba en el camino de éxito de la verificación. Por eso D10 incluye el
flujo y no solo el seed.

---

## D15 — `moderationStatus` es un enum, no dos booleanos

**Estado:** decidido 2026-10-10, vigente

El módulo 1.7requería `moderationStatus` (PENDING_REVIEW / APPROVED /
REJECTED / SUSPENDED). El schema tenía `isSuspended` e `isHiddenByAdmin`, que
son los mismos cuatro estados escritos como combinaciones.

**Por qué el enum y no los booleanos:** con dos booleanos, `isSuspended=true,
isHiddenByAdmin=true` es un estado que no significa nada y que nadie sabe
interpretar. Cada módulo nuevo tiene que decidir qué hacer con cada combinación,
y esa decisión se toma distinto en cada lado. Con un enum no hay combinación
imposible ni ambigua, y `evaluarPublicacion` lee una sola columna.

**Consuencia directa en la regla de publicación:** `PENDING_REVIEW` **no**
bloquea por defecto. Un portal donde cada alta queda esperando revisión y nadie
mira el panel no muestra a nadie. La bandera `requireManualApproval` (en
`SiteSetting`) es lo que lo convierte en bloqueo, y apagada es el estado inicial.

`CONDICION_PERFIL_PUBLICO` excluye `SUSPENDED` y `REJECTED` pero **no**
`PENDING_REVIEW`. Si lo excluyera, con la bandera apagada un perfil pendiente
desaparecería de las búsquedas aunque `isPublished` fuera `true`, y las dos
reglas dirían cosas distintas sobre el mismo perfil. Este test está en
`tests/publicacion.test.ts`.

---

## D16 — La lista de bloqueo guarda hashes, no identificadores

**Estado:** decidido 2026-10-10, vigente

`BlockedIdentifier` guarda el HMAC del teléfono, del email o del CUIT. Nunca el
valor.

**Por qué:** la lista cumple dos funciones —impedir un alta y tapar un número ya
usado— y **ninguna necesita recuperar el dato**. Si alguien se lleva la base no
obtiene la lista de teléfonos y emails de los bloqueados, que es exactamente la
información que un atacante busca. Con un SHA-256 simple sin pepper el hash se
puede revertir contra 10 dígitos; con el HMAC y el pepper en `.env`, no.

El servicio expone `estaBloqueado(tipo, valor)` con el valor en claro y hashea
adentro: el llamador nunca ve el hash y no puede guardarlo por error.

---

## D17 — Las señales de riesgo no bloquean, avisan

**Estado:** decidido 2026-10-10, vigente

`RiskSignal` acumula señales; no impide nada por sí sola. Ni un email
desechable, ni cinco altas desde la misma IP, ni un cambio de CUIT.

**Por qué:** el error de este tipo de sistema es bloquear por heurística. Un
email desechable es mucho más común entre aportadores sueltos que entre
profesionales legítimos. Un umbral bajo deja a gente buena fuera del portal, y un
portal con pocos profesionales listados no tiene clientes: es un problema de
negocio, no de seguridad.

Los umbrales que sí cortan son los que tienen un motivo físico detrás:
- 5 intentos de verificación con números ajenos → `LOCKED`. Nadie falla 5 veces
  por error.
- Número en la lista de bloqueo → no verifica. Es una decisión humana, con
  motivo escrito.

Se agregaron dos tipos de señal que el prompt no listaba —
`CAMBIO_DE_CUIT_TARDIO` y `CAMBIO_DE_IP_POSTERIOR_AL_ALTA` — porque los dos
patrones que aparecen cuando alguien quiere pasar una revisión sin ser quien
dice ser. Usar un tipo existente para eso habría significado mentirle al
administrador sobre qué encontró.

---

## D18 — La provincia no se guarda en el perfil

**Estado:** decidido 2026-10-10, vigente

El formulario pide provincia y luego ciudad. En la base solo está
`Profile.baseCityId`: **la provincia se deriva de la ciudad**.

**Por qué:** guardar las dos es guardar una redundancia que puede desincronizarse.
Un perfil puede quedar declarándose en Tucumán con la ciudad de Salta, y aparecen
en dos búsquedas contradictorias. Derivándolo no hay estado imposible: si la
ciudad es de Salta, es de Salta.

El formulario mantiene el selector de provincia porque al usuario le sirve
filtrar, y al cambiar de provincia limpia la ciudad. El servidor revalida que la
ciudad pertenezca a la provincia declarada, que es la única forma de que el
formulario y la base puedan discrepar sin que la base gane.

---

## D19 — Un solo botón de guardar en el panel de perfil

**Estado:** decidido 2026-10-10, vigente

El módulo 1.8 especulaba con guardado parcial por sección. No se hizo: un solo
guardar.

**Por qué:** con guardado parcial hay estados intermedios donde el perfil está a
medio hacer. `evaluarPublicacion` no lo publica en ese estado, así que el
profesional guarda tres cosas separadas y sigue sin aparecer, sin entender por
qué. La única forma de que el panel sea honesto es que una acción = el perfil
completo queda guardado o no quedó.

---

## D20 — `FOR UPDATE` bloquea la fila antes de contar

**Estado:** decidido 2026-10-10, vigente

Los límites de 1.8 se validan dentro de una transacción que empieza con
`SELECT id FROM "Profile" WHERE id = $1 FOR UPDATE`.

**Por qué el orden importa:** si la transacción validara sin bloquear primero,
el bloqueo no sirve de nada — entre la validación y la escritura entra otra
petición. El `FOR UPDATE` tiene que ir **antes** del `count`, no después.

Sin esto, dos peticiones que agregan un rubro distinto al mismo perfil leen 1
rubro cada una, las dos pasan el límite de 2 y quedan 3. Es la misma razón que
D5, pero acá el límite se lleva por comparación de longitud de un conjunto, no
por un contador: el bloqueo evita que las dos transacciones vean el mismo
snapshot.

---

## D21 — La imagen se sube firmado y la carpeta la pone el servidor

**Estado:** decidido 2026-10-10, vigente

La subida va **del navegador directo a Cloudinary**, no a través del servidor.
La razón es de ancho de banda y de percepción: mandar 4 MB a la app y volver
a bajarlos es el doble de transferencia, y en una conexión del interior la
diferencia es entre subir la foto y abandonar el formulario.

Eso obliga a que el navegador tenga una credencial, y acá está la decisión que
no es obvia: **la credencial es una firma, no la API key**.

| | API key en el cliente | Firma por subida |
|---|---|---|
| Quién elige la carpeta | cualquiera | el servidor |
| Sirve para otra cuenta | sí | no |
| Vencer | nunca | 1 hora |

La carpeta se deriva del `profileId` en el servidor. El navegador no puede
elegirla, y una firma de una carpeta no sirve para otra. Por eso el `publicId`
que vuelve no alcanza como prueba: el servicio **vuelve a preguntar a la API de
Cloudinary** si el recurso existe y de qué carpeta es
(`src/services/galeria.ts:verificarRecurso`).

**Por qué no confiar en el `publicId` que manda el cliente:** los archivos de
Cloudinary son públicos. Sin la verificación, cualquiera puede leer un
`publicId` de la galería ajena —salen en el HTML del perfil público— y
mandarlo en su propio registro. No hace falta acceso a la cuenta de nadie.

La transformación (`c_limit,w_1600,q_auto,f_auto`) va **dentro de la firma** y
no en el preset. Si el cliente pudiera elegirla, podría subir sin transformar y
saltarse el recorte que es lo que hace que la galería cargue rápido con datos.

### El URL nunca es el del cliente

`Image.url` se guarda con lo que devuelve la API, nunca con lo que manda el
navegador. Un `url` arbitrario guardado en la base se sirve después desde
nuestro propio dominio en el perfil público.

### Los mensajes de error no distinguen "no existe" de "es de otro"

Los dos casos devuelven *"No encontramos esa imagen"*. Distinguirlos convierte
el error en un oráculo que confirma que la foto ajena existe.

---

## D22 — Una imagen oculta no cuenta para publicar

**Estado:** decidido 2026-10-10, vigente

`evaluarPublicacion` exige al menos una imagen. La pregunta es si cuenta una
oculta por el administrador, y **no cuenta**.

**Por qué:** la regla de publicación responde "¿ve algo el cliente?", no "¿hay
registros?". Un perfil con tres fotos y las tres ocultas se ve exactamente igual
que uno sin fotos: sin confianza visual, que es justo lo que la regla quiere
garantizar. Contarlas habilitaría la moderación como forma de publicar
imágenes que la plataforma sabe que no quiere mostrar.

El `Image` gana `isHidden`, `hiddenReason`, `hiddenAt` y `hiddenBy`:

- **Ocultar no borra.** Es reversible, y una moderación equivocada no puede
  dejar al profesional sin poder defenderse. Una foto que parecía ajena puede
  ser un trabajo del cliente que tenía permiso para mostrar.
- **`hiddenReason` es obligatorio.** Sin motivo escrito, un ocultado es
  indistinguible de un error de carga —mismo criterio que `BlockedIdentifier`
  (D16) y que `Profile.moderationReason` (D15).

---

## D23 — El mock de Cloudinary se elige con `CLOUDINARY_REAL=1`

**Estado:** decidido 2026-10-10, vigente

`lib/whatsapp` elige el mock probando si el token "parece real"
(`startsWith('EAA')`). Para Cloudinary eso no sirve: no hay prefijo reconocible,
y un `.env` copiado de otra máquina con credenciales válidas de otra cuenta hace
que cada prueba de desarrollo suba archivos de verdad y consuma ancho de banda
del plan pago.

**Por qué no un `startsWith` acá:** el problema no es distinguir el formato del
secreto, es que la decisión sea explícita y no inferida. Fuera de producción se
usa el mock **salvo que se pida lo contrario con `CLOUDINARY_REAL=1`**. Nadie
descubre por accidente que sus tests de desarrollo le cobran la factura a otro.

El mock guarda los recursos en un `Map` sobre `globalThis`, por el mismo motivo
que el de WhatsApp: la subida y la consulta son requests distintos y en un
entorno serverless cada uno es una instancia distinta. Sin el global, el
servicio vería que la foto nunca se subió y la galería entera fallaría en
desarrollo.

---

## D24 - El precio vive en la base, nunca en el código

**Estado:** decidido 2026-10-15, vigente

El monto de la suscripción se lee de `Plan.amount` con `getCurrentPlan()` y se
formatea con `formatArs()` de `lib/dinero.ts`. No hay un solo monto escrito en
`src/`, y `tests/reglas-proyecto.test.ts` falla el build si aparece uno.

**Por qué una regla y no una convención:** el precio va a aparecer en cuatro
lugares —la pantalla de suscripción, el checkout, los emails de cobro y los
textos legales— y los precios cambian. Un `$10.000` escrito en un componente
queda viejo sin que nadie se entere hasta que un cliente reclama que se le cobró
otra cosa. La convención "no hardcodear" dura hasta la primera urgencia; el test
que falla el build no.

**El formato lo decide un solo archivo.** `Intl` con `es-AR` pone el punto de
miles y la coma decimal bien, pero mete un espacio duro entre el `$` y el
número: devuelve `"$ 10.000"`. Acá se escribe `$10.000`, así que `formatArs`
quita ese espacio. Lo hace explícito porque el bug es invisible en el editor y
aparecería en todas las pantallas y todos los emails a la vez.

**Sin precio de respaldo.** Si no hay plan, o el monto está roto, o la base
falla, `getCurrentPlan()` devuelve `null` y la pantalla lo dice. La alternativa
—un monto de emergencia escrito en el código— es peor que bloquear la compra un
segundo: bloquear molesta, cobrar una cifra que nadie prometió no se puede
deshacer. Es el mismo criterio que `exigeAprobacionManual` en
`src/services/ajustes.ts`: ante un fallo se asume lo que **no** causa daño, y
nunca se inventa un dato.

**La caché es de 15 segundos y hay que vaciarla al cambiar el precio.** Existe
para no abrir una consulta a la base en cada visita al panel, no para
optimizar: un precio cambia una vez cada varios meses. `limpiarCachePlan()` la
vacía, y el panel de administración tiene que llamarla después de cambiar el
monto para que el cambio se vea en la pantalla siguiente y no quince segundos
después.

**`vigenteDesde` en el futuro significa "programado", no vigente.** Un plan con
la fecha adelante no se vende: un cliente pagaría un precio que todavía no
anunciamos. Si hay dos planes vigentes a la vez se usa el más reciente y se avisa
por log, en vez de devolver `null` —que dejaría al portal sin poder cobrar— o el
primero que devuelva el índice, que haría que el precio cambie con el humor.

**`Decimal(10,2)` y no centavos enteros.** El prompt del módulo dejaba elegir
una de las dos. Con centavos, `$10.000` son `1000000` en la base, y un
`amount / 100` olvidado en la fila equivocada es un precio 100 veces más
caro. Con `Decimal` el número que se ve es el número que se guarda.

---

## D25 — Los datos fiscales van en una tabla aparte y no son verificación de identidad

**Estado:** decidido 2026-10-16, vigente

El módulo 2.3 pide nombre o razón social, CUIT/CUIL/DNI, condición frente al IVA
y domicilio fiscal antes del primer pago. D1 había descartado el KYC y con él
los datos de identidad, así que esto necesita una explicación o parece una
contradicción.

**No es lo mismo.** D1 descartó *usar la identidad como señal de confianza para
publicar*: no se pide documento para que el perfil aparezca. Lo del 2.3 es otra
cosa —son los datos que necesita un comprobante, que no los pedimos para
confiar sino para facturar—. Un profesional que factura sin sus datos fiscales
es un profesional a quien no le podemos emitir nada, y un comprobante mal emitido
se paga con multas.

**Consecuencias que hay que respetar:**

1. La única insignia pública sigue siendo **"WhatsApp verificado"**. Nada de esto
   se muestra en el perfil, ni en la card, ni en los resultados de búsqueda.
2. Los datos no se usan para moderar, para puntuar ni para decidir si alguien
   publica. `evaluarPublicacion` no los mira.
3. El documento va en claro —el contador y la facturación lo necesitan— más un
   `documentoHash` único que impide que dos perfiles facturen como la misma
   persona, igual que `Profile.cuitHash` pero por una razón distinta.

**Por qué una tabla `FiscalData` y no columnas en `Profile`.** Prisma trae todas
las columnas escalares en un `findUnique` sin `select`. `Profile` se lee en cada
card de búsqueda, en cada resultado y en cada visita al perfil público: con los
datos fiscales como columnas, el DNI de todos los profesionales del portal
viajaría en cada búsqueda del sitio sin que nadie lo pidiera. Como relación 1:1,
solo lo traen las dos consultas que lo necesitan —el formulario y el chequeo de
requisitos—.

**El validador del CUIT propio, y por qué.** `lib/cuit.ts` valida CUIT de
**empresa**: exige 33 o 34, y rechaza el 30 a propósito porque en el perfil de
empresa no tiene sentido. Acá hace falta el CUIT de una persona humana también, y
el de monotributo es el caso más común del país. Se reusa `digitoVerificador` —el
algoritmo— y se escribe la política aparte. Si en algún momento los dos casos
crecen hasta coincidir, se unifican; hoy unificarlos sería rechazar a la mitad
de los profesionales.

---

## D26 — Una sola fila de suscripción por perfil: reintentar reabre, no duplica

**Estado:** decidido 2026-10-16, vigente

`Subscription.profileId` es `@unique`. Hay **una** suscripción por perfil para
siempre, y los `Payment` cuelgan de esa fila.

**Por qué no se crea una fila nueva en cada reintento.** Un intento de alta que
se abandona a la mitad deja preapprovals en Mercado Pago y, si creáramos filas,
cada reintento tiraría el historial de pagos del intento anterior. Ese historial
es justo lo que el profesional necesita para reclamar si algo se cobró dos
veces. Con `upsert` sobre la misma fila, el historial se conserva siempre.

**Por qué `PENDING` no bloquea el alta.** `ACTIVE` sí, y no es negociable: dos
cobros recurrentes sobre el mismo perfil es el peor error posible acá, porque el
profesional paga una sola vez y el portal le muestra dos perfiles o le descuenta
doble sin que nada avise. `PENDING` es distinto —es un intento a medias, se
cerró la pestaña en el checkout o la tarjeta no pasó—, y bloquearlo deja al
profesional trabado en una pantalla que no lo deja seguir ni cancelar. Lo que se
hace es **reabrir el mismo intento**: se crea un preapproval nuevo sobre la misma
fila y se cancela el anterior.

**El orden de la llamada a la API y el riesgo real.** La llamada a Mercado Pago va
**antes** de la escritura, porque una llamada de red dentro de una transacción con
bloqueo de fila mantiene bloqueado al perfil mientras la red tarda. Al revés
—escribir primero, llamar después— el huérfano sería una fila en nuestra base,
que se puede limpiar; así el huérfano es un preapproval en Mercado Pago, que se
cierra con una llamada best-effort. Un huérfano en nuestro lado se repara solo; uno
en el del otro no, y por eso está el `id` en el log.

**El bug que casi se cuela, y por qué está comentado en el servicio.** Siete
clics simultáneos sobre "Suscribirme" crean los siete preapprovals (la llamada
está fuera de la transacción) y los siete leen `mpPreapprovalId` en `null` antes
de que ninguno escriba. Los siete pasan, los siete escriben y el último gana la
fila: **los otros seis quedan cobrando y nadie los tiene registrados**. Por eso
el preapproval anterior se lee **adentro** de la transacción, con la fila
bloqueada, y se cancela después del commit. `scripts/verificar-suscripcion.ts`
mide precisamente eso: no "cuántos checkouts se abrieron" sino "cuántos cobros
recurrentes quedan abiertos".

---

## D27 — El mock de Mercado Pago se elige con `MP_REAL=1`

**Estado:** decidido 2026-10-16, vigente

Misma regla que D23 (Cloudinary) y la misma razón: **fuera de producción se usa el
mock, salvo que se pida explícitamente lo contrario con `MP_REAL=1`.**

Acá el riesgo es más caro que en los otros dos proveedores. Un `.env` copiado de
otra máquina con un `MP_ACCESS_TOKEN` real haría que cada desarrollo y cada
corrida de `npm run verificar` **abran checkouts de verdad en la pasarela** y, con
una cuenta real, cobren plata real. No hay forma de "simular un pago" que no
termine en un cargo: el mock tiene que ser el proveedor por defecto en
desarrollo, no una alternativa.

**El mock no activa la suscripción.** `autorizarPreapprovalMock()` solo cambia el
estado del preapproval a `authorized`, igual que haría el pagador en el navegador.
Pasar la suscripción a `ACTIVE` es del webhook del 2.4 consultando la API. Si el
mock activara la suscripción, el desarrollo probaría un camino que en producción no
existe y el bug se descubriría el primer día de cobro real.

**El proveedor se elige por llamada, no al importar.** `getProveedor()` decide en
cada llamada en vez de crear un singleton al importar, porque los tests cambian
`NODE_ENV` y `MP_REAL` entre corridas y un proveedor congelado en el primer import
se queda con el valor de esa corrida.

---

## D28 — El webhook consulta la API y no confía en el body

**Estado:** decidido 2026-10-23, vigente

La ruta `/api/webhooks/mercadopago` valida la firma `x-signature` de Mercado Pago
(HMAC-SHA256 sobre `id:{data.id};request-id:{x-request-id};ts:{ts};`) y después
delega en `services/webhook-mercadopago.ts`. El body solo dice **qué recurso
cambió**; el estado que se guarda sale de `GET /v1/payments/{id}`,
`GET /authorized_payments/{id}` o `GET /preapproval/{id}` con el access token del
servidor.

**Por qué no alcanza con la firma.** La firma cubre el id, el `request-id` y el
timestamp, no el estado. Aunque la notificación sea auténtica, el estado puede
venir desactualizado o directamente no venir. Si se confiara en el body, un
atacante que descubra la URL podría mandar un `payment` con id inventado y
activar una suscripción sin pagar. Consultar la API convierte el webhook en un
disparador, no en una fuente de verdad.

**Idempotencia por recurso y estado.** `WebhookEvent.id` es
`mp:{tipo}:{recursoId}:{estado}`. El `INSERT` con id único es la reserva: dos
webhooks simultáneos no pueden pasar los dos, y el segundo se responde como
`duplicado`. El estado entra en la clave porque un mismo pago pasa de `pending` a
`approved` y esos son dos eventos legítimos. Si una ejecución anterior dejó
`error`, un reintento de Mercado Pago puede volver a tomarla; una fila con error
que bloqueara para siempre convertiría un corte de red en un pago perdido.

**El webhook nunca crea una suscripción.** Busca por `mpPreapprovalId`,
`externalReference` (el `profileId` del checkout) o el pago ya guardado. Si no
encuentra ninguna, ignora y registra. Crear una suscripción desde una
notificación externa sería dejar que Mercado Pago decida quién aparece en el
portal.

**Gracia una sola vez.** Un rechazo de renovación pasa la suscripción a
`PAST_DUE` y calcula `graceUntil = ahora + PAYMENT_GRACE_DAYS`; un segundo
rechazo no la extiende. Un primer pago rechazado deja la suscripción en
`PENDING` y **sin** gracia: nunca estuvo al día, y publicar durante la gracia
sería regalar el mes. `evaluarPublicacion` solo respeta la gracia si hay
`currentPeriodEnd` pagado y `graceUntil` futuro.

**Cancelar el preapproval no despublica.** Marca `cancelAtPeriodEnd` y
`cancelledAt`, pero el estado sigue `ACTIVE` hasta que termine el período pago.
Adelantarlo despublicaría a alguien que todavía tiene un mes por delante.

**Efectos que no pueden tumbar el webhook.** `sincronizarPublicacion` y el email
de pago aprobado se ejecutan después de la transacción y sus fallos se registran,
no se propagan. El pago y la suscripción ya están guardados; devolver 500 haría
que Mercado Pago reintentara un pago ya procesado. El email tiene candado en
`EmailLog` con clave `pago:{id}`; si el envío falla, se borra la fila para que el
reintento lo pueda mandar.

---

## D29 - Facturación: Afip SDK, mock por defecto y PDF propio

**Estado:** decidido 2026-10-27, vigente

La emisión va contra [Afip SDK](https://docs.afipsdk.com/) (`/afip/auth` para el
token de acceso y `/afip/requests` para `FECAESolicitar`), porque evita
implementar a mano el WSAA, el TA y la firma CMS. El SDK renueva el ticket solo;
nosotros solo guardamos CUIT, punto de venta y tipo de comprobante.

**El proveedor se elige por llamada**, igual que Mercado Pago (D27):
`getProveedorFacturacion()` lee `NODE_ENV` y `ARCA_REAL` cada vez. Fuera de
producción se usa `facturacionMock`, que valida secuencia y respeta idempotencia;
en producción se usa el SDK aunque falte `ARCA_REAL`. **El mock nunca corre en
producción**, ni siquiera si alguien se olvida de la bandera: en ese caso el
proveedor real falla con `SIN_CREDENCIAL` (no reintentable) antes que emitir un
comprobante falso. El mock no sabe que está en producción; la decisión vive en
`getProveedorFacturacion`.

**El PDF se genera en el proyecto** (`src/lib/arca/pdf.ts`): PDF 1.4 armado a
mano, Helvetica, WinAnsiEncoding, sin `pdfkit` ni Puppeteer. Son ~190 líneas
contra una dependencia de varios MB y un Chromium en el servidor. El archivo no
se guarda: `Invoice.pdfUrl` apunta a `/api/facturas/{id}/pdf`, que lo arma desde
la fila congelada. Una factura de marzo imprime el precio de marzo aunque el plan
ya valga otra cosa.

**La factura no se borra, se anula.** `CreditNote` es un modelo aparte con
`invoiceId @unique`: un reembolso emite la NC del mismo tipo y por el mismo
importe, y marca `Invoice.VOIDED`. Si Mercado Pago manda dos veces el evento, el
índice único frena la segunda nota. Borrar o editar una factura emitida no es
una opción: ARCA ya tiene el CAE.

---

## D30 - La factura se encola; el webhook no espera a ARCA

**Estado:** decidido 2026-10-27, vigente

El webhook de Mercado Pago llama a `encolarFacturaSeguro` **después** de guardar
el pago y la suscripción. Esa función nunca tira: si ARCA está caído, el pago
igual queda registrado y la factura queda en `Invoice` con `status = FAILED`,
`attempts`, `nextAttemptAt` y `lastError`.

**Por qué no emitir dentro del webhook.** ARCA es un servicio externo lento y con
ventanas de mantenimiento. Un timeout ahí convertiría una notificación válida en
un 500, Mercado Pago reintentaría y el profesional vería el pago como fallido
aunque se cobró. La cola desacopla las dos cosas.

**Reintento con backoff y techo.** `esperaBackoff` va de 1 minuto a 24 horas
(1m, 5m, 15m, 1h, 6h, 24h) y se corta en `ARCA_MAX_ATTEMPTS` (10 por defecto). El
cron `/api/cron/facturacion` toma hasta 3 pendientes por corrida (cada una puede
tardar 15 s y la función corta a los 60 s), protegido con `CRON_SECRET`
comparado en tiempo constante. El admin puede forzar un reintento
desde `/admin/facturacion`, pero no puede saltarse el techo sin tocar la fila.

**El número se reserva antes de llamar a ARCA.** Dos pagos simultáneos no pueden
pedir el mismo número: la reserva es un `updateMany` condicional sobre
`ultimoNumero` y el que pierde recalcula. Si ARCA responde "ya existe" para ese
número, la factura se recupera pidiendo el CAE en vez de emitir de nuevo. Un
número quemado por un fallo no se reutiliza: la secuencia de ARCA no perdona.

**La nota de crédito tiene su propia secuencia.** `ultimoNumero(tipo, puntoVenta,
notaCredito)` devuelve el contador de facturas o el de NC según corresponda. La
primera NC de un punto de venta es la número 1, no la que sigue a la última
factura.

**El cron es diario, no cada minuto.** `vercel.json` lo programa a las 09:00 UTC
(06:00 ART). Un pago de la noche se factura a la mañana siguiente; el
profesional ve "Comprobante en proceso" en el panel. Si el volumen lo justifica,
se cambia a un plan con cron por hora, pero no antes: no hay urgencia fiscal
dentro del día.

---

## D31 - El arrepentimiento reembolsa antes de dar de baja, y deja constancia

**Estado:** decidido 2026-10-27, vigente

El botón de arrepentimiento (art. 34, Ley 24.240) devuelve el dinero y da de baja
en la misma operación. `DIAS_ARREPENTIMIENTO = 10` se cuentan en horas exactas
(240 h) desde `Payment.createdAt` del último pago aprobado, no desde el alta ni
desde el fin del período: lo que se devuelve es el último cobro. Una fecha de pago
en el futuro se rechaza —un reloj adelantado no puede abrir la ventana—.

**El trámite se crea PENDIENTE antes de llamar a Mercado Pago.** Si el reembolso
falla, queda la fila `FALLIDA` con el motivo, y no se toca la suscripción. Si se
reembolsara primero y fallara la escritura, el profesional tendría la plata
devuelta y el perfil publicado. La transacción final (pago `REFUNDED`, suscripción
`CANCELLED`, trámite `COMPLETADA` con `effectiveAt`) es la que define el estado; el
email, la nota de crédito y el despublicado van después y no pueden tumbarla.

**Un pago ya devuelto no se vuelve a devolver.** `evaluarArrepentimiento` bloquea
pagos con `refundedAt`, `REFUNDED` o `CHARGED_BACK`. El segundo intento devuelve
el motivo de la constancia existente, no un error nuevo. Sin ese control, el botón
sería una máquina de reembolsos repetidos.

**La constancia es un modelo, no un email.** `CancellationRequest` guarda tipo,
motivo, `tramiteNumber` único, pago devuelto y fechas. El profesional la puede
volver a consultar en `/arrepentimiento` y en `/baja`; un mail se pierde, una fila
no.

---

## D32 - `EXPIRED` es el final de la suscripción, por la vía que sea

**Estado:** decidido 2026-10-27, vigente

La baja voluntaria **no** pasa la suscripción a `CANCELLED` en el acto: marca
`cancelAtPeriodEnd` y deja `ACTIVE` hasta `currentPeriodEnd`, porque el mes ya
está pago (D28). El cron, al vencer, la pasa a `EXPIRED`.

La renovación rechazada también termina en `EXPIRED`: primero `PAST_DUE` con
`graceUntil`, y cuando la gracia vence, `EXPIRED`. No se usa `CANCELLED` para
ninguno de los dos casos porque `CANCELLED` describe una decisión del profesional
y estos son vencimientos. Lo que importa para publicar es el estado final, no la
causa: `evaluarPublicacion` ya no ve una suscripción vigente.

**El cron no pisa un estado que ya cambió.** El `updateMany` lleva el estado
anterior en el `where`; si dos corridas se solapan, una sola actualiza y la otra
no encuentra filas. Esa es la barrera de idempotencia, además de `EmailLog`.

**El webhook no resucita una suscripción terminada.** Si el estado es `CANCELLED`
o `EXPIRED` y el pago no está aprobado, el webhook retorna antes de la rama de
renovación rechazada. Sin ese guard, el webhook del reembolso del arrepentimiento
podía dejar el perfil en `PAST_DUE` y volver a publicarlo después de la baja.

---

## D33 - Los avisos de vencimiento usan ventanas, no días exactos

**Estado:** decidido 2026-10-27, vigente

El cron corre una vez al día a las 09:00 ART (12:00 UTC), y Vercel no garantiza
que sea a la misma hora exacta. Si el aviso de "5 días" se disparara solo cuando
faltan exactamente 5, un corrimiento de minutos lo saltearía para siempre.

Por eso `avisoPara(dias)` devuelve `5d` con 3 a 5 días y `2d` con 1 a 2. Cada
aviso tiene su `dedupeKey` (`suscripcionId:fechaDeVencimiento:aviso`), así que la
ventana amplia no duplica: el primero que entra reserva el `EmailLog` y los
siguientes no mandan nada. Un perfil que ya venció (0 o negativo) no recibe aviso;
recibe el mail de despublicado.

**La reserva usa `createMany({ skipDuplicates: true })`.** El `create` con catch
del P2002 funciona, pero Prisma escribe el error en el log antes de devolverlo:
el cron diario quedaría lleno de "unique constraint failed" que no son fallas. El
`ON CONFLICT DO NOTHING` no genera error y el resultado sigue siendo el mismo:
`null` significa "ya estaba enviado".

---

## D34 - El libro de quejas es un formulario propio, con rate limit y honeypot

**Estado:** decidido 2026-10-27, vigente

`Complaint` es una tabla aparte de `CancellationRequest`: una queja no siempre
termina en baja y una baja no siempre es una queja. Mezclarlas obligaría a que
cada consulta filtre por tipo y a perder el `reference` (el trámite o el pago al
que se refiere).

**Límite de 5 por email por hora** y respuesta `RATE_LIMIT`. El formulario es
público y sin sesión: sin límite, cualquiera llena la base y el correo de
contacto con basura. El límite es por email y no por IP porque la IP se comparte
y el email identifica al que insiste.

**Honeypot `sitioWeb`.** Un campo oculto que una persona no ve y un bot completa.
Si viene con valor, se responde OK sin guardar: decirle al bot que falló le enseña
a corregirlo. No reemplaza al rate limit, lo complementa.

**La notificación no puede perder la queja.** Se guarda primero y se manda el
email después; si el email falla, se loguea y la respuesta sigue siendo OK. La
fila es la fuente de verdad y el admin la ve en la base; un SMTP caído no puede
hacer que el reclamo desaparezca.

---

## D35 - El clic anónimo cuenta, la intención no

**Estado:** decidido 2026-10-27, vigente

`GET /api/contacto/[slug]` redirige a WhatsApp y suma `whatsappClicks` y
`ProfileDailyStat` aunque no haya sesión. Lo que no hace es inventar una
identidad: sin CLIENT logueado no se crea `ContactIntent`, no se guarda IP ni
visitante, y `contactsCount` no cambia. El clic es un hecho del perfil; la
intención es un vínculo entre dos usuarios y necesita los dos lados.

**La IP solo vive en memoria para el rate limit.** Se usa hasheada como clave
(30 clics por minuto) y no se persiste. Guardar la IP para “analítica” habría
convertido una estadística agregada en un registro de quién miró a quién.

**Los bots reciben la redirección pero no suman.** Los previews de WhatsApp y
los buscadores golpean la ruta sin que haya una persona del otro lado; contarlos
inflaría el número que el profesional usa para decidir si paga. La detección es
por user-agent (`src/lib/bots.ts`), no por comportamiento: es barata y suficiente
para los casos conocidos. La redirección se mantiene para no romper previews.

**La ventana de 24 h se protege con un lock, no con un `findFirst`.** Dos clics
simultáneos del mismo cliente podrían pasar los dos la lectura y crear dos
intenciones. El advisory lock por `cliente:perfil` serializa el chequeo y la
escritura; el índice de `(clientId, profileId, createdAt)` queda como respaldo
para las consultas.

**La estadística diaria usa el día UTC.** Es una limitación conocida: un clic a
las 21:30 ART cae en el día siguiente. Se acepta porque la tabla es para tendencia
y no para liquidar nada; cambiar a día argentino obligaría a una zona horaria
explícita en cada consulta y no cambia ninguna decisión del negocio.

---

## D36 - Votar exige haber contactado, no solo estar logueado

**Estado:** decidido 2026-10-27, vigente

El corazón de confianza vale solo si el cliente tuvo contacto real con el
profesional. `alternarVoto` exige un `ContactIntent` de al menos
`VOTE_MIN_HOURS_AFTER_CONTACT` horas (24 por defecto), perfil publicado y que el
cliente no sea el dueño. No alcanza con tener sesión ni con haber visto el
perfil: eso convertiría el ranking en un concurso de cuentas.

**La elegibilidad se recalcula en el servidor en cada llamada.** La UI muestra
el estado, pero el servidor vuelve a leer el rol, el contacto y la publicación;
un botón habilitado en el cliente no otorga permiso. El rol también se relee de
la base y no se confía en el token, que puede haber quedado viejo.

**El contador y el voto cambian en la misma transacción.** El índice único
`(profileId, clientId)` evita el voto duplicado, y un advisory lock por
`perfil:cliente` serializa el toggle. `heartsCount` se ajusta con el mismo
`tx`; nunca se recalcula al leer ni se actualiza en un segundo paso. Si la
transacción falla, no queda ni voto sin contador ni contador sin voto.

**El toggle es idempotente por estado, no por llamada.** Repetir un “votar”
sobre un voto existente no suma dos veces: el estado final es el que manda. Un
P2002 en la creación se interpreta como “ya estaba votado”, no como error.

**Las señales de fraude no bloquean el voto.** Muchos votos del mismo cliente
(10 en una hora) o tres votos desde dominios desechables en siete días generan
`RiskSignal` para que el admin mire; no rechazan la acción. Bloquear automático
por una heurística castigaría casos legítimos y dejaría al cliente sin forma de
reclamar. La señal es evidencia, no sentencia.

**La anulación administrativa deja rastro.** `anularVoto` borra el voto, corrige
`heartsCount` y escribe `AuditLog` (`ANULAR_VOTO`, entidad `ProfileVote`) en la
misma operación. Un contador que baja sin explicación es imposible de auditar.

---

## D37 - Un usuario creado por Google nace CLIENT

**Estado:** decidido 2026-10-27, vigente

El adaptador de NextAuth creaba usuarios con el rol por defecto `PROFESSIONAL`.
Para un profesional que se registra por el flujo propio está bien, pero Google
es la vía natural del cliente: sin este cambio, todo cliente que entraba con
Google quedaba como profesional, no podía votar y veía el panel equivocado.

El adaptador ahora fuerza `role: 'CLIENT'` en `createUser`. El alta profesional
sigue creando el usuario por su propio camino y fija el rol explícitamente; no
depende del default. Los roles existentes no se migran: el cambio aplica a las
cuentas nuevas.

**Queda pendiente el login por email para clientes.** No hay magic link todavía;
hoy el cliente entra con Google. Es una brecha del módulo 1.5, no de 3.1, y los
scripts de verificación crean CLIENT directo por Prisma para no depender de un
proveedor externo.

**`profileViews` pasó a llamarse `viewsCount`.** Estaba sin uso y la spec de la
semana 3 pide ese nombre. No hay migración de datos porque la columna nunca se
escribió; el cambio es solo de esquema y tipos.

---

## D38 - El perfil público no muestra `viewsCount` ni publica teléfono ni rating

**Estado:** decidido 2026-10-28, vigente

El módulo 3.4 (perfil público `/p/[slug]`) elige qué se muestra y qué no:

- **No se muestra `viewsCount` públicamente.** El contador existe para que el profesional vea su propio tráfico en el panel, no como métrica de confianza para el cliente. Un número público se presionaría a inflarlo y no agrega información útil a quien busca un plomero.
- **El JSON-LD es `LocalBusiness` sin `telephone`.** El número de WhatsApp nunca viaja en el HTML del perfil; el botón apunta a `/api/contacto/[slug]`, que devuelve el mensaje prellenado tras validar la publicación del perfil.
- **No hay `aggregateRating`.** Los corazones son votos de confianza, no una puntuación de 1 a 5, y publicar una estrella inventada es engañoso.

El número de visitas se registra con `registrarVista` (`src/services/vistas.ts`): suma `viewsCount` y `ProfileDailyStat` en una transacción, no cuenta al dueño, no cuenta con `contar: false`, y se dedupé con `rateLimit("vista:ip:{hash}:{slug}", 1, 1800)` antes de tocar la base. No se guarda IP ni ningún dato del visitante.

---

## D39 - Las rutas de provincia se resuelven con un catch-all opcional

**Estado:** decidido 2026-10-28, vigente

Next.js no permite que `[rubro]` y `[ciudad]` vivan como segmentos hermanos con nombres distintos bajo un mismo padre (`[provincia]`): el build falla con `"You cannot use different slug names for the same dynamic path"`.

Se reemplazaron `src/app/[provincia]/[rubro]` y `src/app/[provincia]/[ciudad]/[rubro]` por `src/app/[provincia]/[[...filtros]]`, que interpreta:

- 0 segmentos → listado de la provincia
- 1 segmento → rubro de la provincia
- 2 segmentos → ciudad y rubro

Las URLs no cambian, y ahora `/tucuman` (que antes daba 404) renderiza el listado de la provincia.

---

## D40 - La home se renderiza en servidor a demanda

**Estado:** decidido 2026-10-28, vigente

`src/app/page.tsx` usa `export const dynamic = 'force-dynamic'` en lugar de `revalidate`, porque consulta `categoryGroup` a la base de datos y el entorno de verificación no garantiza un Postgres en el momento del build. Con `revalidate` el build intenta prerenderizar `/` y falla sin base. Como ruta dinámica, se renderiza por request, que es el comportamiento correcto para un catálogo que puede cambiar.




---

## D41 - `MODERADOR` es un rol de panel con matriz propia, sin dinero ni configuración

**Estado:** decidido 2026-10-29, vigente

`UserRole` suma `MODERADOR`. Puede abrir resumen, perfiles, aprobaciones, riesgo y bloqueos, empresas, matrículas y moderación. No puede abrir catálogo, finanzas, configuración ni auditoría; tampoco impersonar. La regla vive en `src/lib/admin.ts` (`SECCIONES_ADMIN`, `puedeVerSeccion`) y se aplica en tres capas: el menú (cortesía), `exigirAccesoPagina` en cada página (barrera) y `exigirAdmin`/`exigirSuperAdmin` en cada server action (autorización real, con rol releído de la base).

Esconder el link no es seguridad: el moderador que escribe `/admin/finanzas` a mano recibe un redirect a `/admin?error=sin-permisos`.

---

## D42 - La configuración del sitio se lee en `configuracion.ts` y se escribe en `admin-config.ts`

**Estado:** decidido 2026-10-29, vigente

Los valores (`requireManualApproval`, `minProfilesToOpenCategory`, días de gracia, dominios desechables extra) viven en `SiteSetting` y se leen con defaults en código. La lectura está separada de la escritura porque la consumen el webhook de Mercado Pago, el cron y `votos.ts`, que no deben importar el módulo de administración (y su cadena hacia moderación/publicación). `admin-config.ts` solo valida, guarda en transacción y audita; reexporta la lectura para no romper imports existentes.

Los defaults son la red: si la fila no existe o el JSON está corrupto, el sitio sigue funcionando con el valor de `env`/constante en vez de fallar.

---

## D43 - Toda acción del panel deja auditoría y los bloqueos guardan hashes

**Estado:** decidido 2026-10-29, vigente

Cada server action de `src/app/actions/admin.ts` escribe en `AuditLog` (con `antes`/`despues` sin datos sensibles) o llama a un servicio que lo hace en la misma transacción. La lista de bloqueo (`BlockedIdentifier`) guarda hashes de email, WhatsApp y CUIT, nunca el valor original: para desbloquear hay que volver a escribir el dato, que es la única forma de que el panel no sea un directorio de datos personales.

No hay impersonación: un admin que necesita ver lo que ve un profesional usa el perfil público o los datos del detalle, no una sesión ajena.

---

## D44 - El catálogo se desactiva, no se borra; las localidades se reasignan

**Estado:** decidido 2026-10-29, vigente

`Category` y `City` tienen `isActive`. Borrarlos se llevaría puestos los perfiles asociados y un profesional que pagó el mes no puede desaparecer porque alguien limpió el catálogo. Para fusionar dos localidades existe "reasignar": mueve la ciudad base y la cobertura de la origen a la destino, desactiva la origen y audita el movimiento. La operación no se puede deshacer desde el panel; el aviso lo dice antes de ejecutar.

---

## D45 - El admin crea el espacio y acredita el primer pago a mano

**Estado:** decidido 2026-11-05, vigente

El alta de un espacio puede hacerla el admin desde `/admin/espacios` (nombre,
email, ciudad y rubro principal). El sistema crea el usuario `PROFESSIONAL` con
una clave temporal, crea la suscripción en `PENDING` y entrega las credenciales.
El profesional completa el perfil en `/panel/espacio`; no se publica hasta que
la suscripción pase a `ACTIVE` y estén las fotos y la descripción (D4).

La suscripción **no se activa al crear el espacio ni con un comprobante**: el
admin la acredita desde "Espacios recientes" cuando ve la transferencia en el
banco, con método, monto y N° de operación (obligatorio en transferencia). Eso
crea un `Payment` `APPROVED` con `method`, `reference` y `registeredByEmail`,
activa 30 días, deja auditoría `suscripcion.pago_manual` y aparece en Finanzas.
La actualización es condicional: si ya está activa, rechaza la segunda
acreditación.

**Por qué a mano:** el sistema no puede verificar una transferencia contra el
banco. Aceptar una captura o la palabra del profesional convierte el alta en una
puerta para perfiles fantasma; el admin ya opera la cuenta y acreditar es un
clic. El flujo de Mercado Pago queda para el alta autoservicio, sin cambios.

**Consecuencias:** `Payment.mpPaymentId` es nullable (un pago manual no tiene id
de MP) y el reembolso de esos pagos es manual; `/arrepentimiento` avisa que no se
devuelve por Mercado Pago. El pago manual no genera factura ARCA automática: la
facturación actual solo procesa pagos de MP. Si el volumen de transferencias
crece, el paso siguiente es un comprobante interno o un alta de factura manual,
no relajar la acreditación.
