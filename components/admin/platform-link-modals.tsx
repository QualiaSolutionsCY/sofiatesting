"use client";

import { Info, Loader2, MessageSquare, Phone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PlatformLinkModalProps = {
  agentId: string;
  agentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

interface LinkTelegramModalProps extends PlatformLinkModalProps {
  currentTelegramUserId?: string | null;
}

export function LinkTelegramModal({
  agentId,
  agentName,
  open,
  onOpenChange,
  onSuccess,
  currentTelegramUserId,
}: LinkTelegramModalProps) {
  const [telegramUserId, setTelegramUserId] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(
        `/api/admin/agents/${agentId}/link-telegram`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            telegramUserId: Number.parseInt(telegramUserId, 10),
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to link Telegram account");
      }

      toast.success("Telegram account linked successfully");
      onSuccess();
      onOpenChange(false);
      setTelegramUserId("");
    } catch (error: any) {
      toast.error(error.message || "Failed to link Telegram account");
    } finally {
      setLoading(false);
    }
  };

  const handleUnlink = async () => {
    setLoading(true);

    try {
      const response = await fetch(
        `/api/admin/agents/${agentId}/link-telegram`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to unlink Telegram account");
      }

      toast.success("Telegram account unlinked successfully");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to unlink Telegram account");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            {currentTelegramUserId ? "Manage" : "Link"} Telegram Account
          </DialogTitle>
          <DialogDescription>
            {currentTelegramUserId
              ? `Current Telegram User ID: ${currentTelegramUserId}`
              : `Link ${agentName}'s Telegram account to enable bot access`}
          </DialogDescription>
        </DialogHeader>

        {currentTelegramUserId ? (
          <div className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                This agent's Telegram account is currently linked. You can
                unlink it or update the user ID.
              </AlertDescription>
            </Alert>

            <DialogFooter className="gap-2">
              <Button
                disabled={loading}
                onClick={() => onOpenChange(false)}
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                disabled={loading}
                onClick={handleUnlink}
                variant="destructive"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Unlink Account
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                To get the Telegram User ID, the agent should start a
                conversation with the SOPHIA bot (@SophiaZyprusBot). The user ID
                will appear in the bot logs.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="telegramUserId">Telegram User ID *</Label>
              <Input
                id="telegramUserId"
                onChange={(e) => setTelegramUserId(e.target.value)}
                placeholder="123456789"
                required
                type="number"
                value={telegramUserId}
              />
              <p className="text-muted-foreground text-sm">
                Enter the numeric Telegram user ID (not the username)
              </p>
            </div>

            <DialogFooter>
              <Button
                disabled={loading}
                onClick={() => onOpenChange(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={loading || !telegramUserId} type="submit">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Link Account
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface LinkWhatsAppModalProps extends PlatformLinkModalProps {
  currentWhatsAppPhone?: string | null;
}

export function LinkWhatsAppModal({
  agentId,
  agentName,
  open,
  onOpenChange,
  onSuccess,
  currentWhatsAppPhone,
}: LinkWhatsAppModalProps) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(
        `/api/admin/agents/${agentId}/link-whatsapp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phoneNumber: phoneNumber.trim(),
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to link WhatsApp account");
      }

      toast.success("WhatsApp account linked successfully");
      onSuccess();
      onOpenChange(false);
      setPhoneNumber("");
    } catch (error: any) {
      toast.error(error.message || "Failed to link WhatsApp account");
    } finally {
      setLoading(false);
    }
  };

  const handleUnlink = async () => {
    setLoading(true);

    try {
      const response = await fetch(
        `/api/admin/agents/${agentId}/link-whatsapp`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to unlink WhatsApp account");
      }

      toast.success("WhatsApp account unlinked successfully");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to unlink WhatsApp account");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            {currentWhatsAppPhone ? "Manage" : "Link"} WhatsApp Account
          </DialogTitle>
          <DialogDescription>
            {currentWhatsAppPhone
              ? `Current WhatsApp: ${currentWhatsAppPhone}`
              : `Link ${agentName}'s WhatsApp account to enable chat access`}
          </DialogDescription>
        </DialogHeader>

        {currentWhatsAppPhone ? (
          <div className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                This agent's WhatsApp account is currently linked. You can
                unlink it or update the phone number.
              </AlertDescription>
            </Alert>

            <DialogFooter className="gap-2">
              <Button
                disabled={loading}
                onClick={() => onOpenChange(false)}
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                disabled={loading}
                onClick={handleUnlink}
                variant="destructive"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Unlink Account
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                The phone number should match the WhatsApp account the agent
                will use with SOPHIA. Include country code without '+' (e.g.,
                35799123456 for Cyprus).
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="phoneNumber">WhatsApp Phone Number *</Label>
              <Input
                id="phoneNumber"
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="35799123456"
                required
                type="tel"
                value={phoneNumber}
              />
              <p className="text-muted-foreground text-sm">
                Format: Country code + number (no spaces or special characters)
              </p>
            </div>

            <DialogFooter>
              <Button
                disabled={loading}
                onClick={() => onOpenChange(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={loading || !phoneNumber} type="submit">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Link Account
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
