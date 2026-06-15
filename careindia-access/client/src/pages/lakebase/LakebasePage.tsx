import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@databricks/appkit-ui/react';
import { useState, useEffect } from 'react';
import { Database } from 'lucide-react';

type IndicatorRow = Record<string, string | number | null>;

const columns = [
  'district_name',
  'state_ut',
  'households_surveyed',
  'women_15_49_interviewed',
  'maternal_neonatal_institutional_birth_pct',
  'maternal_neonatal_csection_pct',
  'maternal_neonatal_anc_visits_pct',
  'maternal_neonatal_skilled_birth_pct',
  'maternal_neonatal_care_score',
  'maternal_neonatal_risk',
  'diabetes_care_high_blood_sugar_pct',
  'diabetes_care_risk',
  'hypertension_care_high_bp_pct',
  'hypertension_care_risk',
  'nutrition_services_underweight_pct',
  'nutrition_services_risk',
  'cancer_screening_cervical_pct',
  'cancer_screening_breast_pct',
  'cancer_screening_oral_pct',
  'cancer_screening_score',
  'cancer_screening_risk',
  'overall_care_desert_risk',
];

const columnLabels: Record<string, string> = {
  district_name: 'District',
  state_ut: 'State/UT',
  households_surveyed: 'Households',
  women_15_49_interviewed: 'Women 15-49',
  maternal_neonatal_institutional_birth_pct: 'Institutional Birth %',
  maternal_neonatal_csection_pct: 'C-section %',
  maternal_neonatal_anc_visits_pct: 'ANC Visits %',
  maternal_neonatal_skilled_birth_pct: 'Skilled Birth %',
  maternal_neonatal_care_score: 'Maternal Care Score',
  maternal_neonatal_risk: 'Maternal Risk',
  diabetes_care_high_blood_sugar_pct: 'High Blood Sugar %',
  diabetes_care_risk: 'Diabetes Risk',
  hypertension_care_high_bp_pct: 'High BP %',
  hypertension_care_risk: 'Hypertension Risk',
  nutrition_services_underweight_pct: 'Underweight %',
  nutrition_services_risk: 'Nutrition Risk',
  cancer_screening_cervical_pct: 'Cervical Screen %',
  cancer_screening_breast_pct: 'Breast Screen %',
  cancer_screening_oral_pct: 'Oral Screen %',
  cancer_screening_score: 'Cancer Screen Score',
  cancer_screening_risk: 'Cancer Risk',
  overall_care_desert_risk: 'Overall Risk',
};

const formatValue = (value: string | number | null) => {
  if (value === null) return '';
  if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
  return value.trim();
};

export function LakebasePage() {
  const [rows, setRows] = useState<IndicatorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/care-desert-indicators')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch care desert indicators: ${res.statusText}`);
        return res.json() as Promise<IndicatorRow[]>;
      })
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load care desert indicators'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 w-full max-w-[1440px] mx-auto">
      <div>
        <h2 className="text-3xl font-bold text-foreground">Care Desert Indicators</h2>
        <p className="text-sm text-muted-foreground mt-1">
          databricks_postgres.default.care_desert_indicators_sync
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            databricks_postgres.default.caredesertindicators
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="text-destructive bg-destructive/10 p-3 rounded-md mb-4">
              {error}
            </div>
          )}

          {loading && (
            <div className="space-y-2">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={`skeleton-${i}`} className="h-9 w-full" />
              ))}
            </div>
          )}

          {!loading && rows.length === 0 && (
            <p className="text-muted-foreground text-center py-8">
              No rows returned.
            </p>
          )}

          {!loading && rows.length > 0 && (
            <div className="overflow-auto rounded-md border">
              <table className="w-full min-w-[1800px] border-collapse text-sm">
                <thead className="bg-muted/70">
                  <tr>
                    {columns.map((column) => (
                      <th key={column} className="border-b px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                        {columnLabels[column] ?? column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={`${row.district_name}-${row.state_ut}-${index}`} className="odd:bg-background even:bg-muted/20">
                      {columns.map((column) => (
                        <td key={column} className="border-b px-3 py-2 align-top whitespace-nowrap">
                          {formatValue(row[column])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
