import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, CheckCircle, XCircle, TrendingUp } from "lucide-react";

interface LiveOperationsProps {
  currentlyRunning: number;
  completedToday: number;
  failedToday: number;
  successRate7d: number;
  isLoading: boolean;
}

export function LiveOperationsCards({
  currentlyRunning,
  completedToday,
  failedToday,
  successRate7d,
  isLoading,
}: LiveOperationsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 80) return "text-green-500";
    if (rate >= 50) return "text-amber-500";
    return "text-destructive";
  };

  const cards = [
    {
      title: "Active Runs",
      value: currentlyRunning,
      icon: Activity,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Completed Today",
      value: completedToday,
      icon: CheckCircle,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      title: "Failed Today",
      value: failedToday,
      icon: XCircle,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
    },
    {
      title: "Success Rate (7d)",
      value: `${successRate7d}%`,
      icon: TrendingUp,
      color: getSuccessRateColor(successRate7d),
      bgColor: successRate7d >= 80 ? "bg-green-500/10" : successRate7d >= 50 ? "bg-amber-500/10" : "bg-destructive/10",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{card.title}</p>
                <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
              </div>
              <div className={`p-3 rounded-full ${card.bgColor}`}>
                <card.icon className={`h-6 w-6 ${card.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
