import {
  Card,
  CardContent,
  Input,
  Skeleton,
} from '@databricks/appkit-ui/react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Feature, FeatureCollection, LineString, MultiPolygon, Point, Polygon } from 'geojson';
import { AlertTriangle, Database, Loader2, MapPin, Route, Target } from 'lucide-react';

interface CapableFacilitySummary {
  name: string;
  distance_kilometers: number;
}

type CellValue = string | number | null | CapableFacilitySummary[];
type PriorityTier = 'Urgent' | 'High' | 'Watch' | 'Monitor';
type RiskCategoryId = 'overall' | 'maternal' | 'diabetes' | 'hypertension' | 'nutrition' | 'cancer';

interface ColumnDefinition {
  name: string;
  label: string;
  group: string;
}

interface IndicatorRow {
  [key: string]: CellValue;
  district_name: string;
  state_ut: string;
  households_surveyed: number | null;
  women_15_49_interviewed: number | null;
  overall_care_desert_risk: string | null;
  maternal_neonatal_csection_access_flag: string | null;
  latitude: number | null;
  longitude: number | null;
  total_facilities: number | null;
  facilities_within_30km: number | null;
  facilities_within_60km: number | null;
  intervention_priority: string | null;
  estimated_population_impact: number | null;
  overall_availability_category: string | null;
  overall_availability_score: number | null;
  planning_priority_score: number;
  planning_priority_tier: PriorityTier;
  primary_risk_driver: string;
  risk_driver_count: number;
  affected_population_proxy: number;
  recommended_intervention: string;
  data_confidence_score: number;
  service_gap_summary: string;
  capable_facilities: CapableFacilitySummary[] | null;
  maternal_capable_facilities: CapableFacilitySummary[] | null;
  diabetes_capable_facilities: CapableFacilitySummary[] | null;
  hypertension_capable_facilities: CapableFacilitySummary[] | null;
  nutrition_capable_facilities: CapableFacilitySummary[] | null;
  cancer_capable_facilities: CapableFacilitySummary[] | null;
}

interface IndicatorResponse {
  sourceTable: string;
  mapSourceTables?: string[];
  rowCount: number;
  columns: ColumnDefinition[];
  rows: IndicatorRow[];
}

interface MapProperties {
  key: string;
  district: string;
  state: string;
  interventionPriority: string;
  interventionLevel: 'Urgent' | 'High' | 'Watch' | 'Low' | 'Unreported';
  planningTier: PriorityTier;
  population: number;
  priorityScore: number;
  riskWeight: number;
  primaryRiskDriver: string;
  capableFacilitiesJson: string;
  capableFacilitiesLabel: string;
  isReported: boolean;
}

interface BoundarySourceProperties {
  NAME_1?: string;
  NAME_2?: string;
}

interface BoundaryProperties extends MapProperties {
  boundaryDistrict: string;
  boundaryState: string;
}

interface NearestFacility {
  unique_id: string;
  name: string;
  address_city: string | null;
  address_stateOrRegion: string | null;
  facility_latitude: number;
  facility_longitude: number;
  center_latitude: number;
  center_longitude: number;
  distance_kilometers: number;
  category_capability: string;
  category_confidence: string | null;
  category_evidence: string | null;
  description: string | null;
  specialties: string | null;
  equipment: string | null;
  procedure: string | null;
  capability: string | null;
  data_confidence: string | null;
  data_confidence_reason: string | null;
}

interface FacilityLineProperties {
  id: string;
  name: string;
  distanceLabel: string;
}

interface FacilityPointProperties extends FacilityLineProperties {
  labelName: string;
  capability: string;
  confidence: string;
  evidence: string;
  city: string;
  state: string;
  description: string;
  specialties: string;
  equipment: string;
  procedure: string;
}

interface DistrictCenterProperties {
  key: string;
  district: string;
}

const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || 'pk.eyJ1IjoiemFjaG80MCIsImEiOiJjbHQxc2xndDgxZ3BhMmxtbnA4YjBjdnZiIn0.amNorA7xEmc7uXTiL3RSAQ';
const DISTRICT_BOUNDARY_GEOJSON_URL = 'https://raw.githubusercontent.com/geohacker/india/master/district/india_district.geojson';
const INDIA_MAP_CENTER: [number, number] = [78.9629, 22.5937];
const INDIA_MAP_ZOOM = 3.1;

const priorityRank: Record<PriorityTier, number> = {
  Urgent: 4,
  High: 3,
  Watch: 2,
  Monitor: 1,
};

const priorityStyles: Record<PriorityTier, string> = {
  Urgent: 'border-red-200 bg-red-50 text-red-800 shadow-sm',
  High: 'border-orange-200 bg-orange-50 text-orange-800 shadow-sm',
  Watch: 'border-slate-300 bg-slate-100 text-slate-700 shadow-sm',
  Monitor: 'border-emerald-200 bg-emerald-50 text-emerald-800 shadow-sm',
};

const interventionHeatmapLayers = [
  { level: 'Low', color: '#16a34a', low: 'rgba(22, 163, 74, 0)', mid: 'rgba(22, 163, 74, 0.68)', high: 'rgba(22, 163, 74, 0.98)', intensity: 1.7, opacity: 0.96 },
  { level: 'Watch', color: '#16a34a', low: 'rgba(22, 163, 74, 0)', mid: 'rgba(22, 163, 74, 0.42)', high: 'rgba(22, 163, 74, 0.72)', intensity: 1.18, opacity: 0.72 },
  { level: 'High', color: '#f97316', low: 'rgba(249, 115, 22, 0)', mid: 'rgba(249, 115, 22, 0.38)', high: 'rgba(249, 115, 22, 0.72)', intensity: 1.02, opacity: 0.68 },
  { level: 'Urgent', color: '#dc2626', low: 'rgba(220, 38, 38, 0)', mid: 'rgba(220, 38, 38, 0.34)', high: 'rgba(220, 38, 38, 0.68)', intensity: 0.92, opacity: 0.62 },
  { level: 'Unreported', color: '#94a3b8', low: 'rgba(148, 163, 184, 0)', mid: 'rgba(148, 163, 184, 0.32)', high: 'rgba(148, 163, 184, 0.5)', intensity: 0.5, opacity: 0.4 },
] as const;

const riskCategories: Array<{ id: RiskCategoryId; label: string; field: string; focus: string }> = [
  { id: 'overall', label: 'Overall risk', field: 'overall_care_desert_risk', focus: 'Cross-service care desert pressure' },
  { id: 'maternal', label: 'Maternal & neonatal', field: 'maternal_neonatal_risk', focus: 'Birth access and skilled attendance' },
  { id: 'diabetes', label: 'Diabetes care', field: 'diabetes_care_risk', focus: 'High blood sugar burden' },
  { id: 'hypertension', label: 'Hypertension care', field: 'hypertension_care_risk', focus: 'High BP burden and referral need' },
  { id: 'nutrition', label: 'Nutrition services', field: 'nutrition_services_risk', focus: 'Underweight population risk' },
  { id: 'cancer', label: 'Cancer screening', field: 'cancer_screening_risk', focus: 'Screening access gaps' },
];

const formatValue = (value: CellValue) => {
  if (value === null) return '';
  if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
  if (Array.isArray(value)) return '';
  return value.trim();
};

const formatCompact = (value: number) => new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
}).format(value);

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const formatListPreview = (value: string | null, maxItems = 3) => {
  if (!value) return '';
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.slice(0, maxItems).map((item) => String(item)).join(', ');
    }
  } catch {
    // Fall back to source text below.
  }
  return value.length > 180 ? `${value.slice(0, 180)}...` : value;
};

const formatFacilityLabel = (name: string) => {
  const cleanName = name.replace(/\s+/g, ' ').trim();
  return cleanName.length > 28 ? `${cleanName.slice(0, 25)}...` : cleanName;
};

const formatCapabilityLabel = (categoryCapability: string | null) => {
  if (!categoryCapability) return 'Unknown';
  return categoryCapability
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
};

const formatPredictionLabel = (value: string | null) => {
  if (!value) return 'Unknown';
  return value
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
};

const getStatusStyle = (value: string, kind: 'capability' | 'confidence') => {
  const normalized = value.toLowerCase().replace(/\s+/g, '_');
  if ((kind === 'capability' && normalized === 'capable') || (kind === 'confidence' && normalized === 'high')) {
    return { border: '#86efac', background: '#f0fdf4', color: '#166534' };
  }
  if ((kind === 'capability' && normalized === 'not_capable') || (kind === 'confidence' && normalized === 'low')) {
    return { border: '#fecaca', background: '#fef2f2', color: '#991b1b' };
  }
  if ((kind === 'capability' && normalized === 'limited') || (kind === 'confidence' && normalized === 'medium')) {
    return { border: '#fde68a', background: '#fffbeb', color: '#92400e' };
  }
  return { border: '#e2e8f0', background: '#f8fafc', color: '#475569' };
};

const FACILITY_OVERLAP_THRESHOLD_KM = 3;

function getCoordinateDistanceKm(first: NearestFacility, second: NearestFacility) {
  const latitudeDelta = ((second.facility_latitude - first.facility_latitude) * Math.PI) / 180;
  const longitudeDelta = ((second.facility_longitude - first.facility_longitude) * Math.PI) / 180;
  const firstLatitude = (first.facility_latitude * Math.PI) / 180;
  const secondLatitude = (second.facility_latitude * Math.PI) / 180;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function getNonOverlappingFacilities(facilities: NearestFacility[]) {
  return [...facilities]
    .sort((first, second) => first.distance_kilometers - second.distance_kilometers)
    .reduce<NearestFacility[]>((visibleFacilities, facility) => {
      const overlapsExistingFacility = visibleFacilities.some(
        (visibleFacility) => getCoordinateDistanceKm(visibleFacility, facility) < FACILITY_OVERLAP_THRESHOLD_KM,
      );
      return overlapsExistingFacility ? visibleFacilities : [...visibleFacilities, facility];
    }, []);
}

function createDistrictCenterIcon() {
  const canvas = document.createElement('canvas');
  const size = 64;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return new ImageData(size, size);

  context.shadowColor = 'rgba(15, 23, 42, 0.24)';
  context.shadowBlur = 8;
  context.shadowOffsetY = 3;
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(32, 32, 24, 0, Math.PI * 2);
  context.fill();

  context.shadowColor = 'transparent';
  context.lineWidth = 4;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.strokeStyle = '#0f766e';
  context.fillStyle = '#ccfbf1';

  context.beginPath();
  context.moveTo(18, 32);
  context.lineTo(32, 20);
  context.lineTo(46, 32);
  context.stroke();

  context.beginPath();
  context.rect(22, 31, 20, 15);
  context.fill();
  context.stroke();

  context.beginPath();
  context.moveTo(32, 46);
  context.lineTo(32, 37);
  context.stroke();

  return context.getImageData(0, 0, size, size);
}

const getInterventionLevel = (row: IndicatorRow): MapProperties['interventionLevel'] => {
  if (row.planning_priority_tier === 'Urgent') return 'Urgent';
  if (row.planning_priority_tier === 'High') return 'High';
  if (row.planning_priority_tier === 'Watch') return 'Watch';
  return 'Low';
};

const getMapProperties = (row: IndicatorRow, activeRiskField: string): MapProperties => ({
  key: `${row.state_ut}:${row.district_name}`,
  district: row.district_name.trim(),
  state: row.state_ut.trim(),
  interventionPriority: row.intervention_priority ?? row.planning_priority_tier,
  interventionLevel: getInterventionLevel(row),
  planningTier: row.planning_priority_tier,
  population: row.estimated_population_impact ?? row.affected_population_proxy,
  priorityScore: row.planning_priority_score,
  riskWeight: riskWeightForValue(row[activeRiskField]),
  primaryRiskDriver: row.primary_risk_driver,
  capableFacilitiesJson: JSON.stringify(getCapableFacilitySummaries(getCapableFacilitiesForRiskField(row, activeRiskField))),
  capableFacilitiesLabel: getCapableFacilitiesLabel(activeRiskField),
  isReported: true,
});

const getCapableFacilitiesForRiskField = (row: IndicatorRow, activeRiskField: string) => {
  if (activeRiskField === 'maternal_neonatal_risk') return row.maternal_capable_facilities;
  if (activeRiskField === 'diabetes_care_risk') return row.diabetes_capable_facilities;
  if (activeRiskField === 'hypertension_care_risk') return row.hypertension_capable_facilities;
  if (activeRiskField === 'nutrition_services_risk') return row.nutrition_capable_facilities;
  if (activeRiskField === 'cancer_screening_risk') return row.cancer_capable_facilities;
  return row.capable_facilities;
};

const getCapableFacilitiesLabel = (activeRiskField: string) => {
  if (activeRiskField === 'maternal_neonatal_risk') return 'Nearest maternal capable facilities';
  if (activeRiskField === 'diabetes_care_risk') return 'Nearest diabetes capable facilities';
  if (activeRiskField === 'hypertension_care_risk') return 'Nearest hypertension capable facilities';
  if (activeRiskField === 'nutrition_services_risk') return 'Nearest nutrition capable facilities';
  if (activeRiskField === 'cancer_screening_risk') return 'Nearest cancer screening capable facilities';
  return 'Nearest capable facilities';
};

const getCapableFacilitySummaries = (value: unknown): CapableFacilitySummary[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((facility) => {
      if (!facility || typeof facility !== 'object') return null;
      const record = facility as Record<string, unknown>;
      const name = typeof record.name === 'string' ? record.name.trim() : '';
      const distance = typeof record.distance_kilometers === 'number'
        ? record.distance_kilometers
        : Number(record.distance_kilometers);
      if (!name || !Number.isFinite(distance)) return null;
      return { name, distance_kilometers: distance };
    })
    .filter((facility): facility is CapableFacilitySummary => Boolean(facility))
    .slice(0, 3);
};

const pointInRing = (point: [number, number], ring: number[][]) => {
  const [longitude, latitude] = point;
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current, current += 1) {
    const [currentLongitude, currentLatitude] = ring[current];
    const [previousLongitude, previousLatitude] = ring[previous];
    const intersects = ((currentLatitude > latitude) !== (previousLatitude > latitude))
      && (longitude < ((previousLongitude - currentLongitude) * (latitude - currentLatitude)) / (previousLatitude - currentLatitude) + currentLongitude);
    if (intersects) inside = !inside;
  }
  return inside;
};

const pointInPolygonCoordinates = (point: [number, number], polygon: number[][][]) => {
  if (!polygon[0] || !pointInRing(point, polygon[0])) return false;
  return !polygon.slice(1).some((hole) => pointInRing(point, hole));
};

const pointInBoundary = (point: [number, number], geometry: Polygon | MultiPolygon) => {
  if (geometry.type === 'Polygon') return pointInPolygonCoordinates(point, geometry.coordinates as number[][][]);
  return (geometry.coordinates as number[][][][]).some((polygon) => pointInPolygonCoordinates(point, polygon));
};

export function LakebasePage() {
  const [data, setData] = useState<IndicatorResponse | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [riskCategory, setRiskCategory] = useState<RiskCategoryId>('overall');
  const [stateFilter, setStateFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [nearestFacilities, setNearestFacilities] = useState<NearestFacility[]>([]);
  const [facilitiesLoading, setFacilitiesLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/care-desert-indicators')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch care desert indicators: ${res.statusText}`);
        return res.json() as Promise<IndicatorResponse>;
      })
      .then((response) => {
        setData(response);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load care desert indicators'))
      .finally(() => setLoading(false));
  }, []);

  const rows = data?.rows ?? [];
  const states = Array.from(new Set(rows.map((row) => row.state_ut.trim()))).sort();
  const activeRiskCategory = riskCategories.find((category) => category.id === riskCategory) ?? riskCategories[0];
  const scopedRows = rows
    .filter((row) => stateFilter === 'all' || row.state_ut.trim() === stateFilter)
    .filter((row) => row.district_name.toLowerCase().includes(search.trim().toLowerCase()));
  const filteredRows = scopedRows
    .filter((row) => priorityFilter === 'all' || row.planning_priority_tier === priorityFilter)
    .sort((left, right) => {
      const riskDelta = riskWeightForValue(right[activeRiskCategory.field]) - riskWeightForValue(left[activeRiskCategory.field]);
      if (riskDelta !== 0) return riskDelta;
      const priorityDelta = priorityRank[right.planning_priority_tier] - priorityRank[left.planning_priority_tier];
      if (priorityDelta !== 0) return priorityDelta;
      return right.planning_priority_score - left.planning_priority_score;
    });
  const topInterventionRows = filteredRows.slice(0, 10);
  const selectedRow = selectedKey
    ? scopedRows.find((row) => `${row.state_ut}:${row.district_name}` === selectedKey)
    : undefined;
  const urgentCount = rows.filter((row) => row.planning_priority_tier === 'Urgent').length;
  const highOrUrgentCount = rows.filter((row) => ['Urgent', 'High'].includes(row.planning_priority_tier)).length;
  const affectedProxy = rows.reduce((total, row) => total + row.affected_population_proxy, 0);

  useEffect(() => {
    if (!selectedRow) {
      setNearestFacilities([]);
      return;
    }

    const params = new URLSearchParams({
      district: selectedRow.district_name.trim(),
      state: selectedRow.state_ut.trim(),
      category: riskCategory,
    });

    setFacilitiesLoading(true);
    fetch(`/api/care-desert-indicators/nearest-facilities?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch nearest facilities: ${res.statusText}`);
        return res.json() as Promise<{ facilities: NearestFacility[] }>;
      })
      .then((response) => setNearestFacilities(response.facilities))
      .catch(() => setNearestFacilities([]))
      .finally(() => setFacilitiesLoading(false));
  }, [riskCategory, selectedRow]);

  return (
    <div className="flex h-[calc(100vh-73px)] min-h-[720px] w-full overflow-hidden bg-slate-50 text-slate-950">
      {loading && <PageLoadingOverlay />}

      <aside className="z-10 flex w-[292px] shrink-0 flex-col gap-2 overflow-y-auto border-r border-slate-200 bg-white p-2.5 shadow-sm">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-950">Care need</p>
          <h2 className="mt-1 text-xl font-extrabold tracking-tight text-slate-950">Planning Priorities</h2>
          <p className="mt-0.5 text-xs font-medium text-slate-600">Filter service risk and review district access.</p>
        </div>

        {error && <div className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}

        <Input
          placeholder="Search district"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select
          value={stateFilter}
          onChange={(event) => setStateFilter(event.target.value)}
          className="h-9 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-900"
          aria-label="Filter by state"
        >
          <option value="all">All India</option>
          {states.map((state) => (
            <option key={state} value={state}>{state}</option>
          ))}
        </select>

        <select
          value={priorityFilter}
          onChange={(event) => setPriorityFilter(event.target.value)}
          className="h-9 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-900"
          aria-label="Filter by priority"
        >
          <option value="all">All priorities</option>
          <option value="Urgent">Urgent</option>
          <option value="High">High</option>
          <option value="Watch">Watch</option>
          <option value="Monitor">Monitor</option>
        </select>

        {loading ? <Skeleton className="h-80 w-full" /> : <RiskCategoryPanel rows={scopedRows} activeId={riskCategory} onSelect={setRiskCategory} />}

        <div className="space-y-1.5 border-t border-slate-200 pt-2">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-950">Legend</p>
          {interventionHeatmapLayers.map((layer) => (
            <div key={layer.level} className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: layer.color }} />
              {layer.level === 'Unreported' ? 'Unreported district' : `${layer.level} intervention pressure`}
            </div>
          ))}
        </div>
      </aside>

      <section className="relative min-w-0 flex-1 bg-slate-100">
        <MapboxHeatmap
          rows={filteredRows}
          selectedRow={selectedRow}
          activeRiskField={activeRiskCategory.field}
          nearestFacilities={nearestFacilities}
          onSelect={setSelectedKey}
        />

        <div className="pointer-events-none absolute left-5 top-5 max-w-sm rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">India · District Level</p>
          <h3 className="mt-1 text-xl font-extrabold text-slate-950">{activeRiskCategory.label}</h3>
          <p className="mt-1 text-sm font-medium text-slate-600">{activeRiskCategory.focus}</p>
        </div>

        {selectedRow && (
          <div className="pointer-events-none absolute bottom-5 left-5 right-5 z-10">
            <DistrictDetail row={selectedRow} />
          </div>
        )}

        {!selectedRow && (
          <div className="pointer-events-none absolute bottom-5 left-5 right-5 grid gap-3 md:grid-cols-4">
            <MetricCard icon={<MapPin className="h-5 w-5 text-teal-700" />} label="Districts loaded" value={data?.rowCount?.toLocaleString() ?? '...'} />
            <MetricCard icon={<AlertTriangle className="h-5 w-5 text-red-700" />} label="Urgent priorities" value={loading ? '...' : urgentCount.toLocaleString()} />
            <MetricCard icon={<Target className="h-5 w-5 text-orange-700" />} label="High or urgent" value={loading ? '...' : highOrUrgentCount.toLocaleString()} />
            <MetricCard icon={<Route className="h-5 w-5 text-sky-700" />} label="Population proxy" value={loading ? '...' : formatCompact(affectedProxy)} />
          </div>
        )}
      </section>

      <aside className="z-10 flex w-[368px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-slate-200 bg-white p-3 shadow-sm">
        <div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-950">Highest-risk districts</p>
            <p className="mt-1 text-sm font-semibold text-slate-700">{activeRiskCategory.label} · {stateFilter === 'all' ? 'All India' : stateFilter}</p>
          </div>
        </div>

        {loading ? <Skeleton className="h-96 w-full" /> : (
          <TopInterventionList
            rows={topInterventionRows}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            onClear={selectedKey ? () => setSelectedKey(null) : undefined}
          />
        )}

        {selectedRow && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs font-medium text-slate-600">
            {facilitiesLoading
              ? 'Loading nearest facilities...'
              : `${nearestFacilities.length} nearest ${activeRiskCategory.label.toLowerCase()} facilit${nearestFacilities.length === 1 ? 'y' : 'ies'} shown for ${selectedRow.district_name.trim()}`}
          </div>
        )}
        {!selectedRow && !loading && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-600">
            Select a district from the map or list to show planning signals and nearest facilities.
          </div>
        )}
      </aside>
    </div>
  );
}

function PageLoadingOverlay() {
  return (
    <div className="fixed inset-0 z-[2147482000] flex items-center justify-center bg-white/65 backdrop-blur-sm">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-xl">
        <Loader2 className="h-5 w-5 animate-spin text-teal-700" />
        <div>
          <p className="text-sm font-bold text-slate-950">Loading CareAccess India</p>
          <p className="text-xs font-medium text-slate-600">Reading district planning data</p>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
      <CardContent className="p-4 flex items-center gap-3">
        {icon}
        <div>
          <p className="text-2xl font-bold text-slate-950">{value}</p>
          <p className="text-sm font-medium text-slate-600">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DistrictDetail({ row }: { row: IndicatorRow }) {
  return (
    <Card className="rounded-2xl border-slate-200 bg-white/95 shadow-lg backdrop-blur">
      <CardContent className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <Database className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-950">Planning Signals</p>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <h3 className="text-xl font-bold leading-tight text-slate-950">{row.district_name.trim()}</h3>
                <p className="text-sm font-semibold text-slate-600">{row.state_ut.trim()}</p>
              </div>
            </div>
          </div>

          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${priorityStyles[row.planning_priority_tier]}`}>
            {row.planning_priority_tier} priority
          </span>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <Signal label="Affected population" value={formatCompact(row.affected_population_proxy)} />
          <Signal label="Priority score" value={row.planning_priority_score.toLocaleString()} />
          <Signal label="Facilities within 30km" value={formatValue(row.facilities_within_30km)} />
          <Signal label="Data confidence" value={`${row.data_confidence_score}%`} />
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <NarrativeBlock label="Primary risk driver" value={row.primary_risk_driver} />
          <NarrativeBlock label="Service gap" value={row.service_gap_summary} highlightNumbers />
        </div>
      </CardContent>
    </Card>
  );
}

function Signal({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-600">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-950">{value}</p>
    </div>
  );
}

function HighlightedNumberText({ value }: { value: string }) {
  return value.split(/(\d[\d,]*(?:\.\d+)?(?:\s?km|%)?)/gi).map((part, index) => {
    if (!/^\d/.test(part)) return part;
    const lowerPart = part.toLowerCase();
    const colorClass = lowerPart.includes('km') || part.includes(',') ? 'text-green-700' : 'text-orange-600';
    return (
      <strong key={`${part}-${index}`} className={`font-extrabold ${colorClass}`}>
        {part}
      </strong>
    );
  });
}

function NarrativeBlock({ label, value, highlightNumbers = false }: { label: string; value: string; highlightNumbers?: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">
        {highlightNumbers ? <HighlightedNumberText value={value} /> : value}
      </p>
    </div>
  );
}

function RiskCategoryPanel({ rows, activeId, onSelect }: { rows: IndicatorRow[]; activeId: RiskCategoryId; onSelect: (id: RiskCategoryId) => void }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-1.5 py-1.5 shadow-sm">
      <p className="px-1 py-0.5 text-sm font-bold leading-none text-slate-950">Risk Categories</p>
      <div className="mt-1.5 space-y-1">
        {riskCategories.map((category) => {
          const highRiskCount = rows.filter((row) => row[category.field] === 'High Risk').length;
          const active = activeId === category.id;
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => onSelect(category.id)}
              className={`w-full rounded-md border px-2 py-1 text-left transition-colors ${active ? 'border-teal-600 bg-teal-50 shadow-sm' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold leading-tight text-slate-950">{category.label}</p>
                  <p className="text-[11px] font-medium leading-tight text-slate-600">{category.focus}</p>
                </div>
                <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-red-700">
                  {highRiskCount}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TopInterventionList({
  rows,
  selectedKey,
  onSelect,
  onClear,
}: {
  rows: IndicatorRow[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onClear?: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-1.5 py-1.5 shadow-sm">
      <div className="px-1 py-0.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold leading-none text-slate-950">District Priorities</p>
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-bold leading-none text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      <div className="mt-1.5 space-y-1">
        {rows.map((row, index) => {
          const key = `${row.state_ut}:${row.district_name}`;
          const selected = key === selectedKey;
          const mostUrgentRank = index < 5;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className={`w-full rounded-md border px-2 py-1 text-left transition-colors ${selected ? 'border-teal-600 bg-teal-50 shadow-sm' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold leading-none text-slate-700">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold leading-tight text-slate-950">{row.district_name.trim()}</p>
                      <p className="text-xs font-medium leading-tight text-slate-600">{row.state_ut.trim()}</p>
                    </div>
                    {mostUrgentRank && (
                      <span className="shrink-0 rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-red-800 shadow-sm">
                        Most urgent
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-tight text-slate-600">Population impact {formatCompact(row.affected_population_proxy)}</p>
                  <p className="mt-0.5 text-xs leading-tight text-slate-600">{row.primary_risk_driver}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function riskWeightForValue(value: CellValue) {
  if (value === 'High Risk') return 3;
  if (value === 'Medium Risk') return 2;
  if (value === 'Low Risk') return 1;
  return 0;
}

function getFacilityPopupHtml(properties: FacilityPointProperties) {
  const location = [properties.city, properties.state].filter(Boolean).join(', ') || 'Location not listed';
  const description = properties.description || 'No facility description available.';
  const specialties = properties.specialties || 'No specialties listed.';
  const evidence = properties.evidence || 'No evidence note available.';
  const equipment = properties.equipment || '';
  const procedure = properties.procedure || '';
  const capabilityStyle = getStatusStyle(properties.capability, 'capability');
  const confidenceStyle = getStatusStyle(properties.confidence, 'confidence');

  return `
    <div style="font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #0f172a; min-width: 280px;">
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 8px;">
        <div>
          <div style="font-size: 13px; font-weight: 800; line-height: 1.25;">${escapeHtml(properties.name)}</div>
          <div style="font-size: 11px; color: #64748b; font-weight: 600; margin-top: 2px;">${escapeHtml(location)}</div>
        </div>
        <div style="white-space: nowrap; border: 1px solid #99f6e4; background: #f0fdfa; color: #0f766e; border-radius: 999px; padding: 3px 8px; font-size: 11px; font-weight: 800;">
          ${escapeHtml(properties.distanceLabel)}
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 10px 0;">
        <div style="border: 1px solid ${capabilityStyle.border}; border-radius: 10px; padding: 8px; background: ${capabilityStyle.background};">
          <div style="font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;">Capability</div>
          <div style="font-size: 12px; font-weight: 800; color: ${capabilityStyle.color}; margin-top: 2px;">${escapeHtml(properties.capability)}</div>
        </div>
        <div style="border: 1px solid ${confidenceStyle.border}; border-radius: 10px; padding: 8px; background: ${confidenceStyle.background};">
          <div style="font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;">Confidence</div>
          <div style="font-size: 12px; font-weight: 800; color: ${confidenceStyle.color}; margin-top: 2px;">${escapeHtml(properties.confidence)}</div>
        </div>
      </div>

      <div style="font-size: 11px; line-height: 1.45; color: #334155; margin-bottom: 8px;">${escapeHtml(description)}</div>
      <div style="font-size: 11px; line-height: 1.45; color: #475569;"><strong>Specialties:</strong> ${escapeHtml(specialties)}</div>
      ${equipment ? `<div style="font-size: 11px; line-height: 1.45; color: #475569; margin-top: 4px;"><strong>Equipment:</strong> ${escapeHtml(equipment)}</div>` : ''}
      ${procedure ? `<div style="font-size: 11px; line-height: 1.45; color: #475569; margin-top: 4px;"><strong>Procedures:</strong> ${escapeHtml(procedure)}</div>` : ''}
      <div style="margin-top: 8px; border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 10px; color: #64748b; line-height: 1.4;">
        <strong>Evidence:</strong> ${escapeHtml(evidence)}<br />
        Direct phone, email, website, and social handles are not present in the current facility source table.
      </div>
    </div>
  `;
}

function getDistrictPopupHtml(properties: BoundaryProperties) {
  if (!properties.isReported) {
    return `
      <div style="font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #0f172a; min-width: 210px;">
        <div style="font-size: 13px; font-weight: 850; line-height: 1.2;">${escapeHtml(properties.district)}</div>
        <div style="font-size: 11px; color: #64748b; font-weight: 650; margin-top: 2px;">${escapeHtml(properties.state)}</div>
        <div style="border-top: 1px solid #e2e8f0; margin-top: 8px; padding-top: 8px; font-size: 11px; color: #475569; line-height: 1.4;">
          No district indicator record is available for this boundary.
        </div>
      </div>
    `;
  }

  const tierStyle = priorityStyles[properties.planningTier];
  const tierColor = tierStyle.includes('red') ? '#991b1b'
    : tierStyle.includes('orange') ? '#9a3412'
      : tierStyle.includes('slate') ? '#475569'
        : '#166534';
  const capableFacilities = parseCapableFacilitySummaries(properties.capableFacilitiesJson);
  const capableFacilityHtml = capableFacilities.length > 0
    ? capableFacilities.map((facility) => `
        <div style="display: flex; justify-content: space-between; gap: 10px; border-top: 1px solid #e2e8f0; padding-top: 5px; margin-top: 5px;">
          <span style="font-weight: 750; color: #0f172a; overflow-wrap: anywhere;">${escapeHtml(facility.name)}</span>
          <span style="white-space: nowrap; color: #0f766e; font-weight: 850;">${escapeHtml(facility.distance_kilometers.toFixed(1))} km</span>
        </div>
      `).join('')
    : '<div style="border-top: 1px solid #e2e8f0; padding-top: 5px; margin-top: 5px; color: #64748b; font-weight: 650;">No capable facilities listed for this district.</div>';

  return `
    <div style="font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #0f172a; min-width: 250px;">
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 8px;">
        <div>
          <div style="font-size: 13px; font-weight: 850; line-height: 1.2;">${escapeHtml(properties.district)}</div>
          <div style="font-size: 11px; color: #64748b; font-weight: 650; margin-top: 2px;">${escapeHtml(properties.state)}</div>
        </div>
        <div style="white-space: nowrap; border: 1px solid #cbd5e1; background: #f8fafc; color: ${tierColor}; border-radius: 999px; padding: 3px 8px; font-size: 11px; font-weight: 850;">
          ${escapeHtml(properties.planningTier)}
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 9px 0;">
        <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px; background: #ffffff;">
          <div style="font-size: 10px; color: #64748b; font-weight: 750; text-transform: uppercase; letter-spacing: .04em;">Priority score</div>
          <div style="font-size: 15px; font-weight: 900; color: #0f172a; margin-top: 2px;">${escapeHtml(String(properties.priorityScore))}</div>
        </div>
        <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px; background: #ffffff;">
          <div style="font-size: 10px; color: #64748b; font-weight: 750; text-transform: uppercase; letter-spacing: .04em;">Population impact</div>
          <div style="font-size: 15px; font-weight: 900; color: #0f766e; margin-top: 2px;">${escapeHtml(formatCompact(properties.population))}</div>
        </div>
      </div>

      <div style="border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 11px; color: #334155; line-height: 1.4;">
        <strong>Primary driver:</strong> ${escapeHtml(properties.primaryRiskDriver)}<br />
        <strong>Intervention pressure:</strong> ${escapeHtml(properties.interventionLevel)}
      </div>

      <div style="border-top: 1px solid #e2e8f0; margin-top: 8px; padding-top: 8px; font-size: 11px; color: #334155; line-height: 1.35;">
        <div style="font-size: 10px; color: #64748b; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 2px;">${escapeHtml(properties.capableFacilitiesLabel)}</div>
        ${capableFacilityHtml}
      </div>
    </div>
  `;
}

function parseCapableFacilitySummaries(value: string) {
  try {
    return getCapableFacilitySummaries(JSON.parse(value));
  } catch {
    return [];
  }
}

function MapboxHeatmap({
  rows,
  selectedRow,
  activeRiskField,
  nearestFacilities,
  onSelect,
}: {
  rows: IndicatorRow[];
  selectedRow?: IndicatorRow;
  activeRiskField: string;
  nearestFacilities: NearestFacility[];
  onSelect: (key: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const pendingZoomRef = useRef(false);
  const hoveredBoundaryIdRef = useRef<string | number | null>(null);
  const [boundarySource, setBoundarySource] = useState<FeatureCollection<Polygon | MultiPolygon, BoundarySourceProperties> | null>(null);
  const selectedKey = selectedRow ? `${selectedRow.state_ut}:${selectedRow.district_name}` : '';
  const mapRows = useMemo(
    () => rows.filter((row) => typeof row.latitude === 'number' && typeof row.longitude === 'number'),
    [rows],
  );
  const displayFacilities = useMemo(() => getNonOverlappingFacilities(nearestFacilities), [nearestFacilities]);
  const geoJson = useMemo<FeatureCollection<Point, MapProperties>>(() => ({
    type: 'FeatureCollection',
    features: mapRows.map((row) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [row.longitude ?? 0, row.latitude ?? 0],
      },
      properties: getMapProperties(row, activeRiskField),
    })),
  }), [activeRiskField, mapRows]);
  const districtBoundaries = useMemo<FeatureCollection<Polygon | MultiPolygon, BoundaryProperties>>(() => {
    if (!boundarySource) return { type: 'FeatureCollection', features: [] };

    const availableRows = mapRows.filter((row) => typeof row.longitude === 'number' && typeof row.latitude === 'number');
    const features: Array<Feature<Polygon | MultiPolygon, BoundaryProperties>> = [];
    const matchedRowKeys = new Set<string>();

    boundarySource.features.forEach((boundaryFeature, index) => {
      const matchingRow = availableRows.find((row) => {
        const key = `${row.state_ut}:${row.district_name}`;
        if (matchedRowKeys.has(key)) return false;
        return pointInBoundary([row.longitude ?? 0, row.latitude ?? 0], boundaryFeature.geometry);
      });
      if (!matchingRow) {
        const boundaryDistrict = boundaryFeature.properties?.NAME_2 ?? 'Unreported district';
        const boundaryState = boundaryFeature.properties?.NAME_1 ?? 'Unreported state';
        features.push({
          type: 'Feature',
          id: `unreported:${boundaryState}:${boundaryDistrict}:${index}`,
          geometry: boundaryFeature.geometry,
          properties: {
            key: '',
            district: boundaryDistrict,
            state: boundaryState,
            interventionPriority: 'Unreported',
            interventionLevel: 'Unreported',
            planningTier: 'Monitor',
            population: 0,
            priorityScore: 0,
            riskWeight: 0,
            primaryRiskDriver: 'No district indicator record',
            capableFacilitiesJson: '[]',
            capableFacilitiesLabel: 'Nearest capable facilities',
            isReported: false,
            boundaryDistrict,
            boundaryState,
          },
        });
        return;
      }

      const mapProperties = getMapProperties(matchingRow, activeRiskField);
      matchedRowKeys.add(mapProperties.key);
      features.push({
        type: 'Feature',
        id: mapProperties.key,
        geometry: boundaryFeature.geometry,
        properties: {
          ...mapProperties,
          boundaryDistrict: boundaryFeature.properties?.NAME_2 ?? mapProperties.district,
          boundaryState: boundaryFeature.properties?.NAME_1 ?? mapProperties.state,
        },
      });
    });

    return { type: 'FeatureCollection', features };
  }, [activeRiskField, boundarySource, mapRows]);
  const selectedDistrictCenter = useMemo<FeatureCollection<Point, DistrictCenterProperties>>(() => ({
    type: 'FeatureCollection',
    features: selectedRow?.longitude && selectedRow.latitude
      ? [{
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [selectedRow.longitude, selectedRow.latitude],
        },
        properties: {
          key: `${selectedRow.state_ut}:${selectedRow.district_name}`,
          district: selectedRow.district_name.trim(),
        },
      }]
      : [],
  }), [selectedRow]);
  const facilityLines = useMemo<FeatureCollection<LineString, FacilityLineProperties>>(() => ({
    type: 'FeatureCollection',
    features: displayFacilities.map((facility) => ({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [facility.center_longitude, facility.center_latitude],
          [facility.facility_longitude, facility.facility_latitude],
        ],
      },
      properties: {
        id: facility.unique_id,
        name: facility.name,
        distanceLabel: `${facility.distance_kilometers.toFixed(1)} km`,
      },
    })),
  }), [displayFacilities]);
  const facilityPoints = useMemo<FeatureCollection<Point, FacilityPointProperties>>(() => ({
    type: 'FeatureCollection',
    features: displayFacilities.map((facility) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [facility.facility_longitude, facility.facility_latitude],
      },
      properties: {
        id: facility.unique_id,
        name: facility.name,
        labelName: formatFacilityLabel(facility.name),
        distanceLabel: `${facility.distance_kilometers.toFixed(1)} km`,
        capability: formatCapabilityLabel(facility.category_capability),
        confidence: formatPredictionLabel(facility.category_confidence ?? facility.data_confidence),
        evidence: formatListPreview(facility.category_evidence ?? facility.data_confidence_reason, 2),
        city: facility.address_city ?? '',
        state: facility.address_stateOrRegion ?? '',
        description: facility.description ?? '',
        specialties: formatListPreview(facility.specialties),
        equipment: formatListPreview(facility.equipment),
        procedure: formatListPreview(facility.procedure, 2),
      },
    })),
  }), [displayFacilities]);
  const facilityLabels = useMemo<FeatureCollection<Point, FacilityLineProperties>>(() => ({
    type: 'FeatureCollection',
    features: displayFacilities.map((facility) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [
          (facility.center_longitude + facility.facility_longitude) / 2,
          (facility.center_latitude + facility.facility_latitude) / 2,
        ],
      },
      properties: {
        id: facility.unique_id,
        name: facility.name,
        distanceLabel: `${facility.distance_kilometers.toFixed(1)} km`,
      },
    })),
  }), [displayFacilities]);

  const resetMapView = (map: mapboxgl.Map, animate = true) => {
    map.easeTo({
      center: INDIA_MAP_CENTER,
      zoom: INDIA_MAP_ZOOM,
      duration: animate ? 650 : 0,
    });
  };

  const zoomToSelection = (map: mapboxgl.Map, animate = true) => {
    if (!selectedRow?.longitude || !selectedRow.latitude) return;

    const bounds = new mapboxgl.LngLatBounds(
      [selectedRow.longitude, selectedRow.latitude],
      [selectedRow.longitude, selectedRow.latitude],
    );
    displayFacilities.forEach((facility) => {
      bounds.extend([facility.facility_longitude, facility.facility_latitude]);
    });

    if (displayFacilities.length > 0) {
      map.fitBounds(bounds, {
        padding: { top: 72, bottom: 72, left: 72, right: 72 },
        duration: animate ? 700 : 0,
        maxZoom: 8.5,
      });
      return;
    }

    map.easeTo({
      center: [selectedRow.longitude, selectedRow.latitude],
      duration: animate ? 700 : 0,
      zoom: Math.max(map.getZoom(), 5.4),
    });
  };

  const syncMapView = (map: mapboxgl.Map, animate = true) => {
    if (selectedRow) {
      zoomToSelection(map, animate);
      return;
    }
    resetMapView(map, animate);
  };

  useEffect(() => {
    const controller = new AbortController();
    fetch(DISTRICT_BOUNDARY_GEOJSON_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to fetch district boundaries: ${response.statusText}`);
        return response.json() as Promise<FeatureCollection<Polygon | MultiPolygon, BoundarySourceProperties>>;
      })
      .then((boundaries) => setBoundarySource(boundaries))
      .catch((err) => {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          console.error('Failed to load district boundaries:', err);
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !MAPBOX_ACCESS_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: INDIA_MAP_CENTER,
      zoom: INDIA_MAP_ZOOM,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      if (!map.hasImage('district-center-home')) {
        map.addImage('district-center-home', createDistrictCenterIcon(), { pixelRatio: 2 });
      }
      map.addSource('district-priorities', {
        type: 'geojson',
        data: geoJson,
      });
      map.addSource('district-boundaries', {
        type: 'geojson',
        data: districtBoundaries,
        promoteId: 'key',
      });
      map.addSource('selected-district-center', {
        type: 'geojson',
        data: selectedDistrictCenter,
      });
      map.addSource('nearest-facility-lines', {
        type: 'geojson',
        data: facilityLines,
      });
      map.addSource('nearest-facility-points', {
        type: 'geojson',
        data: facilityPoints,
      });
      map.addSource('nearest-facility-labels', {
        type: 'geojson',
        data: facilityLabels,
      });
      map.addLayer({
        id: 'district-boundary-fills',
        type: 'fill',
        source: 'district-boundaries',
        paint: {
          'fill-color': [
            'match',
            ['get', 'interventionLevel'],
            'Low', '#16a34a',
            'Watch', '#16a34a',
            'High', '#f97316',
            'Urgent', '#dc2626',
            'Unreported', '#94a3b8',
            '#94a3b8',
          ],
          'fill-opacity': [
            'case',
            ['==', ['get', 'interventionLevel'], 'Unreported'],
            ['case', ['boolean', ['feature-state', 'hover'], false], 0.42, 0.22],
            ['boolean', ['feature-state', 'hover'], false],
            ['interpolate', ['linear'], ['get', 'population'], 200, 0.36, 900, 0.48, 1050, 0.58, 1250, 0.68, 1450, 0.78, 1650, 0.86],
            ['interpolate', ['linear'], ['get', 'population'], 200, 0.08, 900, 0.14, 1050, 0.22, 1250, 0.32, 1450, 0.44, 1650, 0.56],
          ],
        },
      });
      map.addLayer({
        id: 'district-boundary-outlines',
        type: 'line',
        source: 'district-boundaries',
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'interventionLevel'], 'Unreported'],
            'rgba(148, 163, 184, 0.28)',
            'rgba(15, 23, 42, 0.42)',
          ],
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.35, 7, 1.2],
          'line-opacity': [
            'case',
            ['==', ['get', 'interventionLevel'], 'Unreported'],
            0.45,
            0.7,
          ],
        },
      });
      map.addLayer({
        id: 'district-priority-hit-targets',
        type: 'circle',
        source: 'district-priorities',
        paint: {
          'circle-radius': 18,
          'circle-color': 'rgba(15, 23, 42, 0)',
          'circle-opacity': 0,
        },
      });
      map.addLayer({
        id: 'nearest-facility-lines',
        type: 'line',
        source: 'nearest-facility-lines',
        paint: {
          'line-color': '#0f766e',
          'line-width': 2,
          'line-opacity': 0.85,
          'line-dasharray': [1.5, 1],
        },
      });
      map.addLayer({
        id: 'nearest-facility-points',
        type: 'circle',
        source: 'nearest-facility-points',
        paint: {
          'circle-radius': 8,
          'circle-color': '#0f766e',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3,
        },
      });
      map.addLayer({
        id: 'nearest-facility-name-labels',
        type: 'symbol',
        source: 'nearest-facility-points',
        layout: {
          'text-field': ['get', 'labelName'],
          'text-size': 11,
          'text-offset': [0.85, 0],
          'text-anchor': 'left',
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': '#0f766e',
          'text-halo-color': '#ffffff',
          'text-halo-width': 3,
          'text-halo-blur': 0.5,
        },
      });
      map.addLayer({
        id: 'nearest-facility-distance-labels',
        type: 'symbol',
        source: 'nearest-facility-labels',
        layout: {
          'text-field': ['get', 'distanceLabel'],
          'text-size': 12,
          'text-offset': [0, -0.6],
          'text-anchor': 'bottom',
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#0f172a',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
        },
      });
      map.addLayer({
        id: 'selected-district-center-halo',
        type: 'circle',
        source: 'selected-district-center',
        paint: {
          'circle-radius': 22,
          'circle-color': '#ffffff',
          'circle-stroke-color': '#0f766e',
          'circle-stroke-width': 3,
          'circle-opacity': 0.98,
        },
      });
      map.addLayer({
        id: 'selected-district-center-home',
        type: 'symbol',
        source: 'selected-district-center',
        layout: {
          'icon-image': 'district-center-home',
          'icon-size': 0.8,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });

      map.moveLayer('nearest-facility-points');
      map.moveLayer('nearest-facility-name-labels');
      map.moveLayer('nearest-facility-distance-labels');

      map.on('click', 'district-priority-hit-targets', (event) => {
        const feature = event.features?.[0];
        const properties = feature?.properties as MapProperties | undefined;
        if (properties?.key) onSelect(properties.key);
      });
      map.on('click', 'district-boundary-fills', (event) => {
        const feature = event.features?.[0];
        const properties = feature?.properties as BoundaryProperties | undefined;
        if (properties?.isReported && properties.key) onSelect(properties.key);
      });
      map.on('mouseenter', 'district-priority-hit-targets', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'district-priority-hit-targets', () => { map.getCanvas().style.cursor = ''; });
      const districtPopup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'district-map-popup',
        maxWidth: '310px',
        offset: 12,
      });
      map.on('mousemove', 'district-boundary-fills', (event) => {
        const featureId = event.features?.[0]?.id;
        const feature = event.features?.[0];
        const properties = feature?.properties as BoundaryProperties | undefined;
        if (!properties || event.lngLat === undefined) return;
        if (featureId !== undefined && featureId !== hoveredBoundaryIdRef.current) {
          if (hoveredBoundaryIdRef.current !== null) {
            map.setFeatureState({ source: 'district-boundaries', id: hoveredBoundaryIdRef.current }, { hover: false });
          }
          hoveredBoundaryIdRef.current = featureId;
          map.setFeatureState({ source: 'district-boundaries', id: featureId }, { hover: true });
        }
        districtPopup
          .setLngLat(event.lngLat)
          .setHTML(getDistrictPopupHtml(properties))
          .addTo(map);
        const popupElement = districtPopup.getElement();
        if (popupElement) popupElement.style.zIndex = '2147483000';
      });
      map.on('mouseenter', 'district-boundary-fills', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'district-boundary-fills', () => {
        map.getCanvas().style.cursor = '';
        districtPopup.remove();
        if (hoveredBoundaryIdRef.current !== null) {
          map.setFeatureState({ source: 'district-boundaries', id: hoveredBoundaryIdRef.current }, { hover: false });
        }
        hoveredBoundaryIdRef.current = null;
      });

      const facilityPopup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'facility-map-popup',
        maxWidth: '340px',
        offset: 14,
      });
      const showFacilityPopup = (event: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
        map.getCanvas().style.cursor = 'pointer';
        const feature = event.features?.[0];
        const coordinates = (feature?.geometry as Point | undefined)?.coordinates;
        const properties = feature?.properties as FacilityPointProperties | undefined;
        if (!coordinates || !properties) return;

        districtPopup.remove();
        facilityPopup
          .setLngLat(coordinates as [number, number])
          .setHTML(getFacilityPopupHtml(properties))
          .addTo(map);
        const popupElement = facilityPopup.getElement();
        if (popupElement) popupElement.style.zIndex = '2147483647';
      };
      const hideFacilityPopup = () => {
        map.getCanvas().style.cursor = '';
        facilityPopup.remove();
      };
      map.on('mouseenter', 'nearest-facility-points', showFacilityPopup);
      map.on('mouseleave', 'nearest-facility-points', hideFacilityPopup);
      map.on('mouseenter', 'nearest-facility-name-labels', showFacilityPopup);
      map.on('mouseleave', 'nearest-facility-name-labels', hideFacilityPopup);
      pendingZoomRef.current = true;
      map.once('idle', () => {
        if (pendingZoomRef.current) {
          syncMapView(map, false);
          pendingZoomRef.current = false;
        }
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [districtBoundaries, facilityLabels, facilityLines, facilityPoints, geoJson, onSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const source = map.getSource('district-priorities') as mapboxgl.GeoJSONSource | undefined;
    source?.setData(geoJson);
    (map.getSource('district-boundaries') as mapboxgl.GeoJSONSource | undefined)?.setData(districtBoundaries);
    (map.getSource('selected-district-center') as mapboxgl.GeoJSONSource | undefined)?.setData(selectedDistrictCenter);
    pendingZoomRef.current = true;
    map.once('idle', () => {
      if (pendingZoomRef.current) {
        syncMapView(map, true);
        pendingZoomRef.current = false;
      }
    });
  }, [districtBoundaries, geoJson, selectedDistrictCenter]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    (map.getSource('nearest-facility-lines') as mapboxgl.GeoJSONSource | undefined)?.setData(facilityLines);
    (map.getSource('nearest-facility-points') as mapboxgl.GeoJSONSource | undefined)?.setData(facilityPoints);
    (map.getSource('nearest-facility-labels') as mapboxgl.GeoJSONSource | undefined)?.setData(facilityLabels);
    pendingZoomRef.current = true;
    map.once('idle', () => {
      if (pendingZoomRef.current) {
        syncMapView(map, true);
        pendingZoomRef.current = false;
      }
    });
  }, [facilityLabels, facilityLines, facilityPoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.isStyleLoaded()) {
      pendingZoomRef.current = true;
      map.once('idle', () => {
        if (pendingZoomRef.current) {
          (map.getSource('selected-district-center') as mapboxgl.GeoJSONSource | undefined)?.setData(selectedDistrictCenter);
          syncMapView(map, true);
          pendingZoomRef.current = false;
        }
      });
      return;
    }
    (map.getSource('selected-district-center') as mapboxgl.GeoJSONSource | undefined)?.setData(selectedDistrictCenter);
    syncMapView(map, true);
  }, [displayFacilities, selectedDistrictCenter, selectedKey, selectedRow]);

  if (mapRows.length === 0) {
    return (
      <div className="flex h-full min-h-[640px] items-center justify-center bg-slate-100 text-sm font-medium text-slate-600">
        No district coordinates returned for the current filters.
      </div>
    );
  }

  return <div ref={containerRef} className="h-full min-h-[640px] w-full" />;
}
