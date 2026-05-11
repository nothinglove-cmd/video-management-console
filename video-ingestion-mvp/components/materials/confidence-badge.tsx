import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function ConfidenceBadge({ value, className }: { value?: number | null; className?: string }) {
  const tone =
    value == null
      ? "border-slate-200 bg-slate-50 text-slate-600"
      : value >= 0.85
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : value >= 0.6
          ? "border-orange-200 bg-orange-50 text-orange-700"
          : "border-red-200 bg-red-50 text-red-700";

  return <Badge className={cn(tone, className)}>{value == null ? "-" : value.toFixed(2)}</Badge>;
}
