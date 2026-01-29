import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { BarChart3 } from "lucide-react";

interface TrendData {
  date: string;
  started: number;
  completed: number;
  failed: number;
}

interface TrendChartProps {
  data: TrendData[];
  isLoading: boolean;
}

export function TrendChart({ data, isLoading }: TrendChartProps) {
  if (isLoading) {
    return <Skeleton className="h-[200px] w-full" />;
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
        <BarChart3 className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">No data for the last 7 days</p>
      </div>
    );
  }

  // Format data for the chart - reverse to show oldest first
  const chartData = [...data].reverse().map((item) => ({
    ...item,
    date: format(new Date(item.date), "MMM d"),
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <XAxis 
          dataKey="date" 
          tick={{ fontSize: 12 }} 
          tickLine={false}
          axisLine={{ stroke: 'hsl(var(--border))' }}
        />
        <YAxis 
          tick={{ fontSize: 12 }} 
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip 
          contentStyle={{ 
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
            fontSize: '12px'
          }}
        />
        <Legend 
          wrapperStyle={{ fontSize: '12px' }}
          iconType="circle"
          iconSize={8}
        />
        <Bar 
          dataKey="started" 
          name="Started"
          fill="hsl(var(--muted-foreground))" 
          radius={[4, 4, 0, 0]}
          opacity={0.5}
        />
        <Bar 
          dataKey="completed" 
          name="Completed"
          fill="hsl(142.1 76.2% 36.3%)" 
          radius={[4, 4, 0, 0]}
        />
        <Bar 
          dataKey="failed" 
          name="Failed"
          fill="hsl(var(--destructive))" 
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
