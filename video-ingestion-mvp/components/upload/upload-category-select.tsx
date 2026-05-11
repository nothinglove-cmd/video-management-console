import { buildUploadCategoryOptions, type UploadCategoryOptionSource } from "@/components/upload/upload-category-options";
import { Select } from "@/components/ui/select";
import { skin } from "@/components/theme/skin";
import { cn } from "@/lib/utils";

export function UploadCategorySelect({
  categories,
  value,
  onChange,
  label
}: {
  categories: UploadCategoryOptionSource[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const options = buildUploadCategoryOptions(categories);
  const selectedOption = options.find((option) => option.id === value);

  return (
    <label className={cn("block min-w-0 space-y-1.5 font-medium", skin.typography.body)}>
      {label}
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">自动判断 / 待整理</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>{option.label}</option>
        ))}
      </Select>
      {selectedOption ? (
        <span className={cn("block min-w-0", skin.typography.meta)}>
          <span className="block break-all">存储目录：{selectedOption.storagePath}</span>
        </span>
      ) : (
        <span className={cn("block", skin.typography.meta)}>
          未选择栏目时，后台会按 AI/规则判断并进入待整理或建议栏目。
        </span>
      )}
    </label>
  );
}
