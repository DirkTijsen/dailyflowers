export const MACHINE_LOCATION_TYPES = [
  { value: "winkelcentrum", label: "Winkelcentrum" },
  { value: "outlet", label: "Outlet" },
  { value: "tankstation", label: "Tankstation" },
  { value: "groothandel", label: "Groothandel" },
  { value: "ziekenhuis", label: "Ziekenhuis" },
  { value: "bouwmarkt", label: "Bouwmarkt" },
  { value: "carwash", label: "Carwash" },
  { value: "hotel", label: "Hotel" },
  { value: "luchthaven", label: "Luchthaven" },
  { value: "ov_station", label: "OV-station" },
  { value: "winkelstraat", label: "Winkelstraat" },
  { value: "kantoor_mixed_use", label: "Kantoor / mixed-use" },
  { value: "recreatie", label: "Recreatie" },
  { value: "onbekend", label: "Onbekend" },
] as const;

export type MachineLocationType = (typeof MACHINE_LOCATION_TYPES)[number]["value"];

const MACHINE_LOCATION_TYPE_LABELS = new Map(
  MACHINE_LOCATION_TYPES.map((type) => [type.value, type.label]),
);

const MACHINE_LOCATION_TYPE_VALUES = new Set(MACHINE_LOCATION_TYPES.map((type) => type.value));

export function getMachineLocationTypeLabel(value: string | null | undefined) {
  return MACHINE_LOCATION_TYPE_LABELS.get(normalizeMachineLocationType(value)) ?? "Onbekend";
}

export function normalizeMachineLocationType(
  value: string | null | undefined,
): MachineLocationType {
  return MACHINE_LOCATION_TYPE_VALUES.has(value ?? "")
    ? (value as MachineLocationType)
    : "onbekend";
}

export function inferMachineLocationType(displayName: string): MachineLocationType {
  const normalized = normalizeLocationName(displayName);

  if (
    normalized === "weg" ||
    normalized.includes("test machine") ||
    normalized.includes("china test")
  ) {
    return "onbekend";
  }

  if (normalized.includes("haga") || normalized.includes("ziekenhuis")) return "ziekenhuis";
  if (normalized.includes("makro")) return "groothandel";
  if (normalized.includes("gamma") || normalized.includes("karwei")) return "bouwmarkt";
  if (normalized.includes("loogman") || normalized.includes("autowas")) return "carwash";
  if (
    normalized.includes("novotel") ||
    normalized.includes("innside") ||
    normalized.includes("melia")
  ) {
    return "hotel";
  }
  if (normalized.includes("rtha") || normalized.includes("airport")) return "luchthaven";
  if (normalized.startsWith("station ")) return "ov_station";
  if (
    normalized.includes("bataviastad") ||
    normalized.includes("designer outlet") ||
    normalized.includes("style outlet")
  ) {
    return "outlet";
  }
  if (
    normalized.includes("esso") ||
    normalized.includes("shell") ||
    normalized.includes("texaco") ||
    normalized.includes("tinq") ||
    normalized.includes("avia") ||
    normalized.includes("tankstation") ||
    normalized.includes("fuel up") ||
    normalized.includes("berkman") ||
    normalized.includes("t energy") ||
    normalized.includes("honswijck")
  ) {
    return "tankstation";
  }
  if (normalized.includes("the valley")) return "kantoor_mixed_use";
  if (normalized.includes("pier") || normalized.includes("palace promenade")) return "recreatie";
  if (normalized.includes("kalverstraat")) return "winkelstraat";
  if (
    normalized.includes("alexandrium") ||
    normalized.includes("arendshof") ||
    normalized.includes("bison spoor") ||
    normalized.includes("cityplaza") ||
    normalized.includes("barones") ||
    normalized.includes("heuvel galerie") ||
    normalized.includes("hovenpassage") ||
    normalized.includes("tuinen") ||
    normalized.includes("emma passage") ||
    normalized.includes("hal van hilversum") ||
    normalized.includes("hilvertshof") ||
    normalized.includes("hoofdpoort") ||
    normalized.includes("hoog catharijne") ||
    normalized.includes("koperwiek") ||
    normalized.includes("kroonpassage") ||
    normalized.includes("leidsche rijn centrum") ||
    normalized.includes("lusthofpassage") ||
    normalized.includes("middenwaard") ||
    normalized.includes("sc overvecht") ||
    normalized.includes("scheepjeshof") ||
    normalized.includes("stadshart") ||
    normalized.includes("villa arena") ||
    normalized.includes("westfield") ||
    normalized.includes("winkelcentrum") ||
    normalized.includes("winkencentrum") ||
    normalized.includes("zeewijkplein") ||
    normalized.includes("zoetermeer locatie")
  ) {
    return "winkelcentrum";
  }

  return "onbekend";
}

function normalizeLocationName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
