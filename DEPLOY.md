# Cómo desplegar Propiedad Conecta a producción

Guía práctica para la primera puesta en producción. El pago sigue siendo
**manual** en esta etapa (revisión humana de comprobantes desde
`/admin/compras-creditos`) — todavía no hay ninguna pasarela de pago
(Payphone, Deuna, Stripe) conectada de verdad.

## Requisitos

- **Node 20+** y **npm** (el proyecto no usa pnpm/yarn).
- **PostgreSQL** — cualquier proveedor compatible (Neon, Vercel Postgres,
  Supabase, RDS, etc.). No hace falta instalar Postgres a mano: en local lo
  da `npm run db:start` (usa `prisma dev`).
- **Vercel** — el proyecto está pensado para desplegarse ahí (detecta
  Next.js automáticamente).
- **Dominio propio**: opcional. Vercel ya da una URL funcional
  (`tu-proyecto.vercel.app`) sin esto.

## Variables de entorno

Estas son **todas** las que el código realmente lee (verificado con
`grep -r "process.env" src/ prisma/`), no una lista aspiracional:

| Variable | ¿Para qué sirve? | ¿Necesaria en producción? | ¿Dónde se configura? |
|---|---|---|---|
| `DATABASE_URL` | Conexión a Postgres. La usa toda la app (`src/lib/db.ts`) y Prisma CLI (`prisma.config.ts`). | **Sí, obligatoria.** | Vercel → Settings → Environment Variables. La da tu proveedor de Postgres. |
| `SHADOW_DATABASE_URL` | Solo la usa Prisma CLI para *calcular* migraciones nuevas (`prisma migrate dev`) al desarrollar localmente. | **No.** Nunca se lee fuera de ese comando de desarrollo. | Solo en tu `.env` local. No la cargues en Vercel. |
| `STRIPE_SECRET_KEY` | La usa `src/lib/stripe.ts`, que hoy **no está conectado a ningún botón de la app** — es código dormido de una integración anterior. | **No, por ahora.** El flujo de créditos no depende de Stripe. | No hace falta configurarla. |
| `STRIPE_WEBHOOK_SECRET` | La usa `src/app/api/webhooks/stripe/route.ts`, mismo estado: dormido, sin uso activo. | **No, por ahora.** | No hace falta configurarla. |

`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` y `NEXT_PUBLIC_BASE_URL` aparecen en
`.env.example` pero **ningún archivo del código las lee hoy** (quedaron del
scaffold de Stripe). No hace falta configurarlas; se dejan documentadas acá
para que no generen confusión si las ves en `.env.example`.

## Base de datos

### 1. Conectar Postgres de producción

Creá la base en tu proveedor (Neon, Vercel Postgres, Supabase...) y copiá su
cadena de conexión — normalmente ya viene con `?sslmode=require`. Esa es tu
`DATABASE_URL` de producción.

### 2. Migraciones

El script `build` del proyecto ya incluye el paso de migrar:

```json
"build": "prisma migrate deploy && next build"
```

Es decir: **no hace falta correr nada a mano** — cada vez que Vercel
construye el proyecto, aplica automáticamente las migraciones pendientes
contra la `DATABASE_URL` configurada, y recién después compila. Si alguna
vez necesitás aplicarlas manualmente (por ejemplo antes de crear el primer
admin), el comando es:

```bash
DATABASE_URL="<la de producción>" npx prisma migrate deploy
```

`prisma migrate deploy` **nunca borra datos** — solo aplica los cambios de
esquema pendientes, uno por uno, sin tocar filas existentes.

### 3. Qué NO correr en producción

**Nunca corras `npm run db:seed` contra la base de producción.** El script
de seed (`prisma/seed.ts`) empieza borrando **todos** los usuarios
(`prisma.user.deleteMany()`) y todo lo relacionado, para poder recrear datos
de ejemplo limpios en desarrollo. Es intencional y seguro en local, pero en
producción borraría cuentas reales de compradores, agentes y admin. Para
producción existe un mecanismo separado y no destructivo (ver siguiente
sección).

## Primer administrador

Producción arranca sin ningún usuario. Para crear la primera cuenta admin
existe `prisma/create-first-admin.ts` — un script aparte de `seed.ts`,
pensado específicamente para no borrar nada:

```bash
DATABASE_URL="<la de producción>" npx tsx prisma/create-first-admin.ts \
  "Tu nombre" "tu@email.com"
```

Te va a mostrar una contraseña generada al azar, **una sola vez** —
guardala y entrá con esa cuenta en `/login`. Es seguro en cuanto a que:

- **No borra ni modifica usuarios existentes** — solo hace un `create`.
- **Es de una sola vez**: si ya existe cualquier cuenta con rol `ADMIN`, se
  niega a crear otra y no hace nada (para que no lo uses por accidente para
  ir sumando administradores sin control). Si más adelante necesitás un
  segundo admin, hacelo manualmente por ahora — todavía no hay una pantalla
  para promover el rol de un usuario existente.
- **No tiene ninguna contraseña hardcodeada** en el código — se genera al
  azar en cada ejecución y solo se muestra esa vez en la terminal.

## Vercel

1. En [vercel.com](https://vercel.com/new), **Add New → Project** e
   importá el repositorio de GitHub de Propiedad Conecta.
2. Vercel detecta Next.js automáticamente — no hace falta tocar el
   Build Command ni el Install Command (`npm install` + `npm run build`,
   que ya incluye `prisma generate` vía `postinstall` y `prisma migrate
   deploy` vía `build`).
3. En **Settings → Environment Variables**, cargá únicamente
   `DATABASE_URL` (ver tabla arriba — es la única obligatoria).
4. **Deploy**. Vercel va a instalar dependencias, generar el cliente de
   Prisma, aplicar las migraciones contra tu Postgres de producción, y
   compilar el sitio.
5. Si preferís aplicar las migraciones antes del primer deploy (opcional,
   ya que el build las aplica solo), podés correr `prisma migrate deploy`
   manualmente como se explicó arriba.
6. Creá el primer admin con `create-first-admin.ts` (sección anterior),
   apuntando a la `DATABASE_URL` de producción.
7. Verificá que `https://tu-proyecto.vercel.app/admin` cargue y te pida
   login (no que muestre datos ni un error 500).

## Checklist post-deployment

- [ ] La aplicación abre (`/` carga sin error).
- [ ] Registro/login funciona (crear una cuenta compradora de prueba).
- [ ] Un usuario puede publicar una solicitud (`/buscar`).
- [ ] La solicitud aparece en el marketplace del agente.
- [ ] Un agente puede registrarse (`/agente/registro`).
- [ ] El agente puede ver solicitudes disponibles en `/dashboard/agent/leads`.
- [ ] Los filtros del marketplace funcionan (probar Operación/Tipo/Ciudad
      sin crashear).
- [ ] Los datos de contacto permanecen ocultos antes de desbloquear.
- [ ] El admin puede acceder a `/admin` con la cuenta creada arriba.
- [ ] El admin puede aprobar una compra de créditos en
      `/admin/compras-creditos`.
- [ ] Los créditos aparecen correctamente en el saldo del agente tras la
      aprobación.
- [ ] El agente puede desbloquear un lead (se descuentan los créditos
      correctos: 10 compra / 2 alquiler).
- [ ] El botón de WhatsApp y el link de email funcionan después del
      desbloqueo.
- [ ] El flujo de devolución de crédito funciona (solicitar → aprobar/
      rechazar desde `/admin/devoluciones`).

## Qué queda pendiente después de esto

- **Pagos**: siguen siendo 100% manuales (revisión humana de comprobantes).
  Conectar Payphone/Deuna es un paso futuro, deliberadamente fuera de esta
  etapa.
- **Instrucciones de pago**: configuralas en `/admin/configuracion` antes de
  invitar agentes reales — vienen vacías a propósito (nunca se inventó un
  número de cuenta o teléfono).
- **Dominio propio**: opcional, se agrega después en Vercel → Settings →
  Domains sin necesidad de redesplegar nada.
- **Segundo administrador**: hoy no hay pantalla para promover un usuario
  existente a admin ni para crear uno adicional de forma segura — solo el
  primero, vía el script de esta guía.
