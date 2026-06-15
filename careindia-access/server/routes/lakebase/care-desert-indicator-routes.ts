import { Application } from 'express';

interface AppKitWithLakebase {
  lakebase: {
    query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  };
  server: {
    extend(fn: (app: Application) => void): void;
  };
}

const SOURCE_TABLE = '"default".care_desert_indicators_sync';

const INDICATOR_COLUMNS = `
  district_name,
  state_ut,
  households_surveyed,
  women_15_49_interviewed,
  maternal_neonatal_institutional_birth_pct,
  maternal_neonatal_csection_pct,
  maternal_neonatal_anc_visits_pct,
  maternal_neonatal_skilled_birth_pct,
  maternal_neonatal_care_score,
  maternal_neonatal_risk,
  diabetes_care_high_blood_sugar_pct,
  diabetes_care_risk,
  hypertension_care_high_bp_pct,
  hypertension_care_risk,
  nutrition_services_underweight_pct,
  nutrition_services_risk,
  cancer_screening_cervical_pct,
  cancer_screening_breast_pct,
  cancer_screening_oral_pct,
  cancer_screening_score,
  cancer_screening_risk,
  overall_care_desert_risk
`;

export function setupCareDesertIndicatorRoutes(appkit: AppKitWithLakebase) {
  appkit.server.extend((app) => {
    app.get('/api/care-desert-indicators', async (_req, res) => {
      try {
        const result = await appkit.lakebase.query(
          `SELECT ${INDICATOR_COLUMNS}
           FROM ${SOURCE_TABLE}
           ORDER BY state_ut, district_name
           LIMIT 500`,
        );
        res.json(result.rows);
      } catch (err) {
        console.error('Failed to list care desert indicators:', err);
        res.status(500).json({ error: 'Failed to list care desert indicators' });
      }
    });
  });
}