// Edge Function "api": ejecuta en Supabase el mismo servidor Express de server/src.
// Las rutas quedan en https://<proyecto>.supabase.co/functions/v1/api/...
// El código de ./app lo copia `npm run edge:build` (carpeta server) desde server/src.
import process from 'node:process';
import { createApp } from './app/app.js';
import { assertConfig } from './app/config.js';

assertConfig();
createApp().listen(Number(process.env.EDGE_PORT) || 8000);
