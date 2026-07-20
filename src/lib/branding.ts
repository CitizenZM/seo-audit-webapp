import { z } from 'zod';

/**
 * White-label report branding (#10 agency feature).
 *
 * Lets an agency user replace the default "Audit Report" product chrome with
 * their own name/logo/accent color on the exportable /report/[id] page —
 * both on screen and in the print/PDF cover header. Stored per-user in
 * `agency_branding` (see supabase/migrations/20260720_branding.sql) when
 * Supabase is configured; falls back to localStorage in BrandingSettings.tsx
 * so the feature still works signed-out.
 *
 * PURE module — no I/O, no Next.js imports — so it's trivially unit-testable
 * and safe to import from both the API route and client components.
 */

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const BrandingSchema = z.object({
  agencyName: z.string().trim().min(1).max(80).optional(),
  logoUrl: z
    .string()
    .trim()
    .max(2048)
    .refine((v) => {
      try {
        const u = new URL(v);
        return u.protocol === 'https:';
      } catch {
        return false;
      }
    }, 'logoUrl must be an https:// URL')
    .optional(),
  accentColor: z
    .string()
    .trim()
    .regex(HEX_COLOR_RE, 'accentColor must be a hex color like #16a34a')
    .optional(),
  contactEmail: z.string().trim().email().max(254).optional(),
  hidePoweredBy: z.boolean().optional(),
});

export type Branding = z.infer<typeof BrandingSchema>;

/**
 * Best-effort sanitizer for untrusted input (API body, localStorage,
 * form state). Drops any field that fails validation rather than throwing —
 * a bad accent color shouldn't block saving a valid agency name — and
 * strips unknown keys. Returns {} for non-object input.
 */
export function sanitizeBranding(input: unknown): Branding {
  if (typeof input !== 'object' || input === null) return {};
  const src = input as Record<string, unknown>;
  const out: Branding = {};

  const candidate = {
    agencyName: typeof src.agencyName === 'string' ? src.agencyName.trim() : undefined,
    logoUrl: typeof src.logoUrl === 'string' ? src.logoUrl.trim() : undefined,
    accentColor: typeof src.accentColor === 'string' ? src.accentColor.trim() : undefined,
    contactEmail: typeof src.contactEmail === 'string' ? src.contactEmail.trim() : undefined,
    hidePoweredBy: typeof src.hidePoweredBy === 'boolean' ? src.hidePoweredBy : undefined,
  };

  // Validate each field independently so one bad field doesn't discard the rest.
  const fields: (keyof Branding)[] = ['agencyName', 'logoUrl', 'accentColor', 'contactEmail', 'hidePoweredBy'];
  for (const field of fields) {
    const value = candidate[field];
    if (value === undefined || value === '') continue;
    const single = BrandingSchema.pick({ [field]: true } as Record<keyof Branding, true>).safeParse({ [field]: value });
    if (single.success) {
      Object.assign(out, single.data);
    }
  }

  return out;
}

export const BRANDING_LOCALSTORAGE_KEY = 'agency_branding';
