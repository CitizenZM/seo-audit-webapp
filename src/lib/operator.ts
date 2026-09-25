import { supabaseServerSession } from '@/lib/supabase/server';

/**
 * Operator gate for agency-internal surfaces (client workspaces, and later
 * the fix queue / execution engine). Client data must never be public, so
 * this fails CLOSED: no OPERATOR_EMAILS allowlist → nobody gets in.
 */
export function isOperatorEmail(email: string | null | undefined, allowlist: string | undefined): boolean {
  if (!email || !allowlist?.trim()) return false;
  const allowed = allowlist.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}

/** The signed-in operator, or null when signed out / not allowlisted. */
export async function requireOperator() {
  const user = await supabaseServerSession();
  return user && isOperatorEmail(user.email, process.env.OPERATOR_EMAILS) ? user : null;
}
