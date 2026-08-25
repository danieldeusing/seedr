import { useEffect } from "react";
import { Select } from "@/core/ui/Select";
import { useLabels } from "./labels";

/**
 * The label field, in the add and edit forms. A checkout with no catalogue has
 * no label to give, so the row says where labels come from instead of offering
 * an empty dropdown.
 */
export function LabelRow({ value, onChange, disabled, id }: { value: string; onChange(label: string): void; disabled: boolean; id: string }) {
  const labels = useLabels((state) => state.labels);
  const load = useLabels((state) => state.load);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="field-row">
      <label className="lbl" htmlFor={id} data-tip="What this item is for, when one registry serves several projects. Managed in settings → labels.">
        label
      </label>
      <div className="field-val">
        {labels.length === 0 ? (
          <span className="text-muted-foreground">no labels in this checkout — add them in settings → labels</span>
        ) : (
          <Select
            id={id}
            ariaLabel="label"
            value={value}
            options={[{ value: "", label: "no label" }, ...labels.map((label) => ({ value: label.slug, label: label.name }))]}
            onChange={onChange}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
}
