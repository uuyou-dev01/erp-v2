"use client";

import { Select } from "@/components/ui/select";
import { formatLocationRegion } from "@/lib/inventory/location-regions";

export interface WorkbenchLocationOption {
  id: string;
  code: string;
  name: string;
  type: string;
  region?: string | null;
}

const LOCATION_TYPE_LABELS: Record<string, string> = {
  WAREHOUSE: "仓库",
  FORWARDER: "集运仓 / 货代",
  TRANSIT: "在途 / 中转",
  PERSON: "个人 / 代收",
};

function formatLocationLabel(location: WorkbenchLocationOption) {
  const region = location.region ? formatLocationRegion(location.region) : null;
  return [region, location.name, location.code].filter(Boolean).join(" · ");
}

export function WorkbenchLocationSelect({
  id,
  value,
  locations = [],
  onChange,
  placeholder = "请选择位置",
  required,
}: {
  id: string;
  value: string;
  locations?: WorkbenchLocationOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const groups = locations.reduce<Record<string, WorkbenchLocationOption[]>>((acc, location) => {
    const key = location.type || "OTHER";
    acc[key] = [...(acc[key] ?? []), location];
    return acc;
  }, {});

  return (
    <Select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      required={required}
    >
      <option value="">{placeholder}</option>
      {Object.entries(groups).map(([type, options]) => (
        <optgroup key={type} label={LOCATION_TYPE_LABELS[type] ?? type}>
          {options.map((location) => (
            <option key={location.id} value={location.id}>
              {formatLocationLabel(location)}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

export function findWorkbenchLocationId(
  locations: WorkbenchLocationOption[] = [],
  locationText?: string | null
) {
  const text = locationText?.trim();
  if (!text) return locations.length === 1 ? locations[0]?.id ?? "" : "";
  return (
    locations.find(
      (location) =>
        location.id === text || location.name === text || location.code === text
    )?.id ?? ""
  );
}
