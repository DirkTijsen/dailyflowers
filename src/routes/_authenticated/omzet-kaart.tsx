import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ExternalLink, MapPinned } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MultiPeriodPicker } from "@/components/multi-period-picker";
import { currentMonth, formatEUR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/omzet-kaart")({
  head: () => ({ meta: [{ title: "Omzet kaart - Daily Flowers" }] }),
  component: RevenueMapPage,
});

type MachineRow = {
  id: string;
  afs_number: string;
  machine_id: string | null;
  display_name: string;
  active: boolean;
  notes: string | null;
};

type MachineActualRow = {
  period: string;
  machine_id: string | null;
  tx_count: number | null;
  net_total: number | string | null;
};

type Coordinates = {
  lat: number;
  lon: number;
  place: string;
};

type RevenueMapLocation = {
  id: string;
  afsNumber: string;
  externalMachineId: string | null;
  label: string;
  active: boolean;
  route: string | null;
  revenue: number;
  txCount: number;
  coordinates: Coordinates | null;
  x: number | null;
  y: number | null;
  radius: number;
};

const GOOGLE_MAP_EMBED_URL =
  "https://maps.google.com/maps?q=Nederland&t=m&z=8&ie=UTF8&iwloc=&output=embed";
const MAP_BOUNDS = {
  minLat: 50.68,
  maxLat: 53.7,
  minLon: 3.25,
  maxLon: 7.35,
};

const LOCATION_MATCHERS: Array<Coordinates & { match: string }> = [
  { match: "alexandrium", lat: 51.9507, lon: 4.5534, place: "Rotterdam Alexandrium" },
  { match: "arendshof", lat: 51.6441, lon: 4.8605, place: "Oosterhout" },
  { match: "badhoevendorp", lat: 52.338, lon: 4.785, place: "Badhoevedorp" },
  { match: "bataviastad", lat: 52.524, lon: 5.441, place: "Lelystad" },
  { match: "bison spoor", lat: 52.139, lon: 5.035, place: "Maarssen" },
  { match: "cityplaza", lat: 52.029, lon: 5.082, place: "Nieuwegein" },
  { match: "de barones", lat: 51.589, lon: 4.779, place: "Breda" },
  { match: "heuvel galerie", lat: 51.438, lon: 5.479, place: "Eindhoven" },
  { match: "hovenpassage", lat: 52.011, lon: 4.357, place: "Delft" },
  { match: "pier", lat: 52.115, lon: 4.283, place: "Scheveningen" },
  { match: "de tuinen", lat: 51.994, lon: 4.209, place: "Naaldwijk" },
  { match: "designer outlet roosendaal", lat: 51.536, lon: 4.467, place: "Roosendaal" },
  { match: "emma passage", lat: 51.557, lon: 5.091, place: "Tilburg" },
  { match: "audioweg", lat: 52.367, lon: 5.222, place: "Almere" },
  { match: "baarn", lat: 52.212, lon: 5.288, place: "Baarn" },
  { match: "beneluxbaan", lat: 52.292, lon: 4.861, place: "Amstelveen" },
  { match: "blitse rading", lat: 52.244, lon: 5.205, place: "Hilversum" },
  { match: "vrijenban", lat: 52.017, lon: 4.363, place: "Delft" },
  { match: "diemen", lat: 52.338, lon: 4.96, place: "Diemen" },
  { match: "westmaas", lat: 51.785, lon: 4.482, place: "Westmaas" },
  { match: "alkmaar", lat: 52.632, lon: 4.742, place: "Alkmaar" },
  { match: "edisonlaan", lat: 52.211, lon: 5.969, place: "Apeldoorn" },
  { match: "laan van zevenhuizen", lat: 52.226, lon: 5.971, place: "Apeldoorn" },
  { match: "middachtenweg", lat: 51.954, lon: 4.54, place: "Rotterdam" },
  { match: "nootdorp", lat: 52.045, lon: 4.397, place: "Nootdorp" },
  { match: "tilburg zuid", lat: 51.541, lon: 5.094, place: "Tilburg Zuid" },
  { match: "veenendaal industrielaan", lat: 52.025, lon: 5.556, place: "Veenendaal" },
  { match: "hogeweg", lat: 52.154, lon: 5.407, place: "Amersfoort" },
  { match: "honswijck", lat: 52.339, lon: 5.013, place: "Muiden" },
  { match: "koningsbeltweg", lat: 52.391, lon: 5.212, place: "Almere" },
  { match: "leidsche rijn", lat: 52.101, lon: 5.07, place: "Utrecht Leidsche Rijn" },
  { match: "markerkant", lat: 52.394, lon: 5.236, place: "Almere" },
  { match: "molenlaan", lat: 51.964, lon: 4.507, place: "Rotterdam" },
  { match: "neerduist", lat: 52.236, lon: 5.366, place: "Bunschoten" },
  { match: "nieuwerkerk", lat: 51.967, lon: 4.617, place: "Nieuwerkerk aan den IJssel" },
  { match: "nuenen", lat: 51.475, lon: 5.551, place: "Nuenen" },
  { match: "spitsbergen", lat: 52.03, lon: 5.572, place: "Veenendaal" },
  { match: "tolnegen", lat: 52.202, lon: 5.682, place: "Stroe" },
  { match: "uitgeest", lat: 52.529, lon: 4.71, place: "Uitgeest" },
  { match: "utrechtsebrug", lat: 52.335, lon: 4.916, place: "Amsterdam" },
  { match: "vaartweg", lat: 52.226, lon: 5.179, place: "Hilversum" },
  { match: "ypenburg", lat: 52.042, lon: 4.371, place: "Den Haag Ypenburg" },
  { match: "slotervaart", lat: 52.358, lon: 4.828, place: "Amsterdam Slotervaart" },
  { match: "gamma tilburg", lat: 51.57, lon: 5.07, place: "Tilburg" },
  { match: "karwei tilburg", lat: 51.57, lon: 5.07, place: "Tilburg" },
  { match: "haga", lat: 52.055, lon: 4.262, place: "Den Haag" },
  { match: "hal van hilversum", lat: 52.226, lon: 5.176, place: "Hilversum" },
  { match: "hilvertshof", lat: 52.224, lon: 5.176, place: "Hilversum" },
  { match: "hoofdpoort", lat: 51.662, lon: 5.036, place: "Kaatsheuvel" },
  { match: "hoog catharijne", lat: 52.09, lon: 5.113, place: "Utrecht" },
  { match: "innside", lat: 52.336, lon: 4.872, place: "Amsterdam Zuidas" },
  { match: "kalverstraat", lat: 52.369, lon: 4.893, place: "Amsterdam Centrum" },
  { match: "amsterdam noord", lat: 52.399, lon: 4.934, place: "Amsterdam Noord" },
  { match: "spaklerweg", lat: 52.338, lon: 4.916, place: "Amsterdam Spaklerweg" },
  { match: "oisterwijk", lat: 51.58, lon: 5.195, place: "Oisterwijk" },
  { match: "koperwiek", lat: 51.93, lon: 4.582, place: "Capelle aan den IJssel" },
  { match: "kroonpassage", lat: 52.507, lon: 5.475, place: "Lelystad" },
  { match: "aalsmeer", lat: 52.263, lon: 4.762, place: "Aalsmeer" },
  { match: "loogman amsterdam", lat: 52.337, lon: 4.841, place: "Amsterdam" },
  { match: "loogman capelle", lat: 51.93, lon: 4.582, place: "Capelle aan den IJssel" },
  { match: "hoofddorp", lat: 52.306, lon: 4.69, place: "Hoofddorp" },
  { match: "lusthofpassage", lat: 51.925, lon: 4.512, place: "Rotterdam Kralingen" },
  { match: "makro amsterdam", lat: 52.322, lon: 4.94, place: "Amsterdam Duivendrecht" },
  { match: "middenwaard", lat: 52.662, lon: 4.828, place: "Heerhugowaard" },
  { match: "novotel schiphol", lat: 52.306, lon: 4.69, place: "Hoofddorp" },
  { match: "palace promenade", lat: 52.111, lon: 4.286, place: "Scheveningen" },
  { match: "rtha", lat: 51.956, lon: 4.439, place: "Rotterdam The Hague Airport" },
  { match: "sc overvecht", lat: 52.114, lon: 5.126, place: "Utrecht Overvecht" },
  { match: "scheepjeshof", lat: 52.025, lon: 5.556, place: "Veenendaal" },
  { match: "shell roosendaal", lat: 51.536, lon: 4.467, place: "Roosendaal" },
  { match: "veghel", lat: 51.616, lon: 5.548, place: "Veghel" },
  { match: "sprang capelle", lat: 51.672, lon: 5.045, place: "Sprang-Capelle" },
  { match: "uden", lat: 51.661, lon: 5.617, place: "Uden" },
  { match: "zandvoort", lat: 52.371, lon: 4.533, place: "Zandvoort" },
  { match: "weesp", lat: 52.307, lon: 5.041, place: "Weesp" },
  { match: "stadshart amstelveen", lat: 52.302, lon: 4.861, place: "Amstelveen" },
  { match: "stadshart zoetermeer", lat: 52.06, lon: 4.494, place: "Zoetermeer" },
  { match: "station noord", lat: 52.399, lon: 4.934, place: "Amsterdam Noord" },
  { match: "station sloterdijk", lat: 52.388, lon: 4.838, place: "Amsterdam Sloterdijk" },
  { match: "style outlet", lat: 52.384, lon: 4.752, place: "Halfweg" },
  { match: "t energy kralingen", lat: 51.925, lon: 4.512, place: "Rotterdam Kralingen" },
  { match: "moergestel", lat: 51.545, lon: 5.18, place: "Moergestel" },
  { match: "berkman barendrecht", lat: 51.856, lon: 4.535, place: "Barendrecht" },
  { match: "beverwijk", lat: 52.486, lon: 4.657, place: "Beverwijk" },
  { match: "jac dutilh", lat: 51.957, lon: 4.478, place: "Rotterdam" },
  { match: "purmerend", lat: 52.505, lon: 4.959, place: "Purmerend" },
  { match: "the valley", lat: 52.337, lon: 4.873, place: "Amsterdam Zuidas" },
  { match: "amersfoort", lat: 52.154, lon: 5.387, place: "Amersfoort" },
  { match: "harderwijk", lat: 52.342, lon: 5.621, place: "Harderwijk" },
  { match: "villa arena", lat: 52.313, lon: 4.945, place: "Amsterdam Zuidoost" },
  { match: "westfield", lat: 52.089, lon: 4.383, place: "Leidschendam" },
  { match: "etten leur", lat: 51.57, lon: 4.635, place: "Etten-Leur" },
  { match: "zeewijkplein", lat: 52.449, lon: 4.596, place: "IJmuiden" },
  { match: "zoetermeer", lat: 52.06, lon: 4.494, place: "Zoetermeer" },
  { match: "roosendaal", lat: 51.536, lon: 4.467, place: "Roosendaal" },
  { match: "tilburg", lat: 51.557, lon: 5.091, place: "Tilburg" },
];

function RevenueMapPage() {
  const thisYear = currentMonth().split("-")[0];
  const [selectedYears, setSelectedYears] = useState<string[]>([thisYear]);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const periods = useMemo(
    () => multiYearPeriods(selectedYears, selectedMonths),
    [selectedMonths, selectedYears],
  );

  const machinesQ = useQuery({
    queryKey: ["omzet-kaart-machines"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("machines")
        .select("id,afs_number,machine_id,display_name,active,notes")
        .order("display_name");
      if (error) throw error;
      return (data ?? []) as MachineRow[];
    },
  });

  const actualsQ = useQuery({
    queryKey: ["omzet-kaart-actuals", periods],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_monthly_machine" as never)
        .select("period,machine_id,tx_count,net_total")
        .eq("channel", "bold_afs")
        .in("period", periods);
      if (error) throw error;
      return (data ?? []) as MachineActualRow[];
    },
  });

  const locations = useMemo(
    () => buildMapLocations(machinesQ.data ?? [], actualsQ.data ?? []),
    [actualsQ.data, machinesQ.data],
  );
  const plottedLocations = locations.filter((location) => location.coordinates);
  const missingLocations = locations.filter((location) => !location.coordinates);
  const topLocations = [...plottedLocations].sort((a, b) => b.revenue - a.revenue).slice(0, 12);
  const highlightedLocation =
    locations.find((location) => location.id === highlightedId) ?? topLocations[0] ?? null;
  const totalRevenue = locations.reduce((sum, location) => sum + location.revenue, 0);
  const totalTransactions = locations.reduce((sum, location) => sum + location.txCount, 0);
  const isLoading = machinesQ.isLoading || actualsQ.isLoading;
  const error = machinesQ.error ?? actualsQ.error;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Omzet kaart</h1>
          <p className="text-sm text-muted-foreground">
            AFS-locaties op Nederland, met bolgrootte op basis van omzet ex btw.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{plottedLocations.length} locaties op kaart</Badge>
          <Badge variant="outline">Totaal {formatEUR(totalRevenue)}</Badge>
          <Badge variant="outline">{totalTransactions} transacties</Badge>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <MultiPeriodPicker
            years={yearOptions()}
            months={monthOptions()}
            selectedYears={selectedYears}
            selectedMonths={selectedMonths}
            onYearsChange={setSelectedYears}
            onMonthsChange={setSelectedMonths}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapPinned className="h-4 w-4" />
                  Nederland
                </CardTitle>
                <CardDescription>
                  Grote bollen zijn hogere AFS-omzet in de geselecteerde periode.
                </CardDescription>
              </div>
              <MapLegend />
            </div>
          </CardHeader>
          <CardContent>
            <div className="min-h-[640px]">
              {isLoading ? (
                <MapState>Kaart laden...</MapState>
              ) : error ? (
                <MapState destructive>
                  Kaart laden mislukt: {error instanceof Error ? error.message : String(error)}
                </MapState>
              ) : plottedLocations.length === 0 ? (
                <MapState>Geen AFS-locaties met kaartpositie gevonden.</MapState>
              ) : (
                <NetherlandsRevenueMap
                  locations={plottedLocations}
                  highlightedId={highlightedLocation?.id ?? null}
                  onHighlight={setHighlightedId}
                />
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Geselecteerde locatie</CardTitle>
              <CardDescription>Hover of klik op een bol voor details.</CardDescription>
            </CardHeader>
            <CardContent>
              {highlightedLocation ? (
                <LocationDetails location={highlightedLocation} />
              ) : (
                <div className="text-sm text-muted-foreground">Geen locatie geselecteerd.</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top locaties</CardTitle>
              <CardDescription>Gesorteerd op omzet ex btw.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {topLocations.map((location, index) => (
                <button
                  key={location.id}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
                  onMouseEnter={() => setHighlightedId(location.id)}
                  onFocus={() => setHighlightedId(location.id)}
                  onClick={() => setHighlightedId(location.id)}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-medium text-white">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{location.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {location.coordinates?.place ?? "Geen positie"} - {location.afsNumber}
                    </span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {formatCompactEUR(location.revenue)}
                  </span>
                </button>
              ))}
              {topLocations.length === 0 && (
                <div className="text-sm text-muted-foreground">Nog geen omzet gevonden.</div>
              )}
            </CardContent>
          </Card>

          {missingLocations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Geen kaartpositie</CardTitle>
                <CardDescription>
                  Deze AFS-machines hebben nog geen match in de locatie-lookup.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-56 space-y-2 overflow-auto pr-1 text-sm">
                  {missingLocations.map((location) => (
                    <div key={location.id} className="flex items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{location.label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {location.afsNumber} - {formatEUR(location.revenue)}
                        </span>
                      </span>
                      <Button asChild size="sm" variant="outline" className="h-8 shrink-0">
                        <a href={googleMapsUrl(location)} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function NetherlandsRevenueMap({
  locations,
  highlightedId,
  onHighlight,
}: {
  locations: RevenueMapLocation[];
  highlightedId: string | null;
  onHighlight: (id: string) => void;
}) {
  const sortedLocations = [...locations].sort((a, b) => a.radius - b.radius);

  return (
    <div
      className="relative h-[640px] overflow-hidden rounded-md border bg-slate-100 shadow-sm"
      role="region"
      aria-label="Omzetkaart van AFS-locaties in Nederland op Google Maps"
    >
      <iframe
        title="Google Maps kaart van Nederland"
        src={GOOGLE_MAP_EMBED_URL}
        className="absolute inset-0 h-full w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        tabIndex={-1}
      />
      <div className="pointer-events-none absolute inset-0 bg-white/5" />
      <div className="pointer-events-none absolute inset-0 z-10">
        {sortedLocations.map((location) => {
          if (location.x === null || location.y === null) return null;
          const highlighted = highlightedId === location.id;
          const fill = location.revenue > 0 ? "#dc2626" : "#64748b";
          const size = Math.round((highlighted ? location.radius + 4 : location.radius) * 2);
          return (
            <button
              key={location.id}
              type="button"
              aria-label={`${location.label}: ${formatEUR(location.revenue)}`}
              title={`${location.label} - ${formatEUR(location.revenue)} - ${
                location.txCount
              } transacties`}
              className="pointer-events-auto absolute rounded-full border-2 border-white shadow-md outline-none transition-[height,width,opacity,box-shadow] hover:opacity-95 focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
              style={{
                left: `${location.x}%`,
                top: `${location.y}%`,
                width: `${size}px`,
                height: `${size}px`,
                transform: "translate(-50%, -50%)",
                backgroundColor: fill,
                opacity: highlighted ? 0.9 : 0.72,
                boxShadow: highlighted
                  ? "0 0 0 4px rgba(15, 23, 42, 0.25), 0 10px 22px rgba(15, 23, 42, 0.25)"
                  : "0 2px 8px rgba(15, 23, 42, 0.22)",
                zIndex: highlighted ? 200 : Math.round(location.radius),
              }}
              onMouseEnter={() => onHighlight(location.id)}
              onFocus={() => onHighlight(location.id)}
              onClick={() => onHighlight(location.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

function LocationDetails({ location }: { location: RevenueMapLocation }) {
  return (
    <div className="space-y-4 text-sm">
      <div>
        <div className="text-lg font-semibold leading-tight">{location.label}</div>
        <div className="text-muted-foreground">
          {location.afsNumber}
          {location.externalMachineId ? ` - ID ${location.externalMachineId}` : ""}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Omzet" value={formatEUR(location.revenue)} />
        <Metric label="Transacties" value={String(location.txCount)} />
        <Metric label="Plaats" value={location.coordinates?.place ?? "-"} />
        <Metric label="Route" value={location.route ?? "-"} />
      </div>
      <Button asChild variant="outline" className="w-full">
        <a href={googleMapsUrl(location)} target="_blank" rel="noreferrer">
          <ExternalLink className="h-4 w-4" />
          Open in Google Maps
        </a>
      </Button>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-semibold">{value}</div>
    </div>
  );
}

function MapLegend() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-slate-500" />
        Geen omzet
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3.5 w-3.5 rounded-full bg-red-600/70" />
        Omzet
      </span>
    </div>
  );
}

function MapState({
  children,
  destructive = false,
}: {
  children: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <div
      className={`flex h-[620px] items-center justify-center text-sm ${
        destructive ? "text-destructive" : "text-muted-foreground"
      }`}
    >
      {children}
    </div>
  );
}

function buildMapLocations(machines: MachineRow[], actuals: MachineActualRow[]) {
  const actualByMachine = new Map<string, { revenue: number; txCount: number }>();
  for (const row of actuals) {
    if (!row.machine_id) continue;
    const existing = actualByMachine.get(row.machine_id) ?? { revenue: 0, txCount: 0 };
    existing.revenue += Number(row.net_total ?? 0);
    existing.txCount += Number(row.tx_count ?? 0);
    actualByMachine.set(row.machine_id, existing);
  }

  const candidateLocations = machines
    .map((machine): RevenueMapLocation => {
      const actual = actualByMachine.get(machine.id) ?? { revenue: 0, txCount: 0 };
      const coordinates = coordinatesForMachine(machine);
      return {
        id: machine.id,
        afsNumber: machine.afs_number,
        externalMachineId: machine.machine_id,
        label: machine.display_name,
        active: machine.active,
        route: routeFromNotes(machine.notes),
        revenue: actual.revenue,
        txCount: actual.txCount,
        coordinates,
        x: null,
        y: null,
        radius: 4,
      };
    })
    .filter((location) => location.active || location.revenue > 0);

  const maxRevenue = Math.max(0, ...candidateLocations.map((location) => location.revenue));
  const positioned = candidateLocations.map((location) => ({
    ...location,
    radius: markerRadius(location.revenue, maxRevenue),
  }));

  return applyOverlapOffsets(positioned).sort(
    (a, b) => b.revenue - a.revenue || a.label.localeCompare(b.label),
  );
}

function applyOverlapOffsets(locations: RevenueMapLocation[]) {
  const groups = new Map<string, RevenueMapLocation[]>();
  for (const location of locations) {
    if (!location.coordinates) continue;
    const projected = projectToMapPercent(location.coordinates.lat, location.coordinates.lon);
    location.x = projected.x;
    location.y = projected.y;
    const key = `${Math.round(projected.x / 2)}:${Math.round(projected.y / 2)}`;
    groups.set(key, [...(groups.get(key) ?? []), location]);
  }

  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    const step = (Math.PI * 2) / group.length;
    group.forEach((location, index) => {
      const distance = Math.min(3.4, 1.1 + group.length * 0.12);
      location.x = clamp((location.x ?? 0) + Math.cos(index * step) * distance, 3, 97);
      location.y = clamp((location.y ?? 0) + Math.sin(index * step) * distance, 3, 97);
    });
  }

  return locations;
}

function coordinatesForMachine(machine: MachineRow): Coordinates | null {
  const normalized = normalizeLocation(machine.display_name);
  if (
    normalized === "weg" ||
    normalized.includes("test machine") ||
    normalized.includes("china test")
  ) {
    return null;
  }

  return LOCATION_MATCHERS.find((matcher) => normalized.includes(matcher.match)) ?? null;
}

function projectToMapPercent(lat: number, lon: number) {
  const top = mercatorY(MAP_BOUNDS.maxLat);
  const bottom = mercatorY(MAP_BOUNDS.minLat);
  return {
    x: clamp(
      ((mercatorX(lon) - mercatorX(MAP_BOUNDS.minLon)) /
        (mercatorX(MAP_BOUNDS.maxLon) - mercatorX(MAP_BOUNDS.minLon))) *
        100,
      0,
      100,
    ),
    y: clamp(((mercatorY(lat) - top) / (bottom - top)) * 100, 0, 100),
  };
}

function mercatorX(lon: number) {
  return (lon + 180) / 360;
}

function mercatorY(lat: number) {
  const radians = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2;
}

function markerRadius(revenue: number, maxRevenue: number) {
  if (revenue <= 0 || maxRevenue <= 0) return 5;
  return 5 + Math.sqrt(revenue / maxRevenue) * 18;
}

function googleMapsUrl(location: RevenueMapLocation) {
  const query = `${location.label} Daily Flowers AFS Nederland`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function routeFromNotes(notes: string | null) {
  const route = /Route:\s*([^;]+)/i.exec(notes ?? "")?.[1]?.trim();
  return route || null;
}

function multiYearPeriods(years: string[], months: string[]) {
  const selectedYears = uniqueSorted(years);
  const selectedMonths =
    months.length > 0 ? uniqueSorted(months) : monthOptions().map((month) => month.value);
  return selectedYears.flatMap((year) => selectedMonths.map((month) => `${year}-${month}`));
}

function yearOptions() {
  const current = Number(currentMonth().split("-")[0]);
  return Array.from({ length: 5 }, (_, index) => String(current - 2 + index));
}

function monthOptions() {
  return Array.from({ length: 12 }, (_, index) => {
    const value = String(index + 1).padStart(2, "0");
    return {
      value,
      label: new Date(2026, index, 1).toLocaleDateString("nl-NL", { month: "long" }),
    };
  });
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort();
}

function formatCompactEUR(value: number) {
  if (!Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  if (abs >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `${(value / 1000).toFixed(0)}K`;
  return formatEUR(value);
}

function normalizeLocation(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
