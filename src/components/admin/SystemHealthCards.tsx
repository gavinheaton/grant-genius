import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, CreditCard, Ticket, ScrollText } from "lucide-react";

interface SystemHealthProps {
  emailsSent: number;
  ordersPaid: number;
  activeEntitlements: number;
  auditEntries: number;
  isLoading: boolean;
}

export function SystemHealthCards({
  emailsSent,
  ordersPaid,
  activeEntitlements,
  auditEntries,
  isLoading,
}: SystemHealthProps) {
  const healthItems = [
    {
      label: "Emails Sent",
      value: emailsSent,
      icon: Mail,
      color: "text-blue-500",
    },
    {
      label: "Orders Paid",
      value: ordersPaid,
      icon: CreditCard,
      color: "text-green-500",
    },
    {
      label: "Active Credits",
      value: activeEntitlements,
      icon: Ticket,
      color: "text-amber-500",
    },
    {
      label: "Audit Entries",
      value: auditEntries,
      icon: ScrollText,
      color: "text-purple-500",
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {healthItems.map((item) => (
        <Card key={item.label} className="border-0 shadow-none bg-muted/30">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <item.icon className={`h-4 w-4 ${item.color}`} />
              <div>
                <p className="text-lg font-semibold">{item.value.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
