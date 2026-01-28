import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface GrantCreditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUserId: string;
  targetUserEmail: string;
}

export function GrantCreditDialog({
  open,
  onOpenChange,
  targetUserId,
  targetUserEmail,
}: GrantCreditDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [entitlementType, setEntitlementType] = useState("REPORT_ONE_OFF");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");

  const grantCreditMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("grant-credit", {
        body: {
          target_user_id: targetUserId,
          entitlement_type: entitlementType,
          quantity: parseInt(quantity, 10),
          reason: reason.trim() || null,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Credit granted successfully",
        description: `${quantity} credit(s) added to ${targetUserEmail}`,
      });
      queryClient.invalidateQueries({ queryKey: ["admin-user", targetUserId] });
      onOpenChange(false);
      // Reset form
      setQuantity("1");
      setReason("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to grant credit",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    grantCreditMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Grant Credit</DialogTitle>
          <DialogDescription>
            Manually grant report credits to {targetUserEmail}. This action will
            be logged for audit purposes.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="type">Credit Type</Label>
              <Select
                value={entitlementType}
                onValueChange={setEntitlementType}
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="REPORT_ONE_OFF">
                    Report Credit (REPORT_ONE_OFF)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                max="10"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Maximum 10 credits per grant
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="reason">Reason (optional)</Label>
              <Textarea
                id="reason"
                placeholder="e.g., Customer support refund, Testing, Promotional credit..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={grantCreditMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={grantCreditMutation.isPending}>
              {grantCreditMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Grant Credit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
