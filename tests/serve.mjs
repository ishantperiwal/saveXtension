import { createApp } from '../server/app.mjs';
const app = createApp({ origin: 'http://localhost:3211', setupCode: 'test-only-setup-code' });
app.server.listen(3211, '127.0.0.1');
process.on('SIGTERM', () => app.server.close(() => { app.store.close(); process.exit(0); }));
