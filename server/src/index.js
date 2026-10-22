import { assertConfig, config } from './config.js';
import { createApp } from './app.js';
import { migrate, pool } from './db.js';

assertConfig();
await migrate();
const server = createApp().listen(config.port, () => console.log(`Web NexoPOS: API escuchando en el puerto ${config.port}`));

const stop = () => server.close(() => pool.end().then(() => process.exit(0)));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
