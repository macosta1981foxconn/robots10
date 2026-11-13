const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

const admin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const publicClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

module.exports = { admin, publicClient };
