# Investigación y decisiones — web comercial de NexoPOS (22/10/2026)

## 1. Referentes analizados

Se revisaron las páginas públicas de Shopify POS, Lightspeed, Stripe Terminal y Linear, el formulario de demo de Toast (vía resultados indexados) y estudios sobre formularios de demo B2B. Square, Clover, Toast y Revolut Business bloquearon la descarga automática (403/429); para ellos se usan patrones ampliamente conocidos de sus webs, sin copiar textos ni diseño.

| Patrón observado | Dónde | Aplicación en NexoPOS |
|---|---|---|
| Hero corto orientado al resultado, dos CTA (principal + secundario) repetidos en cabecera, mitad de página y cierre | Stripe, Shopify | CTA «Solicitar demostración» en nav, hero, tras cada bloque y en el cierre; secundario «Ver cómo funciona» |
| Segmentación por tipo/tamaño de negocio | Shopify (tamaño), Lightspeed/Toast (sector) | Pestañas Cafetería/restaurante/bar, Tienda, Fregadora con captura y CTA propio que preselecciona el negocio en el formulario |
| Producto mostrado con interfaz real y pies de figura | Linear, Stripe | Recorrido por pestañas con 5 capturas reales de NexoPOS 1.5 y avance automático con barra de progreso |
| Formulario de demo con pocas preguntas y «tipo de negocio» como primer paso | Toast | 5 pasos cortos; la primera pregunta es de un toque |
| Reserva inmediata tras el formulario | Estudio de Chili Piper citado por Komo: la reserva instantánea casi duplica la conversión formulario→reunión | El calendario aparece justo después del contacto, sin esperar a que el equipo llame |
| Confianza: logos, cifras y testimonios | Shopify, Stripe | **No se usan**: NexoPOS no tiene testimonios ni cifras publicables. La confianza se apoya en hechos verificables (datos en la PC del negocio, red local, actualizaciones firmadas, copia previa) |
| FAQ en acordeón con datos estructurados | Shopify | 9 preguntas reales (Internet, equipos, instalación, CUP/USD, apagones, actualizaciones, acceso, precio, demo) + `FAQPage` |
| Reducir fricción («sin tarjeta», «sin compromiso») | Lightspeed | «Gratis y sin compromiso · Eliges día y hora al terminar» |
| CTA fija en móvil | Patrón habitual de las landings SaaS | Barra inferior que aparece tras el hero y se oculta al llegar al CTA final |

Fuentes: shopify.com/pos, lightspeedhq.com/demo, stripe.com/terminal, linear.app, pos.toasttab.com (resultados indexados), komo.ai/glossary/demo-request, involve.me/blog/multi-step-demo-request-form, guideflow.com/blog/demo-requests-saas.

## 2. Qué es NexoPOS (verificado)

Fuentes: repositorio `AvatarStark/NexoPos` (rama `main`, base de Staging 1.1.0), sus documentos `docs/COMERCIALIZACION.md` e `INSTALACION-WINDOWS.md`, la web anterior y las capturas reales de NexoPOS 1.5.3 en `assets/capturas/`.

- Instalación local en una PC Windows 10/11 x64 con instalador que incluye Node y PostgreSQL; puerto 4780; cajas, tabletas y móviles por navegador en la red local. PostgreSQL solo en 127.0.0.1; regla de firewall solo para redes privadas/subred local.
- Sin Internet: entrar, cobrar, inventario y fichas de costo. Internet solo para buscar actualizaciones y la tasa de elTOQUE (ambos opcionales: archivo `.nxupdate` y tasa manual).
- Caja: categorías, búsqueda, escáner de código de barras, efectivo/transferencia/dólares/mixto, turnos con apertura/cierre, verificar inventario, IPV por turno, mesas, comandas, total vendido, entradas.
- Administración (captura 1.5.3): Resumen (vendido hoy/mes, valor del almacén, ganancia y margen, ventas, ticket promedio, comparación 7/30/90 días), Ventas, IPV por turno, Ventas sin conexión, Productos, Almacén, Entradas, Merma, Auditoría, Usuarios, Trazabilidad, Ajustes, Tabletas, Impresora, Módulos. Fichas de costo con exportación Excel (código).
- Cocina (captura): comandas por mesa/pedido, notas, Nuevo/Preparando/Listo, total por preparar, sonido.
- Acceso: usuario y contraseña (admin), PIN con foto (caja y cocina). Tema claro/oscuro.
- Actualizaciones firmadas (Ed25519 + SHA-256) con respaldo previo de base, configuración y archivos.
- Módulos: Mesas, Cocina, Fregadora, Ventas sin conexión, Tabletas, Impresora (según la web anterior y la captura).

**No se presenta**: sincronización en la nube, multi-sucursal, SaaS, app nativa, integraciones de pago con tarjeta, testimonios, número de clientes ni cifras comerciales. El repositorio está en la base 1.1.0 y las capturas son de 1.5.3: las funciones de 1.5 se describen solo cuando aparecen en las capturas o en la web anterior. El módulo Fregadora se describe de forma conservadora porque en el repositorio figura como pendiente de publicación.

No había un entorno de Staging accesible desde este entorno (Staging vive en el equipo Windows del desarrollador), así que no se grabaron recorridos nuevos. La sección de video usa un recorrido con capturas reales y está preparada para un MP4 (`demoVideoUrl` en `assets/js/config.js`).

## 3. Decisiones de diseño

- Se conserva la identidad existente: Plus Jakarta Sans, azul marino #011e41, azul #2a7de1, verde #00ce7c y el degradado de marca; se alternan bloques oscuros y «papel» para ritmo visual.
- Microinteracciones con propósito: hover de botones y tarjetas, barra de progreso del recorrido, transiciones de paso en el formulario. Todo se desactiva con `prefers-reduced-motion`.
- Sin glassmorphism ni gradientes nuevos; sin fotos de stock; sin datos inventados (las cifras de las tarjetas flotantes del hero son las de la captura de demostración).
- Dos titulares en prueba A/B (resultado operativo vs. ganancia), asignados antes de pintar para no provocar saltos de diseño.
