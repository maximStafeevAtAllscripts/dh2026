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
const DISTRICT_CENTER_TABLE = '"default".facility_district_distances_v_sync';
const FACILITY_LOCATION_TABLE = '"default".facility_district_distances_s_v_sync';
const MASTER_TABLE = '"default".healthcare_master_view_v_sync';
const FACILITY_CAPABILITY_TABLE = '"default".facility_capability_v_sync';
const SOURCE_TABLE_LABEL = 'databricks_postgres.default.care_desert_indicators_sync';

const COLUMN_NAMES = [
  'district_name',
  'state_ut',
  'households_surveyed',
  'women_15_49_interviewed',
  'maternal_neonatal_institutional_birth_pct',
  'maternal_neonatal_csection_pct',
  'maternal_neonatal_anc_visits_pct',
  'maternal_neonatal_skilled_birth_pct',
  'maternal_neonatal_access_score',
  'maternal_neonatal_skilled_attendance_gap',
  'maternal_neonatal_csection_access_flag',
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

const COLUMN_METADATA = [
  { name: 'district_name', label: 'District', group: 'Geography' },
  { name: 'state_ut', label: 'State/UT', group: 'Geography' },
  { name: 'households_surveyed', label: 'Households surveyed', group: 'Population' },
  { name: 'women_15_49_interviewed', label: 'Women 15-49 interviewed', group: 'Population' },
  { name: 'maternal_neonatal_institutional_birth_pct', label: 'Institutional birth %', group: 'Maternal and neonatal access' },
  { name: 'maternal_neonatal_csection_pct', label: 'C-section %', group: 'Maternal and neonatal access' },
  { name: 'maternal_neonatal_anc_visits_pct', label: 'ANC visits %', group: 'Maternal and neonatal access' },
  { name: 'maternal_neonatal_skilled_birth_pct', label: 'Skilled birth %', group: 'Maternal and neonatal access' },
  { name: 'maternal_neonatal_access_score', label: 'Maternal access score', group: 'Maternal and neonatal access' },
  { name: 'maternal_neonatal_skilled_attendance_gap', label: 'Skilled attendance gap', group: 'Maternal and neonatal access' },
  { name: 'maternal_neonatal_csection_access_flag', label: 'C-section access flag', group: 'Maternal and neonatal access' },
  { name: 'maternal_neonatal_risk', label: 'Maternal risk', group: 'Maternal and neonatal access' },
  { name: 'diabetes_care_high_blood_sugar_pct', label: 'High blood sugar %', group: 'Chronic disease' },
  { name: 'diabetes_care_risk', label: 'Diabetes risk', group: 'Chronic disease' },
  { name: 'hypertension_care_high_bp_pct', label: 'High BP %', group: 'Chronic disease' },
  { name: 'hypertension_care_risk', label: 'Hypertension risk', group: 'Chronic disease' },
  { name: 'nutrition_services_underweight_pct', label: 'Underweight %', group: 'Nutrition' },
  { name: 'nutrition_services_risk', label: 'Nutrition risk', group: 'Nutrition' },
  { name: 'cancer_screening_cervical_pct', label: 'Cervical screening %', group: 'Cancer screening' },
  { name: 'cancer_screening_breast_pct', label: 'Breast screening %', group: 'Cancer screening' },
  { name: 'cancer_screening_oral_pct', label: 'Oral screening %', group: 'Cancer screening' },
  { name: 'cancer_screening_score', label: 'Cancer screening score', group: 'Cancer screening' },
  { name: 'cancer_screening_risk', label: 'Cancer risk', group: 'Cancer screening' },
  { name: 'overall_care_desert_risk', label: 'Overall care desert risk', group: 'Priority' },
];

const riskWeight: Record<string, number> = {
  'High Risk': 3,
  'Medium Risk': 2,
  'Low Risk': 1,
};

const riskFields = [
  'maternal_neonatal_risk',
  'diabetes_care_risk',
  'hypertension_care_risk',
  'nutrition_services_risk',
  'cancer_screening_risk',
  'overall_care_desert_risk',
];

const riskAccessDistanceFields: Record<string, string | null> = {
  maternal_neonatal_risk: 'closest_maternal_facility_km',
  diabetes_care_risk: 'closest_diabetes_facility_km',
  hypertension_care_risk: 'closest_hypertension_facility_km',
  nutrition_services_risk: 'closest_nutrition_facility_km',
  cancer_screening_risk: 'closest_cancer_facility_km',
  overall_care_desert_risk: null,
};

const capabilityColumns: Record<string, string | null> = {
  overall: null,
  maternal: 'maternal_neonatal_capability',
  diabetes: 'diabetes_capability',
  hypertension: 'hypertension_capability',
  nutrition: 'nutrition_capability',
  cancer: 'cancer_screening_capability',
};

const overallCapabilitySql = `CASE
  WHEN c.maternal_neonatal_capability = 'capable'
    OR c.diabetes_capability = 'capable'
    OR c.hypertension_capability = 'capable'
    OR c.nutrition_capability = 'capable'
    OR c.cancer_screening_capability = 'capable'
    THEN 'capable'
  WHEN c.maternal_neonatal_capability = 'limited'
    OR c.diabetes_capability = 'limited'
    OR c.hypertension_capability = 'limited'
    OR c.nutrition_capability = 'limited'
    OR c.cancer_screening_capability = 'limited'
    THEN 'limited'
  WHEN c.maternal_neonatal_capability = 'not_capable'
    OR c.diabetes_capability = 'not_capable'
    OR c.hypertension_capability = 'not_capable'
    OR c.nutrition_capability = 'not_capable'
    OR c.cancer_screening_capability = 'not_capable'
    THEN 'not_capable'
  ELSE 'unknown'
END`;

const confidenceColumns: Record<string, string | null> = {
  overall: 'data_confidence',
  maternal: 'maternal_neonatal_confidence',
  diabetes: 'diabetes_confidence',
  hypertension: 'hypertension_confidence',
  nutrition: 'nutrition_confidence',
  cancer: 'cancer_screening_confidence',
};

const evidenceColumns: Record<string, string | null> = {
  overall: 'data_confidence_reason',
  maternal: 'maternal_neonatal_evidence',
  diabetes: 'diabetes_evidence',
  hypertension: 'hypertension_evidence',
  nutrition: 'nutrition_evidence',
  cancer: 'cancer_screening_evidence',
};

const CALCULATED_DISTANCE_KM_SQL = `
  2 * 6371 * ASIN(
    LEAST(
      1,
      SQRT(
        POWER(SIN(RADIANS((d.facility_latitude - d.center_latitude) / 2)), 2)
        + COS(RADIANS(d.center_latitude))
        * COS(RADIANS(d.facility_latitude))
        * POWER(SIN(RADIANS((d.facility_longitude - d.center_longitude) / 2)), 2)
      )
    )
  )
`;

const CALCULATED_LOCATION_TO_DISTRICT_KM_SQL = `
  2 * 6371 * ASIN(
    LEAST(
      1,
      SQRT(
        POWER(SIN(RADIANS((f.facility_latitude - g.latitude) / 2)), 2)
        + COS(RADIANS(g.latitude))
        * COS(RADIANS(f.facility_latitude))
        * POWER(SIN(RADIANS((f.facility_longitude - g.longitude) / 2)), 2)
      )
    )
  )
`;

function getNumber(row: Record<string, unknown>, field: string) {
  const value = row[field];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function getOptionalNumber(row: Record<string, unknown>, field: string) {
  const value = row[field];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getString(row: Record<string, unknown>, field: string) {
  const value = row[field];
  return typeof value === 'string' ? value.trim() : '';
}

function getNearestListedCapableFacilityKm(row: Record<string, unknown>) {
  const facilities = row.capable_facilities;
  if (!Array.isArray(facilities)) return null;
  const distances = facilities
    .map((facility) => {
      if (!facility || typeof facility !== 'object') return null;
      const distance = (facility as Record<string, unknown>).distance_kilometers;
      if (typeof distance === 'number' && Number.isFinite(distance)) return distance;
      if (typeof distance === 'string' && distance.trim()) {
        const parsed = Number(distance);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    })
    .filter((distance): distance is number => distance !== null);
  return distances.length > 0 ? Math.min(...distances) : null;
}

function getClosestCapableFacilityKm(row: Record<string, unknown>, riskField: string) {
  const distanceField = riskAccessDistanceFields[riskField];
  if (distanceField) return getOptionalNumber(row, distanceField);

  const serviceDistances = Object.values(riskAccessDistanceFields)
    .filter((field): field is string => Boolean(field))
    .map((field) => getOptionalNumber(row, field))
    .filter((distance): distance is number => distance !== null);
  const listedDistance = getNearestListedCapableFacilityKm(row);
  if (listedDistance !== null) serviceDistances.push(listedDistance);
  return serviceDistances.length > 0 ? Math.min(...serviceDistances) : null;
}

function getPlanningAccessDistanceKm(row: Record<string, unknown>) {
  const listedDistance = getNearestListedCapableFacilityKm(row);
  return listedDistance ?? getClosestCapableFacilityKm(row, 'overall_care_desert_risk');
}

function getAccessAdjustedRiskWeight(row: Record<string, unknown>, riskField: string) {
  const baseWeight = riskWeight[getString(row, riskField)] ?? 0;
  if (baseWeight === 0) return 0;

  const closestCapableFacilityKm = getClosestCapableFacilityKm(row, riskField);
  if (closestCapableFacilityKm === null) return baseWeight;
  if (closestCapableFacilityKm <= 10) return Math.min(baseWeight, 1);
  if (closestCapableFacilityKm <= 25) return Math.max(1, baseWeight - 1);
  return baseWeight;
}

function getAccessDistancePenalty(row: Record<string, unknown>) {
  const closestCapableFacilityKm = getPlanningAccessDistanceKm(row);
  if (closestCapableFacilityKm === null) return 2;
  if (closestCapableFacilityKm > 100) return 3;
  if (closestCapableFacilityKm > 60) return 2;
  if (closestCapableFacilityKm > 25) return 1;
  return 0;
}

function getRiskScore(row: Record<string, unknown>) {
  return riskFields.reduce((score, field) => score + getAccessAdjustedRiskWeight(row, field), 0) + getAccessDistancePenalty(row);
}

function getPriorityTier(row: Record<string, unknown>, riskScore: number) {
  const closestCapableFacilityKm = getPlanningAccessDistanceKm(row);
  if (riskScore >= 14) return 'Urgent';
  if (riskScore >= 11) return 'High';
  if (riskScore >= 8) return closestCapableFacilityKm !== null && closestCapableFacilityKm > 100 ? 'High' : 'Watch';
  if (closestCapableFacilityKm === null || closestCapableFacilityKm > 60) return 'Watch';
  return 'Monitor';
}

function getRiskDrivers(row: Record<string, unknown>) {
  return riskFields
    .filter((field) => getString(row, field) === 'High Risk')
    .map((field) => COLUMN_METADATA.find((column) => column.name === field)?.label ?? field);
}

function getIntervention(row: Record<string, unknown>) {
  const sourcePriority = getString(row, 'intervention_priority');
  const drivers = getRiskDrivers(row);
  if (sourcePriority === 'Low Priority') return 'Monitor current access and preserve baseline service capacity';
  if (drivers.some((driver) => driver.includes('Cancer'))) return 'Expand cancer screening outreach and referral follow-up';
  if (drivers.some((driver) => driver.includes('Hypertension') || driver.includes('Diabetes'))) return 'Strengthen NCD screening, medication access, and follow-up';
  if (drivers.some((driver) => driver.includes('Nutrition'))) return 'Target nutrition services and community outreach';
  if (drivers.some((driver) => driver.includes('Maternal'))) return 'Improve maternal referral readiness and skilled attendance coverage';
  return 'Monitor indicators and sustain existing access capacity';
}

function getPercentText(row: Record<string, unknown>, field: string) {
  return `${getNumber(row, field).toFixed(1)}%`;
}

function getKmText(row: Record<string, unknown>, field: string) {
  const value = getNumber(row, field);
  return value > 0 ? `${value.toFixed(1)} km` : '';
}

function getSpecificRiskFields(row: Record<string, unknown>, riskLevel: 'High Risk' | 'Medium Risk') {
  return riskFields.filter((field) => field !== 'overall_care_desert_risk' && getString(row, field) === riskLevel);
}

function getServiceGapSummary(row: Record<string, unknown>) {
  const driverFields = getSpecificRiskFields(row, 'High Risk');
  const fallbackDriverFields = driverFields.length > 0 ? driverFields : getSpecificRiskFields(row, 'Medium Risk');
  const summaries = fallbackDriverFields.map((field) => {
    if (field === 'maternal_neonatal_risk') {
      const csectionFlag = getString(row, 'maternal_neonatal_csection_access_flag') || 'no C-section signal';
      return `maternal access shows ${getPercentText(row, 'maternal_neonatal_institutional_birth_pct')} institutional births and ${getPercentText(row, 'maternal_neonatal_skilled_birth_pct')} skilled attendance; C-section signal is ${csectionFlag.toLowerCase()}`;
    }
    if (field === 'diabetes_care_risk') {
      const closestFacility = getKmText(row, 'closest_diabetes_facility_km');
      return `diabetes burden is elevated, with ${getPercentText(row, 'diabetes_care_high_blood_sugar_pct')} reporting high blood sugar${closestFacility ? ` and the closest capable facility about ${closestFacility} away` : ''}`;
    }
    if (field === 'hypertension_care_risk') {
      const closestFacility = getKmText(row, 'closest_hypertension_facility_km');
      return `hypertension burden is elevated, with ${getPercentText(row, 'hypertension_care_high_bp_pct')} reporting high blood pressure${closestFacility ? ` and the closest capable facility about ${closestFacility} away` : ''}`;
    }
    if (field === 'nutrition_services_risk') {
      const closestFacility = getKmText(row, 'closest_nutrition_facility_km');
      return `nutrition need is elevated, with ${getPercentText(row, 'nutrition_services_underweight_pct')} underweight${closestFacility ? ` and the closest capable facility about ${closestFacility} away` : ''}`;
    }
    if (field === 'cancer_screening_risk') {
      const closestFacility = getKmText(row, 'closest_cancer_facility_km');
      return `cancer screening is very low: ${getPercentText(row, 'cancer_screening_cervical_pct')} cervical, ${getPercentText(row, 'cancer_screening_breast_pct')} breast, and ${getPercentText(row, 'cancer_screening_oral_pct')} oral screening${closestFacility ? `; closest capable facility about ${closestFacility} away` : ''}`;
    }
    return '';
  }).filter(Boolean);

  if (summaries.length > 0) return `Top service gaps: ${summaries.slice(0, 3).join('; ')}.`;

  const facilitiesWithin30Km = getNumber(row, 'facilities_within_30km');
  const availabilityCategory = getString(row, 'overall_availability_category') || 'availability unknown';
  return `No high-risk service driver is flagged; current availability is ${availabilityCategory.toLowerCase()} with ${facilitiesWithin30Km.toLocaleString()} facilities within 30 km.`;
}

function addPlanningFields(row: Record<string, unknown>) {
  const riskScore = getRiskScore(row);
  const riskDrivers = getRiskDrivers(row);
  const affectedPopulationProxy = Math.round(
    getNumber(row, 'estimated_population_impact') || getNumber(row, 'households_surveyed') + getNumber(row, 'women_15_49_interviewed'),
  );
  const facilityCount = getNumber(row, 'total_facilities');
  const confidenceScore = Math.min(100, Math.round(((affectedPopulationProxy / 2000) * 70) + Math.min(facilityCount, 300) / 10));
  const priorityTier = getPriorityTier(row, riskScore);

  return {
    ...row,
    district_name: getString(row, 'district_name'),
    state_ut: getString(row, 'state_ut'),
    planning_priority_score: riskScore,
    planning_priority_tier: priorityTier,
    primary_risk_driver: riskDrivers[0] ?? 'No high-risk driver',
    risk_driver_count: riskDrivers.length,
    affected_population_proxy: affectedPopulationProxy,
    recommended_intervention: getIntervention(row),
    data_confidence_score: confidenceScore,
    service_gap_summary: getServiceGapSummary(row),
  };
}

export async function setupCareDesertIndicatorRoutes(appkit: AppKitWithLakebase) {
  appkit.server.extend((app) => {
    app.get('/api/care-desert-indicators/nearest-facilities', async (req, res) => {
      try {
        const district = typeof req.query.district === 'string' ? req.query.district.trim() : '';
        const state = typeof req.query.state === 'string' ? req.query.state.trim() : '';
        const category = typeof req.query.category === 'string' ? req.query.category : 'overall';
        const capabilityColumn = capabilityColumns[category] ?? null;
        const confidenceColumn = confidenceColumns[category] ?? 'data_confidence';
        const evidenceColumn = evidenceColumns[category] ?? 'data_confidence_reason';

        if (!district || !state) {
          res.status(400).json({ error: 'district and state are required' });
          return;
        }

        const capabilitySelect = capabilityColumn
          ? `c.${capabilityColumn} AS category_capability`
          : `${overallCapabilitySql} AS category_capability`;
        const confidenceSelect = confidenceColumn
          ? `c.${confidenceColumn} AS category_confidence`
          : `c.data_confidence AS category_confidence`;
        const evidenceSelect = evidenceColumn
          ? `c.${evidenceColumn} AS category_evidence`
          : `c.data_confidence_reason AS category_evidence`;
        const capabilityFilter = capabilityColumn
          ? `AND c.${capabilityColumn} = 'capable'`
          : `AND ${overallCapabilitySql} = 'capable'`;
        const baseQuery = `WITH district_center AS (
             SELECT
               AVG(center_latitude) AS center_latitude,
               AVG(center_longitude) AS center_longitude
             FROM ${DISTRICT_CENTER_TABLE}
             WHERE UPPER(TRIM(district)) = UPPER(TRIM($1))
               AND UPPER(TRIM(statename)) = UPPER(TRIM($2))
               AND center_latitude IS NOT NULL
               AND center_longitude IS NOT NULL
           ), facility_distances AS (
             SELECT
               f.unique_id,
               f.name,
               f.address_city,
               f."address_stateOrRegion",
               f.facility_latitude,
               f.facility_longitude,
               dc.center_latitude,
               dc.center_longitude
             FROM ${FACILITY_LOCATION_TABLE} f
             CROSS JOIN district_center dc
             WHERE f.facility_latitude IS NOT NULL
               AND f.facility_longitude IS NOT NULL
               AND dc.center_latitude IS NOT NULL
               AND dc.center_longitude IS NOT NULL
           )
           SELECT
             d.unique_id,
             d.name,
             d.address_city,
             d."address_stateOrRegion",
             d.facility_latitude,
             d.facility_longitude,
             d.center_latitude,
             d.center_longitude,
             ${CALCULATED_DISTANCE_KM_SQL} AS distance_kilometers,
             'calculated_from_coordinates' AS distance_source,
             ${capabilitySelect},
             ${confidenceSelect},
             ${evidenceSelect},
             c.description,
             c.specialties,
             c.equipment,
             c.procedure,
             c.capability,
             c.data_confidence,
             c.data_confidence_reason
           FROM facility_distances d
           LEFT JOIN ${FACILITY_CAPABILITY_TABLE} c
             ON c.unique_id = d.unique_id
           WHERE TRUE`;

        const matchingResult = await appkit.lakebase.query(
          `${baseQuery}
             ${capabilityFilter}
           ORDER BY distance_kilometers ASC
           LIMIT 3`,
          [district, state],
        );
        const fallbackResult = capabilityColumn || matchingResult.rows.length > 0
          ? matchingResult
          : await appkit.lakebase.query(
          `WITH district_center AS (
             SELECT
               AVG(center_latitude) AS center_latitude,
               AVG(center_longitude) AS center_longitude
             FROM ${DISTRICT_CENTER_TABLE}
             WHERE UPPER(TRIM(district)) = UPPER(TRIM($1))
               AND UPPER(TRIM(statename)) = UPPER(TRIM($2))
               AND center_latitude IS NOT NULL
               AND center_longitude IS NOT NULL
           ), facility_distances AS (
             SELECT
               f.unique_id,
               f.name,
               f.address_city,
               f."address_stateOrRegion",
               f.facility_latitude,
               f.facility_longitude,
               dc.center_latitude,
               dc.center_longitude
             FROM ${FACILITY_LOCATION_TABLE} f
             CROSS JOIN district_center dc
             WHERE f.facility_latitude IS NOT NULL
               AND f.facility_longitude IS NOT NULL
               AND dc.center_latitude IS NOT NULL
               AND dc.center_longitude IS NOT NULL
           )
           SELECT
             d.unique_id,
             d.name,
             d.address_city,
             d."address_stateOrRegion",
             d.facility_latitude,
             d.facility_longitude,
             d.center_latitude,
             d.center_longitude,
             ${CALCULATED_DISTANCE_KM_SQL} AS distance_kilometers,
             'calculated_from_coordinates' AS distance_source,
             ${overallCapabilitySql} AS category_capability,
             c.data_confidence AS category_confidence,
             c.data_confidence_reason AS category_evidence,
             c.description,
             c.specialties,
             c.equipment,
             c.procedure,
             c.capability,
             c.data_confidence,
             c.data_confidence_reason
           FROM facility_distances d
           LEFT JOIN ${FACILITY_CAPABILITY_TABLE} c
             ON c.unique_id = d.unique_id
           ORDER BY distance_kilometers ASC
           LIMIT 3`,
          [district, state],
        );

        res.json({
          district,
          state,
          category,
          matchedCapability: matchingResult.rows.length > 0,
          facilities: fallbackResult.rows,
        });
      } catch (err) {
        console.error('Failed to list nearest facilities:', err);
        res.status(500).json({ error: 'Failed to list nearest facilities' });
      }
    });

    app.get('/api/care-desert-indicators', async (_req, res) => {
      try {
        const [rowsResult, countResult] = await Promise.all([
          appkit.lakebase.query(
            `WITH district_geo AS (
               SELECT
                 UPPER(TRIM(district)) AS district_key,
                 UPPER(TRIM(statename)) AS state_key,
                 AVG(center_latitude) AS latitude,
                 AVG(center_longitude) AS longitude,
                 COUNT(*)::int AS facility_links
               FROM ${DISTRICT_CENTER_TABLE}
               WHERE center_latitude IS NOT NULL AND center_longitude IS NOT NULL
               GROUP BY UPPER(TRIM(district)), UPPER(TRIM(statename))
             ), master AS (
               SELECT DISTINCT ON (UPPER(TRIM(district_name)), UPPER(TRIM(state_ut)))
                 UPPER(TRIM(district_name)) AS district_key,
                 UPPER(TRIM(state_ut)) AS state_key,
                 total_facilities::int AS total_facilities,
                 facilities_within_30km::int AS facilities_within_30km,
                 facilities_within_60km::int AS facilities_within_60km,
                 closest_maternal_facility_km,
                 closest_diabetes_facility_km,
                 closest_hypertension_facility_km,
                 closest_nutrition_facility_km,
                 closest_cancer_facility_km,
                 overall_availability_score::float8 AS overall_availability_score,
                 overall_availability_category,
                 intervention_priority,
                 estimated_population_impact
               FROM ${MASTER_TABLE}
               ORDER BY UPPER(TRIM(district_name)), UPPER(TRIM(state_ut))
             ), facility_locations AS (
               SELECT
                 f.unique_id,
                 f.name,
                 f.facility_latitude,
                 f.facility_longitude,
                 c.maternal_neonatal_capability,
                 c.diabetes_capability,
                 c.hypertension_capability,
                 c.nutrition_capability,
                 c.cancer_screening_capability
               FROM ${FACILITY_LOCATION_TABLE} f
               LEFT JOIN ${FACILITY_CAPABILITY_TABLE} c
                 ON c.unique_id = f.unique_id
               WHERE f.facility_latitude IS NOT NULL
                 AND f.facility_longitude IS NOT NULL
             ), capable_facilities AS (
               SELECT
                 g.district_key,
                 g.state_key,
                 COALESCE(overall.facilities, '[]'::jsonb) AS capable_facilities,
                 COALESCE(maternal.facilities, '[]'::jsonb) AS maternal_capable_facilities,
                 COALESCE(diabetes.facilities, '[]'::jsonb) AS diabetes_capable_facilities,
                 COALESCE(hypertension.facilities, '[]'::jsonb) AS hypertension_capable_facilities,
                 COALESCE(nutrition.facilities, '[]'::jsonb) AS nutrition_capable_facilities,
                 COALESCE(cancer.facilities, '[]'::jsonb) AS cancer_capable_facilities,
                 (maternal.facilities->0->>'distance_kilometers')::float8 AS closest_maternal_facility_km,
                 (diabetes.facilities->0->>'distance_kilometers')::float8 AS closest_diabetes_facility_km,
                 (hypertension.facilities->0->>'distance_kilometers')::float8 AS closest_hypertension_facility_km,
                 (nutrition.facilities->0->>'distance_kilometers')::float8 AS closest_nutrition_facility_km,
                 (cancer.facilities->0->>'distance_kilometers')::float8 AS closest_cancer_facility_km
               FROM district_geo g
               LEFT JOIN LATERAL (
                 SELECT jsonb_agg(jsonb_build_object('name', name, 'distance_kilometers', distance_kilometers) ORDER BY distance_kilometers) AS facilities
                 FROM (
                   SELECT f.name, ${CALCULATED_LOCATION_TO_DISTRICT_KM_SQL} AS distance_kilometers
                   FROM facility_locations f
                   WHERE f.maternal_neonatal_capability = 'capable'
                      OR f.diabetes_capability = 'capable'
                      OR f.hypertension_capability = 'capable'
                      OR f.nutrition_capability = 'capable'
                      OR f.cancer_screening_capability = 'capable'
                   ORDER BY distance_kilometers
                   LIMIT 3
                 ) ranked
               ) overall ON TRUE
               LEFT JOIN LATERAL (
                 SELECT jsonb_agg(jsonb_build_object('name', name, 'distance_kilometers', distance_kilometers) ORDER BY distance_kilometers) AS facilities
                 FROM (
                   SELECT f.name, ${CALCULATED_LOCATION_TO_DISTRICT_KM_SQL} AS distance_kilometers
                   FROM facility_locations f
                   WHERE f.maternal_neonatal_capability = 'capable'
                   ORDER BY distance_kilometers
                   LIMIT 3
                 ) ranked
               ) maternal ON TRUE
               LEFT JOIN LATERAL (
                 SELECT jsonb_agg(jsonb_build_object('name', name, 'distance_kilometers', distance_kilometers) ORDER BY distance_kilometers) AS facilities
                 FROM (
                   SELECT f.name, ${CALCULATED_LOCATION_TO_DISTRICT_KM_SQL} AS distance_kilometers
                   FROM facility_locations f
                   WHERE f.diabetes_capability = 'capable'
                   ORDER BY distance_kilometers
                   LIMIT 3
                 ) ranked
               ) diabetes ON TRUE
               LEFT JOIN LATERAL (
                 SELECT jsonb_agg(jsonb_build_object('name', name, 'distance_kilometers', distance_kilometers) ORDER BY distance_kilometers) AS facilities
                 FROM (
                   SELECT f.name, ${CALCULATED_LOCATION_TO_DISTRICT_KM_SQL} AS distance_kilometers
                   FROM facility_locations f
                   WHERE f.hypertension_capability = 'capable'
                   ORDER BY distance_kilometers
                   LIMIT 3
                 ) ranked
               ) hypertension ON TRUE
               LEFT JOIN LATERAL (
                 SELECT jsonb_agg(jsonb_build_object('name', name, 'distance_kilometers', distance_kilometers) ORDER BY distance_kilometers) AS facilities
                 FROM (
                   SELECT f.name, ${CALCULATED_LOCATION_TO_DISTRICT_KM_SQL} AS distance_kilometers
                   FROM facility_locations f
                   WHERE f.nutrition_capability = 'capable'
                   ORDER BY distance_kilometers
                   LIMIT 3
                 ) ranked
               ) nutrition ON TRUE
               LEFT JOIN LATERAL (
                 SELECT jsonb_agg(jsonb_build_object('name', name, 'distance_kilometers', distance_kilometers) ORDER BY distance_kilometers) AS facilities
                 FROM (
                   SELECT f.name, ${CALCULATED_LOCATION_TO_DISTRICT_KM_SQL} AS distance_kilometers
                   FROM facility_locations f
                   WHERE f.cancer_screening_capability = 'capable'
                   ORDER BY distance_kilometers
                   LIMIT 3
                 ) ranked
               ) cancer ON TRUE
             )
             SELECT
               ${COLUMN_NAMES.map((column) => `c.${column}`).join(',\n               ')},
               g.latitude,
               g.longitude,
               g.facility_links,
               m.total_facilities,
               m.facilities_within_30km,
               m.facilities_within_60km,
               COALESCE(cf.closest_maternal_facility_km, m.closest_maternal_facility_km) AS closest_maternal_facility_km,
               COALESCE(cf.closest_diabetes_facility_km, m.closest_diabetes_facility_km) AS closest_diabetes_facility_km,
               COALESCE(cf.closest_hypertension_facility_km, m.closest_hypertension_facility_km) AS closest_hypertension_facility_km,
               COALESCE(cf.closest_nutrition_facility_km, m.closest_nutrition_facility_km) AS closest_nutrition_facility_km,
               COALESCE(cf.closest_cancer_facility_km, m.closest_cancer_facility_km) AS closest_cancer_facility_km,
               m.overall_availability_score,
               m.overall_availability_category,
               m.intervention_priority,
               m.estimated_population_impact,
               COALESCE(cf.capable_facilities, '[]'::jsonb) AS capable_facilities,
               COALESCE(cf.maternal_capable_facilities, '[]'::jsonb) AS maternal_capable_facilities,
               COALESCE(cf.diabetes_capable_facilities, '[]'::jsonb) AS diabetes_capable_facilities,
               COALESCE(cf.hypertension_capable_facilities, '[]'::jsonb) AS hypertension_capable_facilities,
               COALESCE(cf.nutrition_capable_facilities, '[]'::jsonb) AS nutrition_capable_facilities,
               COALESCE(cf.cancer_capable_facilities, '[]'::jsonb) AS cancer_capable_facilities
             FROM ${SOURCE_TABLE} c
             LEFT JOIN district_geo g
               ON UPPER(TRIM(c.district_name)) = g.district_key
              AND UPPER(TRIM(c.state_ut)) = g.state_key
             LEFT JOIN master m
               ON UPPER(TRIM(c.district_name)) = m.district_key
              AND UPPER(TRIM(c.state_ut)) = m.state_key
             LEFT JOIN capable_facilities cf
               ON UPPER(TRIM(c.district_name)) = cf.district_key
              AND UPPER(TRIM(c.state_ut)) = cf.state_key
             ORDER BY c.state_ut, c.district_name
             LIMIT 500`,
          ),
          appkit.lakebase.query(`SELECT COUNT(*)::int AS row_count FROM ${SOURCE_TABLE}`),
        ]);

        res.json({
          sourceTable: SOURCE_TABLE_LABEL,
          mapSourceTables: [
            'databricks_postgres.default.facility_district_distances_v_sync',
            'databricks_postgres.default.facility_district_distances_s_v_sync',
            'databricks_postgres.default.healthcare_master_view_v_sync',
          ],
          rowCount: countResult.rows[0]?.row_count ?? rowsResult.rows.length,
          columns: COLUMN_METADATA,
          rows: rowsResult.rows.map(addPlanningFields),
        });
      } catch (err) {
        console.error('Failed to list care desert indicators:', err);
        res.status(500).json({ error: 'Failed to list care desert indicators' });
      }
    });
  });
}