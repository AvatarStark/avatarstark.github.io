# Web de NexoPOS

Sitio estático publicado con GitHub Pages en https://avatarstark.github.io/ (rama `main`). Sin build: HTML, CSS y JS planos.

- `index.html`: página principal. `404.html`: página de error.
- `assets/css/styles.css`: diseño (colores de marca en `:root`).
- `assets/js/main.js`: menú móvil, animaciones al desplazarse, selector claro/oscuro de la captura de Caja y pestañas de Administración.
- `assets/capturas/`: capturas reales de NexoPOS 1.5 (datos de demostración) en WebP a 960/1600/2400 px (móvil 600/1200).
- `assets/brand/`: logo, símbolo, favicon e icono. `assets/fonts/`: Plus Jakarta Sans (licencia OFL).
- `assets/og-nexopos.jpg`: imagen al compartir el enlace (1200×630).

Probar en local: `python3 -m http.server 8000` y abrir http://localhost:8000.

No publicar capturas con datos de licencia (License ID, Installation ID, código de solicitud) ni datos reales de clientes.
