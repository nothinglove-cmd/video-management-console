import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  UPLOADED: "border-blue-200 bg-blue-50 text-blue-700",
  PROCESSING: "border-purple-200 bg-purple-50 text-purple-700",
  AI_TAGGED: "border-cyan-200 bg-cyan-50 text-cyan-700",
  NEEDS_REVIEW: "border-orange-200 bg-orange-50 text-orange-700",
  IMPORTED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  READY: "border-emerald-200 bg-emerald-50 text-emerald-700",
  TRASHED: "border-slate-200 bg-slate-100 text-slate-600",
  FAILED: "border-red-200 bg-red-50 text-red-700",
  REJECTED: "border-zinc-300 bg-zinc-100 text-zinc-700"
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return <Badge className={cn(statusStyles[status] ?? "border-slate-200 bg-slate-50 text-slate-700", className)}>{status}</Badge>;
}
