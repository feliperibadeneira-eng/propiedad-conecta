# PropertyMatch

MVP de un marketplace inmobiliario de **demanda** para Ecuador: en vez de
publicar propiedades, los compradores/arrendatarios publican exactamente qué
están buscando, y los agentes inmobiliarios pagan para desbloquear su
contacto. Ver la hipótesis que este MVP busca validar en la sección
"Principio" más abajo.

`PropertyMatch` es un nombre temporal — está centralizado en
[`src/lib/brand.ts`](src/lib/brand.ts) para poder cambiarlo fácilmente.

## Instalación

Requisitos: Node 20+, npm.

```bash
npm install
npm run db:start   # levanta Postgres local (prisma dev), no requiere instalar nada más
npm run db:migrate # crea las tablas (primera vez, pedirá un nombre: usa "init")
npm run db:seed    # datos de ejemplo: 5 agentes, 5 compradores, 10 solicitudes
npm run dev
```

Abre http://localhost:3000. Copia `.env.example` a `.env` si no existe ya
(el repo incluye un `.env` de desarrollo apuntando al Postgres local de
`prisma dev`, así que normalmente no hace falta tocar nada para arrancar).

### Modo demo

Ve a `/demo` para entrar como comprador, agente o admin sin crear cuentas
nuevas. Desbloquear un lead consume 1 crédito real de la cuenta del agente
(no hay pago de por medio en este MVP — ver "Sistema de créditos" abajo),
así que el flujo completo se puede probar de punta a punta sin ninguna
configuración extra.

Cuentas demo (contraseña `demo1234` para las tres):

| Rol | Email |
|---|---|
| Admin | `demo-admin@propertymatch.test` |
| Agente | `demo-agente@propertymatch.test` (+ `agente2`..`agente5@propertymatch.test`), 20 créditos c/u |
| Comprador | `demo-comprador@propertymatch.test` (+ `comprador2`..`comprador5@propertymatch.test`) |

## Variables de entorno

Ver [`.env.example`](.env.example) para la lista completa y comentada.
Resumen:

- `DATABASE_URL` / `SHADOW_DATABASE_URL`: Postgres (local vía `prisma dev`,
  o cualquier proveedor en producción).
- `STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` /
  `STRIPE_WEBHOOK_SECRET`: **no se usan en el flujo actual** (ver "Sistema
  de créditos" abajo). El código de Stripe (`src/lib/stripe.ts`,
  `/api/webhooks/stripe`) se dejó intacto y listo para reactivarse más
  adelante, pero ningún botón de la app lo llama hoy.
- `NEXT_PUBLIC_BASE_URL`: usado únicamente si se reactiva Stripe Checkout.

## Autenticación (decisión de diseño)

Compradores, agentes y admin usan el mismo mecanismo: email + contraseña
(bcrypt), sesión en cookie httpOnly respaldada por una fila en `Session`
(ver `src/lib/auth.ts`), y el mismo formulario en `/login` para los tres.
Un comprador **debe registrarse** en `/registro` antes de poder publicar
una solicitud — `/buscar` muestra el formulario solo si hay sesión de
comprador activa; si no, muestra el aviso y el botón para crear cuenta.

## Sistema de créditos (reemplaza a Stripe en el MVP)

En vez de pagar con tarjeta por cada lead, cada agente tiene un
`creditsBalance` en su perfil. Desbloquear un contacto descuenta 1 crédito
de forma atómica (`purchaseWithCredits` en `purchase.ts`); si el lead ya no
está disponible para cuando se confirma la compra (condición de carrera),
el crédito se devuelve automáticamente — nunca se cobra un lead que no se
entregó.

**Garantía del lead**: si el agente marca "Contacté al lead" y pasan las
horas configuradas (`refund_eligible_hours` en `/admin/configuracion`, 48h
por defecto) sin que el comprador confirme que respondió, el agente puede
pedir la devolución de su crédito desde el detalle del lead. La solicitud
queda pendiente hasta que un admin la apruebe o rechace en
`/admin/devoluciones`; aprobarla acredita 1 crédito de vuelta, usando un
update atómico condicionado al estado (`REFUND_REQUESTED` → `REFUNDED`)
para que no se pueda aprobar la misma solicitud dos veces por accidente.

## Estructura del proyecto

```
prisma/schema.prisma       Modelo de datos completo (ver sección 26 del spec)
prisma/seed.ts              Datos demo
src/lib/services/           Lógica de negocio (reglas de la sección 37), sin UI
  requests.ts                crear/pausar/cerrar solicitudes, historial de estado
  leads.ts                   marketplace de agentes: filtros, orden, detalle
  matching.ts                sistema de scoring (sección 14, sin IA)
  purchase.ts                compra con créditos, liberar/reactivar, garantía de devolución
  admin.ts                   métricas, listados y solicitudes de devolución del panel admin
  agentProfile.ts             perfil, créditos y estadísticas del agente
  authService.ts              registro/login de compradores y agentes
  notifications.ts, analytics.ts, audit.ts   soporte (secciones 25, 29, 34)
src/lib/validators/         Esquemas Zod de cada formulario
src/app/                    Rutas (App Router). Cada carpeta de ruta con
                             mutaciones tiene su propio actions.ts (server actions)
src/app/api/webhooks/stripe  Webhook de Stripe (dormant — ver "Variables de entorno")
```

## Seguridad y privacidad (sección 27)

- El teléfono/email del comprador nunca se envía al navegador de un agente
  hasta que existe un `LeadPurchase` confirmado — las queries del
  marketplace (`getAvailableRequestsForAgent`, `getRequestForAgentDetail`)
  ni siquiera seleccionan esos campos del lado del agente antes de comprar.
- Un lead nunca se marca como comprado porque el frontend lo diga: el
  único camino es `purchaseWithCredits`, que descuenta el crédito y llama
  a `confirmPaymentById` en el servidor.
- La devolución de un crédito solo la puede ejecutar un admin
  (`approveRefund`/`rejectRefund`), nunca el propio agente, y el update
  está condicionado al estado actual para que no se acredite dos veces.
- Cada acción de agente/comprador (liberar lead, marcar contactado, ver
  detalle, etc.) vuelve a verificar en el servidor que el `agentId`/
  `buyerId` de la fila coincide con el usuario autenticado — nunca se
  confía en el id que viene en la URL por sí solo.
- Un agente no puede comprar el mismo lead dos veces (constraint único en
  la base de datos, además de la validación en `purchase.ts`), ni comprar
  más allá del `maxAgents` configurado por el comprador (se revalida
  dentro de la misma transacción que confirma el pago, para evitar
  condiciones de carrera).

## Pendiente / simplificaciones deliberadas del MVP

- El **matching score** solo puede personalizarse por ubicación y tipo de
  propiedad (los únicos datos que el agente configura en su perfil); los
  demás criterios de la sección 14 se otorgan siempre porque no le pedimos
  al agente un presupuesto/habitaciones preferidos — hacerlo hubiera sido
  sobrearquitecturar el MVP. Documentado en `src/lib/services/matching.ts`.
- **Reactivación de leads**: es manual (un admin la dispara desde
  `/admin/solicitudes`) una vez cumplidas las horas configuradas, tal como
  pide la sección 20. No hay un cron automático todavía.
- **Reembolsos monetarios reales**: fuera de alcance a propósito. Todo se
  maneja como créditos internos; "liberar lead" (el agente decide no
  atenderlo) tampoco devuelve crédito automáticamente, solo queda
  registrado.
- **Niveles de precio** (`Basic`/`Qualified`/`Premium` en USD): siguen en
  `/admin/configuracion` como resabio del modelo anterior con Stripe, pero
  no se usan — desbloquear un lead siempre cuesta 1 crédito flat.
- Sin tests automatizados todavía (ver sección 41 del spec original);
  las reglas críticas están cubiertas por checks explícitos en
  `purchase.ts` (`assertPurchasable`, `confirmPaymentById`) en vez de
  suite de tests.

## Principio del MVP

Todo el producto está diseñado para responder una sola pregunta: **¿los
agentes inmobiliarios pagarán por acceder a personas que ya declararon
exactamente qué propiedad están buscando?** No se construyó nada que no
sirva para validar esa hipótesis (sin app móvil, sin chat, sin CRM, sin
publicación de propiedades).
