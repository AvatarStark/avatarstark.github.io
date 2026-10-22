# Imagen del backend comercial (API + opcionalmente la web estática con SERVE_STATIC=1).
# Construir desde la raíz del repositorio: docker build -f server/Dockerfile -t nexopos-web .
FROM node:22-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev
COPY server/src server/src
COPY server/migrations server/migrations
COPY server/scripts server/scripts
COPY index.html 404.html robots.txt sitemap.xml ./
COPY assets assets
COPY book-demo book-demo
COPY admin admin
COPY privacidad privacidad
ENV NODE_ENV=production PORT=8787
USER node
EXPOSE 8787
CMD ["node", "server/src/index.js"]
