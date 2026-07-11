import { z } from "zod";
import { normalizePortalEmail } from "@/lib/portal/access";

export const portalInviteSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Ingresá un email")
    .email("Ingresá un email válido")
    .transform(normalizePortalEmail),
  full_name: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v && v.length ? v : undefined)),
});

export type PortalInviteInput = z.infer<typeof portalInviteSchema>;
