import { createServiceClient } from '../_shared/db.ts';
import { withErrors } from '../_shared/http.ts';
import { SupabaseReplyRepo, supabaseAuthDeps } from '../_shared/repo-supabase.ts';
import { handleQuota } from './handler.ts';

const db = createServiceClient();
const deps = { auth: supabaseAuthDeps(db), repo: new SupabaseReplyRepo(db) };

Deno.serve(withErrors('quota', (req) => handleQuota(req, deps)));
