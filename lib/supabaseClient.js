import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Uses the anon key on purpose — this app only ever needs to SELECT from
// weekly_articles on the client/server-render side. Writes (talking_points
// updates) happen inside the API route using the service role key instead,
// kept separate so this anon client never has elevated permissions.
//
// The explicit `global.fetch` override forces every request this client makes
// to skip Next.js's fetch cache entirely. Without this, supabase-js's internal
// fetch calls can get cached at the URL level even on a route marked
// force-dynamic — a known gotcha (see Supabase's Next.js stale-data
// troubleshooting doc), and results in the page showing old rows after
// deletes/inserts until a full .next cache wipe.
export const supabase = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    global: {
      fetch: (url, options = {}) => fetch(url, { ...options, cache: "no-store" }),
    },
  }
);
