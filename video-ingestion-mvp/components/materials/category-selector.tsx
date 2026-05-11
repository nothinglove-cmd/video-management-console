"use client";

import { Select } from "@/components/ui/select";

export function CategorySelector({
  value,
  categories,
  onChange
}: {
  value: string;
  categories: string[];
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value)}>
      {categories.map((category) => (
        <option key={category} value={category}>
          {category}
        </option>
      ))}
    </Select>
  );
}
