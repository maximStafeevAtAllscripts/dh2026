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
const SOURCE_TABLE2 = '"default".care_desert_indicators_sync';

const INDICATOR_COLUMNS = `
  i1.district_name,
  i1.state_ut,
  i1.households_surveyed,
  i1.women_15_49_interviewed,
  i1.maternal_neonatal_institutional_birth_pct,
  i1.maternal_neonatal_csection_pct,
  i1.maternal_neonatal_anc_visits_pct,
  i1.maternal_neonatal_skilled_birth_pct,
  i1.maternal_neonatal_access_score,
  i1.maternal_neonatal_skilled_attendance_gap,
  i1.maternal_neonatal_csection_access_flag,
  i1.maternal_neonatal_risk,
  i1.diabetes_care_high_blood_sugar_pct,
  i1.diabetes_care_risk,
  i1.hypertension_care_high_bp_pct,
  i1.hypertension_care_risk,
  i1.nutrition_services_underweight_pct,
  i1.nutrition_services_risk,
  i1.cancer_screening_cervical_pct,
  i1.cancer_screening_breast_pct,
  i1.cancer_screening_oral_pct,
  i1.cancer_screening_score,
  i1.cancer_screening_risk,
  i1.overall_care_desert_risk
`;

export function setupCareDesertIndicatorRoutes(appkit: AppKitWithLakebase) {
  appkit.server.extend((app) => {
    app.get('/api/care-desert-indicators', async (_req, res) => {
      try {
        const result = await appkit.lakebase.query(
          `SELECT ${INDICATOR_COLUMNS}, i2.intervention_priority, i2.estimated_population_impact
           FROM ${SOURCE_TABLE} i1 inner join ${SOURCE_TABLE2} i2
             on i1.state_ut = i2.state_ut and i1.district_name = i2.district_name
           WHERE i1.overall_care_desert_risk IS NOT NULL
           ORDER BY i1.state_ut, i1.district_name
           `,
          //  LIMIT 500
        );
        res.json(result.rows);
      } catch (err) {
        console.error('Failed to list care desert indicators:', err);
        res.status(500).json({ error: 'Failed to list care desert indicators' });
      }
    });
  });
}