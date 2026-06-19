import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type MonthOption = {
  value: string;
  label: string;
};

type MultiPeriodPickerProps = {
  years: string[];
  months: MonthOption[];
  selectedYears: string[];
  selectedMonths: string[];
  onYearsChange: (years: string[]) => void;
  onMonthsChange: (months: string[]) => void;
};

export function MultiPeriodPicker({
  years,
  months,
  selectedYears,
  selectedMonths,
  onYearsChange,
  onMonthsChange,
}: MultiPeriodPickerProps) {
  const selectedYearSet = new Set(selectedYears);
  const selectedMonthSet = new Set(selectedMonths);
  const allMonthsSelected = selectedMonths.length === 0;

  function toggleYear(year: string) {
    if (selectedYearSet.has(year)) {
      if (selectedYears.length === 1) return;
      onYearsChange(selectedYears.filter((item) => item !== year));
      return;
    }
    onYearsChange([...selectedYears, year].sort());
  }

  function toggleMonth(month: string) {
    const allMonthValues = months.map((option) => option.value);
    const next = allMonthsSelected
      ? allMonthValues.filter((item) => item !== month)
      : selectedMonthSet.has(month)
        ? selectedMonths.filter((item) => item !== month)
        : [...selectedMonths, month].sort();

    onMonthsChange(next.length === 0 || next.length === allMonthValues.length ? [] : next);
  }

  return (
    <div className="col-span-full rounded-md border bg-muted/20 p-3">
      <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.7fr)_1fr]">
        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">Jaren</div>
          <div className="flex flex-wrap gap-2">
            {years.map((year) => (
              <label
                key={year}
                className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm"
              >
                <Checkbox
                  checked={selectedYearSet.has(year)}
                  onCheckedChange={() => toggleYear(year)}
                />
                <span>{year}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Maanden</span>
            <Button
              type="button"
              size="sm"
              variant={allMonthsSelected ? "default" : "outline"}
              className="h-7"
              onClick={() => onMonthsChange([])}
            >
              Alle maanden
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {months.map((month) => (
              <label
                key={month.value}
                className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm"
              >
                <Checkbox
                  checked={allMonthsSelected || selectedMonthSet.has(month.value)}
                  onCheckedChange={() => toggleMonth(month.value)}
                />
                <span>{month.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
