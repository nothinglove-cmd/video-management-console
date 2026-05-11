"use client";

import { Input } from "@/components/ui/input";

export function TagEditor({
  value,
  onChange
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="输入标签，使用逗号分隔"
    />
  );
}
