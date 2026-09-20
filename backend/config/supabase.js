const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;

if (supabaseUrl && supabaseServiceKey && !supabaseUrl.includes('your-project-id')) {
  try {
    supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    console.log('[Supabase] Client initialized successfully with Service Role.');
  } catch (err) {
    console.error('[Supabase] Failed to initialize client:', err.message);
  }
} else {
  console.warn('[Supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured in environment variables.');
}

function getSupabaseClient() {
  return supabase;
}

function isSupabaseConfigured() {
  return supabase !== null;
}

module.exports = {
  supabase,
  getSupabaseClient,
  isSupabaseConfigured,
};
