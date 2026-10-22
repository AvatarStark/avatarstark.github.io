# Web comercial de NexoPOS

Landing page de NexoPOS con un embudo **Solicitar demostración**: preguntas de cualificación, puntuación de prospectos, calendario con disponibilidad real, confirmación, gestión de la reserva y panel comercial.

Este repositorio es solo la web comercial. No modifica el producto NexoPOS, que sigue funcionando en local y sin Internet.

## Arquitectura

```
Navegador ──► Web estática (GitHub Pages o el propio servidor)
                index.html · book-demo/ · book-demo/gestionar/ · admin/ · privacidad/
                assets/js/config.js  ← URL de la API
         └──► API Node.js + Express (server/)  ──►  PostgreSQL
                /api/slots, /api/leads, /api/bookings, /api/manage/*, /api/events
                /api/admin/*  (JWT, roles admin/ventas)
                avisos opcionales: Resend (correo) y WhatsApp Business Cloud API
```

- **Frontend:** HTML, CSS y JavaScript sin framework ni build, igual que la web anterior. Así se mantiene en GitHub Pages sin cambios de flujo.
- **Backend:** Node + Express + PostgreSQL + bcryptjs + jsonwebtoken, la misma pila del producto NexoPOS, sin frameworks nuevos. Se despliega aparte (Render, Fly.io, Railway o un VPS); también puede servir la web (`SERVE_STATIC=1`).
- **Supabase** no se usa, así que no hay políticas RLS que configurar: la base solo es accesible desde el servidor y ningún dato personal se expone al navegador sin un token.

### Archivos principales

| Ruta | Contenido |
|---|---|
| `index.html`, `assets/css/styles.css`, `assets/js/main.js` | Landing: hero con prueba A/B, problemas, recorrido del producto, cómo funciona, negocios, demostración, confianza, preguntas y CTA final |
| `book-demo/index.html`, `assets/css/funnel.css`, `assets/js/funnel.js` | Embudo de 6 pasos con validación, persistencia en la sesión, teclado y confirmación (.ics) |
| `assets/js/calendar.js` | Calendario: semanas, días con horarios libres, zona horaria del visitante |
| `book-demo/gestionar/`, `assets/js/manage.js` | Reprogramar o cancelar con el enlace secreto `#t=…` |
| `admin/`, `assets/css/admin.css`, `assets/js/admin.js` | Panel: métricas, prospectos, agenda, disponibilidad, reglas de puntuación |
| `assets/js/config.js` | Configuración pública (URL de la API, WhatsApp, video, Turnstile, A/B) |
| `assets/js/fx.js` | Efectos compartidos: esqueletos de carga, onda al pulsar, animaciones al hacer scroll, tarjetas que se inclinan con el puntero, barra de lectura y cifras animadas. Respeta «reducir movimiento» |
| `assets/js/boot.js`, `assets/js/track.js` | Variante A/B antes de pintar; analítica propia anónima |
| `server/src/routes/public.js` | API pública: horarios, prospectos, reservas, gestión, eventos |
| `server/src/routes/admin.js` | API del panel (sesión, prospectos, notas, historial, métricas, ajustes) |
| `server/src/lib/` | Horarios y zonas horarias, puntuación, validación, límites, avisos |
| `server/migrations/001_inicial.sql` | Esquema (índices únicos que impiden reservas duplicadas) |
| `server/test/` | Pruebas de API (`node:test`) y de navegador (Playwright) |
| `docs/INVESTIGACION.md` | Investigación de mercado, funciones verificadas de NexoPOS y decisiones |

## Cómo funciona el embudo

1. **Cualificación**: tipo de negocio, necesidades (varias), personas, plazo. Con ratón o dedo avanza solo; con teclado se confirma con Enter.
2. **Contacto**: nombre, negocio, WhatsApp, correo opcional, zona horaria y consentimiento. Validación en el navegador y en el servidor.
3. **Puntuación**: el servidor suma puntos según las reglas configurables (Panel → Puntuación) y asigna prioridad alta, media o baja. Es orientativa y nunca impide reservar.
4. **Calendario**: horarios calculados en el servidor a partir de las franjas semanales, días bloqueados, antelación mínima y reservas confirmadas. Sin franjas configuradas no se ofrece ningún horario.
5. **Reserva**: transacción serializada (`pg_advisory_xact_lock`) y además índice único parcial `bookings(starts_at) WHERE status='confirmada'`. Si dos personas eligen el mismo horario, una lo consigue y la otra recibe aviso y un calendario actualizado.
6. **Confirmación**: resumen, archivo de calendario y enlace secreto para reprogramar o cancelar (el token se guarda como hash SHA-256 y cambia al reprogramar). Solo se dice «te enviamos…» cuando el proveedor de correo o WhatsApp aceptó el mensaje.

Si la API no responde, el visitante no pierde sus respuestas y puede enviarlas por WhatsApp con el texto ya escrito.

## Seguridad

- Validación completa en el servidor; cuerpo JSON máx. 20 KB.
- Antispam: campo trampa, tiempo mínimo de 3 s, límites por IP (prospectos 6/10 min, reservas 12/10 min, login 10/15 min) y Cloudflare Turnstile opcional.
- Panel: contraseñas bcrypt (mín. 12 caracteres), bloqueo de 15 min tras 5 intentos fallidos, JWT de 8 h que se invalida al cambiar la contraseña o con «cerrar todas las sesiones», roles `admin` (configura) y `ventas` (gestiona prospectos), comprobación en cada ruta.
- CORS limitado a `ALLOWED_ORIGINS`; CSP, `nosniff`, `X-Frame-Options`, `Referrer-Policy` y HSTS en producción. El panel y la gestión de reservas no se indexan y no envían Referer.
- El servidor nunca publica `server/`, `.env` ni archivos ocultos. Los secretos viven solo en variables de entorno.
- Analítica sin cookies ni datos personales; respeta «No rastrear» y Global Privacy Control.

## Variables de entorno

Ver `server/.env.example`. Obligatorias: `DATABASE_URL`, `ADMIN_JWT_SECRET` (≥ 32 caracteres), `ALLOWED_ORIGINS` (si la web está en otro dominio) y `PUBLIC_SITE_URL`. Opcionales: `TURNSTILE_SECRET`, `RESEND_API_KEY` + `EMAIL_FROM`, `SALES_NOTIFY_EMAIL`, `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` + `WHATSAPP_TEMPLATE_NAME`. `RATE_LIMIT_SCALE` existe solo para las pruebas automáticas.

## Desarrollo local

```bash
cd server
npm ci
cp .env.example .env            # completar DATABASE_URL y ADMIN_JWT_SECRET; SERVE_STATIC=1; NODE_ENV=development
npm run migrate
npm run admin:create -- --usuario ana --nombre "Ana" --rol admin
npm run dev                      # http://localhost:8787  (web + API)
```

Después, en http://localhost:8787/admin/ → Disponibilidad, define las franjas semanales: hasta entonces el calendario no ofrece horarios.

## Pruebas

```bash
cd server
npm test           # 23 pruebas de API y lógica contra PostgreSQL (TEST_DATABASE_URL)
npm run test:e2e   # 40 pruebas Playwright: escritorio, móvil, accesibilidad WCAG 2.2 AA (axe) y efectos visuales
```

Las pruebas borran y recrean el esquema de la base indicada en `TEST_DATABASE_URL` (por defecto `nexo_web_test` en localhost). Nunca apuntarlas a la base de producción.

## Despliegue

1. **Base de datos**: crear un PostgreSQL gestionado (Render, Neon, Supabase como Postgres, Railway…). Copiar su URL en `DATABASE_URL` y activar `DATABASE_SSL=1` si lo exige.
2. **API**: desplegar `server/` como servicio Node (`npm ci --omit=dev` y `npm start`) o con `server/Dockerfile` desde la raíz del repo. Las migraciones se aplican solas al arrancar. Configurar las variables, `TRUST_PROXY=1` detrás del proxy del proveedor y HTTPS.
3. **Administrador**: `npm run admin:create -- --usuario … --rol admin` contra la base de producción (con `ADMIN_PASSWORD` en el entorno o escribiéndola en la terminal).
4. **Web**: en `assets/js/config.js` poner `apiBase: 'https://tu-api…'` y publicar en `main` (GitHub Pages). Añadir `https://avatarstark.github.io` a `ALLOWED_ORIGINS` y `PUBLIC_SITE_URL=https://avatarstark.github.io`.
   Alternativa: servir todo desde el backend con `SERVE_STATIC=1` y apuntar el dominio allí (`apiBase: ''`).
5. **Panel**: entrar en `/admin/`, configurar Disponibilidad y revisar Puntuación.
6. **Avisos** (opcional): Resend con dominio verificado; WhatsApp Business Cloud API con una plantilla aprobada de 3 parámetros (nombre, fecha y hora, enlace).

Mientras `apiBase` no apunte a un backend desplegado, la web en GitHub Pages muestra el embudo pero, al enviar los datos, ofrece continuar por WhatsApp en lugar de reservar.

## Contenido

- `assets/capturas/`: capturas reales de NexoPOS 1.5 con datos de demostración (WebP 960/1600/2400 px).
- No publicar capturas con datos de licencia (License ID, Installation ID, código de solicitud) ni datos reales de clientes.
- Video de demostración: subir el archivo a `assets/video/` y poner su ruta en `demoVideoUrl`.
