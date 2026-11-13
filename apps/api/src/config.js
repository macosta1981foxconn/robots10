const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const appEnvPath = path.join(__dirname, '..', '.env');
const rootEnvPath = path.join(__dirname, '..', '..', '..', '.env');

function readEnvFile(filePath) {
  try {
    return dotenv.parse(fs.readFileSync(filePath));
  } catch {
    return {};
  }
}

function isPlaceholder(value) {
  return !value || /your[-_]|changeme|example|placeholder|xxx/i.test(value);
}

const rootVars = readEnvFile(rootEnvPath);
const appVars = readEnvFile(appEnvPath);
const merged = { ...rootVars, ...appVars };

for (const key of Object.keys(appVars)) {
  const appValue = appVars[key];
  const rootValue = rootVars[key];
  if (isPlaceholder(appValue) && !isPlaceholder(rootValue)) {
    merged[key] = rootValue;
  }
}

for (const [key, value] of Object.entries(merged)) {
  if (value === undefined) continue;
  const current = process.env[key];
  if (current === undefined || isPlaceholder(current)) {
    process.env[key] = value;
  }
}

const env = process.env;
const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = required.filter((key) => !env[key] || isPlaceholder(env[key]));

if (missing.length > 0) {
  throw new Error(`Faltan variables de entorno requeridas: ${missing.join(', ')}`);
}

module.exports = {
  port: Number(env.PORT || 3001),
  clientOrigin: (env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  supabaseUrl: env.SUPABASE_URL,
  supabaseAnonKey: env.SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  nodeEnv: env.NODE_ENV || 'development'
};
