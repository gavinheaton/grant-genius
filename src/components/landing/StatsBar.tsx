interface StatItem {
  value: string;
  label: string;
}

interface StatsBarProps {
  stats: StatItem[];
  heading?: string | null;
}

export function StatsBar({ stats, heading }: StatsBarProps) {
  if (!stats.length) return null;

  return (
    <section className="py-16 bg-muted/30">
      <div className="container">
        {heading && (
          <h2 className="text-2xl font-bold text-center mb-10">{heading}</h2>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, i) => (
            <div key={i} className="text-center">
              <div className="text-4xl font-bold text-primary mb-1">{stat.value}</div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
