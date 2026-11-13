const config = require('../src/config');
const { admin } = require('../src/supabase');

const TABLES = [
  'profiles',
  'sites',
  'geofences',
  'robots',
  'trips',
  'location_updates',
  'load_assignments'
];

(async () => {
  const result = {
    supabaseConfigured: Boolean(
      config.supabaseUrl && config.supabaseAnonKey && config.supabaseServiceRoleKey
    ),
    authAdmin: null,
    tables: {}
  };

  try {
    const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    result.authAdmin = { ok: !users.error, error: users.error?.message || null };
  } catch (error) {
    result.authAdmin = { ok: false, error: error.message };
  }

  for (const table of TABLES) {
    try {
      const response = await admin.from(table).select('id').limit(1);
      result.tables[table] = {
        ok: !response.error,
        error: response.error?.message || null
      };
    } catch (error) {
      result.tables[table] = { ok: false, error: error.message };
    }
  }

  const tablesOk = Object.values(result.tables).every((item) => item.ok);
  result.ok = result.supabaseConfigured && result.authAdmin?.ok && tablesOk;

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
