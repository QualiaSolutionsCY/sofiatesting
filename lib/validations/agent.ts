import { z } from "zod";

export const agentSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Invalid email address").toLowerCase(),
  phoneNumber: z.string().optional().or(z.literal("")),
  region: z.enum(
    ["Limassol", "Paphos", "Larnaca", "Famagusta", "Nicosia", "All"],
    {
      required_error: "Please select a region",
    }
  ),
  role: z.enum(
    [
      "Normal Agent",
      "Manager Limassol",
      "Manager Paphos",
      "Manager Larnaca",
      "Manager Famagusta",
      "Manager Nicosia",
      "CEO",
      "Listing Admin",
    ],
    {
      required_error: "Please select a role",
    }
  ),
  isActive: z.boolean(),
  notes: z.string().optional().or(z.literal("")),
  // New permission fields
  canUpload: z.boolean(),
  canReceiveLeads: z.boolean(),
  zyprusUserId: z.string().optional().or(z.literal("")),
});

export type AgentFormData = z.infer<typeof agentSchema>;
