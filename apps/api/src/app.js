const express = require('express');
const cors = require('cors');
const config = require('./config');
const apiRouter = require('./routes');

const app = express();
app.disable('x-powered-by');

const allowAnyOrigin = config.nodeEnv !== 'production' || config.clientOrigin.includes('*');
app.use(cors({ origin: allowAnyOrigin ? true : config.clientOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'api', timestamp: new Date().toISOString() });
});

app.use('/api', apiRouter);
app.use(apiRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  const status = error.status || error.statusCode || 500;
  const message = config.nodeEnv === 'production' ? 'Error interno del servidor' : error.message;
  if (status >= 500) console.error(error);
  res.status(status).json({ error: message });
});

module.exports = app;
