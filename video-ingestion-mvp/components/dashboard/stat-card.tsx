import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  delta,
  icon: Icon,
  tone = "emerald"
}: {
  label: string;
  value: string | number;
  delta?: string;
  icon: LucideIcon;
  tone?: "emerald" | "blue" | "orange" | "red" | "slate" | "cyan" | "purple";
}) {
  const toneMap = {
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    orange: "bg-orange-50 text-orange-700",
    red: "bg-red-50 text-red-700",
    slate: "bg-slate-100 text-slate-700",
    cyan: "bg-cyan-50 text-cyan-700",
    purple: "bg-purple-50 text-purple-700"
  };

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3 lg:p-3.5">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg lg:h-9 lg:w-9 ${toneMap[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <p className="text-lg font-semibold lg:text-xl">{value}</p>
            {delta ? <span className="text-xs text-emerald-600">{delta}</span> : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
