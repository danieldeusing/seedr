import { typeTextColors } from "@/lib/colors";
import { capabilityTypes } from "@/lib/capabilityTypes";

interface PluginContentsProps {
  counts: Record<string, number>;
  className?: string;
}

export function PluginContents({ counts, className = "" }: PluginContentsProps) {
  const items = capabilityTypes
    .map(({ type, icon, label, labelPlural }) => {
      const count = counts[type];
      if (!count || count <= 0) return null;
      return { type, icon, label: count === 1 ? label : labelPlural, count };
    })
    .filter(Boolean);

  if (items.length === 0) return null;

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {items.map((item) => {
          if (!item) return null;
          const Icon = item.icon;
          const colorClass = typeTextColors[item.type as keyof typeof typeTextColors];
          return (
            <div
              key={item.type}
              className="flex items-center gap-2 px-3 py-1"
            >
              <Icon className={`w-4 h-4 ${colorClass}`} />
              <span className="text-sm text-text font-medium">{item.count}</span>
              <span className="text-sm text-subtext">{item.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
