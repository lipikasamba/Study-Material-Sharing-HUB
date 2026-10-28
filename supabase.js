const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy backend/.env.example to backend/.env and configure it.");
}
if (!/^https:\/\/.+\.supabase\.co$/i.test(url)) {
  throw new Error("SUPABASE_URL must be your HTTPS Supabase project URL.");
}

// Server-only client. This key bypasses RLS; the API must be protected before public deployment.
const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});

module.exports = { supabase };
