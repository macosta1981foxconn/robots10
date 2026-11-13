require('./config');
const app = require('./app');
const config = require('./config');

const server = app.listen(config.port, () => {
  console.log(`API disponible en http://localhost:${config.port}`);
});

server.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
