import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  presets?: string[];
  className?: string;
}

const DEFAULT_PRESETS = [
  "#1e3a5f", // Deep Navy (brand)
  "#d97706", // Amber (brand)
  "#0f172a", // Slate 900
  "#1e40af", // Blue 800
  "#166534", // Green 800
  "#7c2d12", // Orange 900
  "#4c1d95", // Violet 900
  "#991b1b", // Red 800
];

export function ColorPicker({
  label,
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  className,
}: ColorPickerProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        <div className="relative">
          <Input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-12 h-10 p-1 cursor-pointer border-2"
          />
        </div>
        <Input
          type="text"
          value={value.toUpperCase()}
          onChange={(e) => {
            const val = e.target.value;
            if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
              onChange(val);
            }
          }}
          className="w-28 font-mono text-sm"
          maxLength={7}
        />
      </div>
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onChange(preset)}
              className={cn(
                "w-6 h-6 rounded border-2 transition-all",
                value.toLowerCase() === preset.toLowerCase()
                  ? "border-foreground scale-110"
                  : "border-transparent hover:border-muted-foreground"
              )}
              style={{ backgroundColor: preset }}
              title={preset}
            />
          ))}
        </div>
      )}
    </div>
  );
}
