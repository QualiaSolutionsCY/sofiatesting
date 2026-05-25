import { z } from "zod";

// UI display roles -> DB role values
export const ROLE_OPTIONS = [
  { label: "Normal Agent", value: "agent" },
  { label: "Manager", value: "manager" },
  { label: "Management", value: "management" },
] as const;

export const DB_ROLES = ["agent", "manager", "management"] as const;

export const agentSchema = z.object({
  fullName: z.string().min(1, "Name is required").max(100),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: "Invalid email address",
    })
    .optional()
    .or(z.literal("")),
  phoneNumber: z.string().optional().or(z.literal("")),
  region: z.enum([
    "Limassol",
    "Paphos",
    "Larnaca",
    "Famagusta",
    "Nicosia",
    "All",
  ]),
  role: z.enum(DB_ROLES),
  isActive: z.boolean(),
  notes: z.string().optional().or(z.literal("")),
  canUpload: z.boolean(),
  canReceiveLeads: z.boolean(),
  zyprusUserId: z.string().optional().or(z.literal("")),
});

export type AgentFormData = z.infer<typeof agentSchema>;
