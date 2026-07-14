import { createClient } from "@supabase/supabase-js";

// Uses the anon key on purpose — this app only ever needs to SELECT from
// weekly_articles on the client/server-render side. Writes (talking_points
// updates) happen inside the API route using the service role key instead,
// kept separate so this anon client never has elevated permissions.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
