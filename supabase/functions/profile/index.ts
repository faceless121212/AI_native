import { createServiceClient } from '../_shared/db.ts';
import { withErrors } from '../_shared/http.ts';
import { SupabaseRepo, supabaseAuthDeps } from '../_shared/repo-supabase.ts';
import { handleProfile } from './handler.ts';

const db = createServiceClient();
const deps = { auth: supabaseAuthDeps(db), repo: new SupabaseRepo(db) };

Deno.serve(withErrors('profile', (req) => handleProfile(req, deps)));
