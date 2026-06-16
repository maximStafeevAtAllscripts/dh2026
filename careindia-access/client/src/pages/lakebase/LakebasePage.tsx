import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import { ScatterplotLayer } from '@deck.gl/layers';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { Skeleton } from '@databricks/appkit-ui/react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  Activity,
  AlertTriangle,
  ChevronLeft,
  Droplet,
  HeartPulse,
  Leaf,
  MapPinned,
  Search,
  ShieldCheck,
  Star,
  Stethoscope,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

type DeckPickingInfo = {
  object?: DistrictPoint;
  x: number;
  y: number;
};

type IndicatorRow = {
  district_name: string | null;
  state_ut: string | null;
  households_surveyed: number | string | null;
  women_15_49_interviewed: number | string | null;
  maternal_neonatal_institutional_birth_pct: number | string | null;
  maternal_neonatal_csection_pct: number | string | null;
  maternal_neonatal_anc_visits_pct: number | string | null;
  maternal_neonatal_skilled_birth_pct: number | string | null;
  maternal_neonatal_access_score: number | string | null;
  maternal_neonatal_skilled_attendance_gap: number | string | null;
  maternal_neonatal_csection_access_flag: string | null;
  maternal_neonatal_risk: string | null;
  diabetes_care_high_blood_sugar_pct: number | string | null;
  diabetes_care_risk: string | null;
  hypertension_care_high_bp_pct: number | string | null;
  hypertension_care_risk: string | null;
  nutrition_services_underweight_pct: number | string | null;
  nutrition_services_risk: string | null;
  cancer_screening_cervical_pct: number | string | null;
  cancer_screening_breast_pct: number | string | null;
  cancer_screening_oral_pct: number | string | null;
  cancer_screening_score: number | string | null;
  cancer_screening_risk: string | null;
  overall_care_desert_risk: string | null;
};

type CategoryId = 'overall' | 'maternal' | 'diabetes' | 'hypertension' | 'nutrition' | 'cancer';

type Category = {
  id: CategoryId;
  short: string;
  cap: string;
  riskField: keyof IndicatorRow;
  scoreFields: (keyof IndicatorRow)[];
  icon: typeof HeartPulse;
};

type DistrictPoint = {
  id: string;
  district: string;
  state: string;
  latitude: number;
  longitude: number;
  households: number;
  women: number;
  riskLabel: string;
  severity: number;
  confidence: number;
  dataPoor: boolean;
  scores: { label: string; value: number | null }[];
};

const CATEGORIES: Category[] = [
  {
    id: 'overall',
    short: 'Overall Access',
    cap: 'Composite care-desert signal',
    riskField: 'overall_care_desert_risk',
    scoreFields: ['maternal_neonatal_access_score', 'cancer_screening_score'],
    icon: MapPinned,
  },
  {
    id: 'maternal',
    short: 'Maternal & Neonatal',
    cap: 'ANC, skilled delivery, neonatal care',
    riskField: 'maternal_neonatal_risk',
    scoreFields: [
      'maternal_neonatal_institutional_birth_pct',
      'maternal_neonatal_csection_pct',
      'maternal_neonatal_anc_visits_pct',
      'maternal_neonatal_skilled_birth_pct',
      'maternal_neonatal_access_score',
      'maternal_neonatal_skilled_attendance_gap',
    ],
    icon: HeartPulse,
  },
  {
    id: 'diabetes',
    short: 'Diabetes',
    cap: 'High blood sugar screening signal',
    riskField: 'diabetes_care_risk',
    scoreFields: ['diabetes_care_high_blood_sugar_pct'],
    icon: Droplet,
  },
  {
    id: 'hypertension',
    short: 'Hypertension',
    cap: 'High BP screening signal',
    riskField: 'hypertension_care_risk',
    scoreFields: ['hypertension_care_high_bp_pct'],
    icon: Activity,
  },
  {
    id: 'nutrition',
    short: 'Nutrition',
    cap: 'Underweight prevalence signal',
    riskField: 'nutrition_services_risk',
    scoreFields: ['nutrition_services_underweight_pct'],
    icon: Leaf,
  },
  {
    id: 'cancer',
    short: 'Cancer Screening',
    cap: 'Cervical, breast, oral screening',
    riskField: 'cancer_screening_risk',
    scoreFields: ['cancer_screening_cervical_pct', 'cancer_screening_breast_pct', 'cancer_screening_oral_pct'],
    icon: Search,
  },
];

const SCORE_LABELS: Partial<Record<keyof IndicatorRow, string>> = {
  maternal_neonatal_institutional_birth_pct: 'Institutional birth',
  maternal_neonatal_csection_pct: 'C-section',
  maternal_neonatal_anc_visits_pct: 'ANC visits',
  maternal_neonatal_skilled_birth_pct: 'Skilled birth',
  maternal_neonatal_access_score: 'Maternal access score',
  maternal_neonatal_skilled_attendance_gap: 'Skilled attendance gap',
  diabetes_care_high_blood_sugar_pct: 'High blood sugar',
  hypertension_care_high_bp_pct: 'High BP',
  nutrition_services_underweight_pct: 'Underweight',
  cancer_screening_cervical_pct: 'Cervical screen',
  cancer_screening_breast_pct: 'Breast screen',
  cancer_screening_oral_pct: 'Oral screen',
  cancer_screening_score: 'Cancer score',
};

const STATE_CENTROIDS: Record<string, [number, number]> = {
  'andhra pradesh': [15.9129, 79.74],
  'arunachal pradesh': [28.218, 94.7278],
  assam: [26.2006, 92.9376],
  bihar: [25.0961, 85.3131],
  chandigarh: [30.7333, 76.7794],
  chhattisgarh: [21.2787, 81.8661],
  delhi: [28.7041, 77.1025],
  goa: [15.2993, 74.124],
  gujarat: [22.2587, 71.1924],
  haryana: [29.0588, 76.0856],
  'himachal pradesh': [31.1048, 77.1734],
  'jammu and kashmir': [33.7782, 76.5762],
  jharkhand: [23.6102, 85.2799],
  karnataka: [15.3173, 75.7139],
  kerala: [10.8505, 76.2711],
  ladakh: [34.2268, 77.5619],
  lakshadweep: [10.5667, 72.6417],
  'madhya pradesh': [22.9734, 78.6569],
  maharashtra: [19.7515, 75.7139],
  manipur: [24.6637, 93.9063],
  meghalaya: [25.467, 91.3662],
  mizoram: [23.1645, 92.9376],
  nagaland: [26.1584, 94.5624],
  odisha: [20.9517, 85.0985],
  puducherry: [11.9416, 79.8083],
  punjab: [31.1471, 75.3412],
  rajasthan: [27.0238, 74.2179],
  sikkim: [27.533, 88.5122],
  'tamil nadu': [11.1271, 78.6569],
  telangana: [18.1124, 79.0193],
  tripura: [23.9408, 91.9882],
  'uttar pradesh': [26.8467, 80.9462],
  uttarakhand: [30.0668, 79.0193],
  'west bengal': [22.9868, 87.855],
};

const INDIA_BOUNDS: [[number, number], [number, number]] = [[67.5, 6.5], [98, 35.8]];
const SHORTLIST_KEY = 'cai_shortlist_lakebase_v1';
const MAPBOX_TOKEN = 'pk.eyJ1IjoiemFjaG80MCIsImEiOiJjbHQxc2xndDgxZ3BhMmxtbnA4YjBjdnZiIn0.amNorA7xEmc7uXTiL3RSAQ';

const normalize = (value: unknown) => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  return '';
};

const toNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const riskToSeverity = (risk: string) => {
  const value = risk.toLowerCase();
  if (value.includes('high')) return 0.92;
  if (value.includes('medium') || value.includes('moderate')) return 0.58;
  if (value.includes('low')) return 0.22;
  return 0.4;
};

const severityColor = (severity: number, dataPoor = false) => {
  if (dataPoor) return '#6b7280';
  if (severity >= 0.75) return '#dc2626';
  if (severity >= 0.45) return '#f59e0b';
  return '#16a34a';
};

const severityLabel = (severity: number, dataPoor = false) => {
  if (dataPoor) return 'Data-poor';
  if (severity >= 0.75) return 'Severe gap';
  if (severity >= 0.45) return 'Moderate gap';
  return 'Adequate';
};

const formatNumber = (value: number) => value.toLocaleString('en-IN');

const coordinateFor = (row: IndicatorRow, index: number): [number, number] => {
  const state = normalize(row.state_ut).toLowerCase();
  const base = STATE_CENTROIDS[state] ?? [22.9734, 78.6569];
  const angle = index * 2.3999632297;
  const radius = 0.12 + (index % 8) * 0.035;
  return [base[0] + Math.sin(angle) * radius, base[1] + Math.cos(angle) * radius];
};

function useCareDesertData() {
  const [rows, setRows] = useState<IndicatorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/care-desert-indicators')
      .then((res) => {
        if (!res.ok) throw new Error(`Lakebase returned ${res.status}`);
        return res.json() as Promise<IndicatorRow[]>;
      })
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load Lakebase data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { rows, loading, error };
}

function useMapboxHeatmap(points: DistrictPoint[], selected: DistrictPoint | null, onSelect: (id: string) => void) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [81, 22.5],
      zoom: 3.4,
      attributionControl: false,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.fitBounds(INDIA_BOUNDS, { padding: 36, duration: 0 });

    const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(overlay);

    mapRef.current = map;
    overlayRef.current = overlay;

    return () => {
      popupRef.current?.remove();
      overlay.finalize();
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!overlayRef.current) return;

    overlayRef.current.setProps({
      layers: [
        new HeatmapLayer<DistrictPoint>({
          id: 'care-desert-heatmap',
          data: points,
          getPosition: (point) => [point.longitude, point.latitude],
          getWeight: (point) => Math.max(0.08, point.severity) * Math.max(1, point.households / 1000),
          radiusPixels: 58,
          intensity: 1.6,
          threshold: 0.04,
          colorRange: [
            [45, 212, 191, 40],
            [22, 163, 74, 95],
            [245, 158, 11, 130],
            [251, 113, 133, 165],
            [220, 38, 38, 210],
          ],
          pickable: false,
        }),
        new ScatterplotLayer<DistrictPoint>({
          id: 'care-desert-points',
          data: points,
          getPosition: (point) => [point.longitude, point.latitude],
          getRadius: (point) => Math.max(9000, Math.min(32000, 9000 + Math.sqrt(Math.max(point.households, 1)) * 620)),
          radiusUnits: 'meters',
          stroked: true,
          filled: true,
          lineWidthMinPixels: 1.4,
          getFillColor: (point) => {
            if (point.dataPoor) return [255, 255, 255, 210];
            if (point.severity >= 0.75) return [220, 38, 38, 210];
            if (point.severity >= 0.45) return [245, 158, 11, 210];
            return [22, 163, 74, 210];
          },
          getLineColor: (point) => (point.dataPoor ? [154, 163, 175, 230] : [255, 255, 255, 235]),
          pickable: true,
          onClick: ({ object }: DeckPickingInfo) => {
            if (!object) return false;
            onSelectRef.current(object.id);
            return true;
          },
          onHover: ({ object, x, y }: DeckPickingInfo) => {
            const map = mapRef.current;
            if (!map) return false;
            popupRef.current?.remove();
            if (!object) {
              map.getCanvas().style.cursor = '';
              return false;
            }

            map.getCanvas().style.cursor = 'pointer';
            popupRef.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 12 })
              .setLngLat(map.unproject([x, y]))
              .setHTML(
                `<div class="cai-map-popup"><strong>${object.district}</strong><span>${object.state}</span><b style="color:${severityColor(object.severity, object.dataPoor)}">${severityLabel(object.severity, object.dataPoor)} - ${Math.round(object.severity * 100)}</b></div>`,
              )
              .addTo(map);
            return true;
          },
        }),
      ],
    });
  }, [points]);

  useEffect(() => {
    if (!mapRef.current || !selected) return;
    mapRef.current.easeTo({ center: [selected.longitude, selected.latitude], zoom: Math.max(mapRef.current.getZoom(), 5.2), duration: 450 });
  }, [selected]);

  return containerRef;
}

export function LakebasePage() {
  const { rows, loading, error } = useCareDesertData();
  const [categoryId, setCategoryId] = useState<CategoryId>('overall');
  const [stateFilter, setStateFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shortlist, setShortlist] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(SHORTLIST_KEY) ?? '[]') as string[];
    } catch {
      return [];
    }
  });

  const category = CATEGORIES.find((item) => item.id === categoryId) ?? CATEGORIES[0];

  const points = useMemo(() => rows.map((row, index) => {
    const [latitude, longitude] = coordinateFor(row, index);
    const riskLabel = normalize(row[category.riskField]) || 'Unknown';
    const households = toNumber(row.households_surveyed);
    const women = toNumber(row.women_15_49_interviewed);

    return {
      id: `${normalize(row.district_name)}||${normalize(row.state_ut)}`,
      district: normalize(row.district_name) || 'Unknown district',
      state: normalize(row.state_ut) || 'Unknown state',
      latitude,
      longitude,
      households,
      women,
      riskLabel,
      severity: riskToSeverity(riskLabel),
      confidence: Math.min(1, Math.max(0.18, Math.log10(Math.max(10, households)) / 5)),
      dataPoor: households < 500,
      scores: category.scoreFields.map((field) => ({
        label: SCORE_LABELS[field] ?? String(field),
        value: row[field] === null ? null : toNumber(row[field]),
      })),
    } satisfies DistrictPoint;
  }), [category, rows]);

  const states = useMemo(() => Array.from(new Set(points.map((point) => point.state))).sort(), [points]);
  const scoped = useMemo(() => points.filter((point) => stateFilter === 'all' || point.state === stateFilter), [points, stateFilter]);
  const ranked = useMemo(() => [...scoped].filter((point) => !point.dataPoor).sort((a, b) => b.severity - a.severity).slice(0, 12), [scoped]);
  const selected = useMemo(() => points.find((point) => point.id === selectedId) ?? null, [points, selectedId]);
  const mapRef = useMapboxHeatmap(scoped, selected, setSelectedId);

  const counts = useMemo(() => scoped.reduce(
    (acc, point) => {
      if (point.dataPoor) acc.dataPoor += 1;
      else if (point.severity >= 0.75) acc.high += 1;
      else if (point.severity >= 0.45) acc.moderate += 1;
      else acc.adequate += 1;
      return acc;
    },
    { high: 0, moderate: 0, adequate: 0, dataPoor: 0 },
  ), [scoped]);

  const categoryCounts = useMemo(() => CATEGORIES.reduce<Record<CategoryId, number>>((acc, item) => {
    acc[item.id] = rows.filter((row) => riskToSeverity(normalize(row[item.riskField])) >= 0.75).length;
    return acc;
  }, {} as Record<CategoryId, number>), [rows]);

  const shortlistPoints = shortlist
    .map((id) => points.find((point) => point.id === id))
    .filter((point): point is DistrictPoint => Boolean(point));

  const toggleShortlist = (point: DistrictPoint) => {
    setShortlist((current) => {
      const next = current.includes(point.id) ? current.filter((id) => id !== point.id) : [...current, point.id];
      localStorage.setItem(SHORTLIST_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <div className="cai-shell">
      <header className="cai-topbar">
        <div className="cai-brandmark"><Stethoscope size={16} /></div>
        <div>
          <h1>CareAccess India</h1>
          <p>Medical desert planner</p>
        </div>
        <div className="cai-topbar-meta">Lakebase synced indicators - NFHS-aligned district signals</div>
      </header>

      <div className="cai-body">
        <aside className="cai-left-panel">
          <SectionLabel>Care need</SectionLabel>
          <div className="cai-category-list">
            {CATEGORIES.map((item) => {
              const Icon = item.icon;
              const active = item.id === categoryId;
              return (
                <button key={item.id} className={`cai-category ${active ? 'is-active' : ''}`} onClick={() => { setCategoryId(item.id); setSelectedId(null); }}>
                  <span className="cai-category-icon"><Icon size={16} /></span>
                  <span>
                    <b>{item.short}</b>
                    <small>{categoryCounts[item.id] ?? 0} high-risk districts</small>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="cai-divider" />
          <SectionLabel>State</SectionLabel>
          <select className="cai-select" value={stateFilter} onChange={(event) => { setStateFilter(event.target.value); setSelectedId(null); }}>
            <option value="all">All India</option>
            {states.map((state) => <option key={state} value={state}>{state}</option>)}
          </select>

          <div className="cai-divider" />
          <SectionLabel>Legend</SectionLabel>
          <div className="cai-legend">
            <LegendDot color="#dc2626" label="High care gap" />
            <LegendDot color="#f59e0b" label="Moderate gap" />
            <LegendDot color="#16a34a" label="Adequate coverage" />
            <LegendDot color="#9aa3af" label="Data-poor evidence" hollow />
            <div className="cai-legend-note">Heat intensity combines risk severity and surveyed households.</div>
          </div>

          <div className="cai-divider" />
          <div className="cai-shortlist-head"><SectionLabel>Shortlist</SectionLabel><span>{shortlistPoints.length}</span></div>
          {shortlistPoints.length === 0 ? <p className="cai-empty-copy">Open a district and save it here for planning follow-up.</p> : (
            <div className="cai-shortlist">
              {shortlistPoints.map((point) => (
                <button key={point.id} className="cai-shortlist-chip" onClick={() => setSelectedId(point.id)}>
                  <span style={{ background: severityColor(point.severity, point.dataPoor) }} />
                  <b>{point.district}</b>
                  <small>{point.state}</small>
                </button>
              ))}
            </div>
          )}
        </aside>

        <main className="cai-map-stage">
          <div ref={mapRef} className="cai-map" />
          <div className="cai-map-caption">
            <span>India - District level</span>
            <b>{category.short}</b>
            <small>{category.cap}</small>
          </div>
          {loading && <MapOverlayState title="Loading Lakebase data" />}
          {error && <MapOverlayState title="Lakebase query failed" detail={error} tone="error" />}
          {!loading && !error && scoped.length === 0 && <MapOverlayState title="No district rows" detail="Change the state or care-need filter." />}
          <div className="cai-stat-strip">
            <StatCard value={counts.high} label="High-risk gaps" tone="red" />
            <StatCard value={counts.dataPoor} label="Data-poor" tone="slate" />
            <StatCard value={counts.adequate} label="Adequate" tone="green" />
          </div>
        </main>

        <aside className="cai-right-panel">
          {selected ? (
            <DistrictDetail point={selected} saved={shortlist.includes(selected.id)} onBack={() => setSelectedId(null)} onToggleSave={() => toggleShortlist(selected)} />
          ) : (
            <RankedList ranked={ranked} category={category} scope={stateFilter === 'all' ? 'All India' : stateFilter} dataPoorCount={counts.dataPoor} onSelect={setSelectedId} loading={loading} />
          )}
        </aside>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="cai-section-label">{children}</div>;
}

function LegendDot({ color, label, hollow = false }: { color: string; label: string; hollow?: boolean }) {
  return <div className="cai-legend-row"><span style={{ background: hollow ? '#fff' : color, borderColor: color, borderStyle: hollow ? 'dashed' : 'solid' }} />{label}</div>;
}

function StatCard({ value, label, tone }: { value: number; label: string; tone: 'red' | 'slate' | 'green' }) {
  return <div className="cai-stat-card"><b className={`tone-${tone}`}>{formatNumber(value)}</b><span>{label}</span></div>;
}

function MapOverlayState({ title, detail, tone = 'neutral' }: { title: string; detail?: string; tone?: 'neutral' | 'error' }) {
  return <div className={`cai-map-state ${tone === 'error' ? 'is-error' : ''}`}>{tone === 'error' ? <AlertTriangle size={16} /> : <ShieldCheck size={16} />}<b>{title}</b>{detail && <span>{detail}</span>}</div>;
}

function RankedList({ ranked, category, scope, dataPoorCount, onSelect, loading }: { ranked: DistrictPoint[]; category: Category; scope: string; dataPoorCount: number; onSelect: (id: string) => void; loading: boolean }) {
  if (loading) return <div className="cai-ranked-panel"><SectionLabel>Highest-risk districts</SectionLabel><div className="cai-skeleton-stack">{Array.from({ length: 9 }, (_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div></div>;

  return (
    <div className="cai-ranked-panel">
      <SectionLabel>Highest-risk districts</SectionLabel>
      <p>{category.short} - {scope}</p>
      {ranked.map((point, index) => (
        <button key={point.id} className="cai-rank-row" onClick={() => onSelect(point.id)}>
          <span className="cai-rank-num">{index + 1}</span>
          <span className="cai-rank-main"><b>{point.district}</b><small>{point.state} - {formatNumber(point.households)} households</small><i><em style={{ width: `${Math.round(point.severity * 100)}%`, background: severityColor(point.severity) }} /></i></span>
          <span className="cai-rank-score" style={{ color: severityColor(point.severity) }}><b>{Math.round(point.severity * 100)}</b><small>severity</small></span>
        </button>
      ))}
      <div className="cai-note"><b>{dataPoorCount} districts</b> are held out as data-poor because surveyed-household evidence is thin.</div>
    </div>
  );
}

function DistrictDetail({ point, saved, onBack, onToggleSave }: { point: DistrictPoint; saved: boolean; onBack: () => void; onToggleSave: () => void }) {
  return (
    <div className="cai-detail-panel">
      <div className="cai-detail-actions">
        <button onClick={onBack}><ChevronLeft size={13} /> All districts</button>
        <button className={saved ? 'is-saved' : ''} onClick={onToggleSave}><Star size={13} fill={saved ? 'currentColor' : 'none'} /> {saved ? 'Saved' : 'Save'}</button>
      </div>
      <h2>{point.district}</h2>
      <p>{point.state} - {formatNumber(point.households)} households surveyed</p>
      {point.dataPoor && <div className="cai-warning"><AlertTriangle size={16} /><span><b>Data-poor region.</b> Interpret the apparent gap cautiously until local evidence improves.</span></div>}
      <div className="cai-detail-metrics">
        <MetricBox label="Gap severity" value={Math.round(point.severity * 100)} suffix="/100" tone={severityColor(point.severity, point.dataPoor)} caption={severityLabel(point.severity, point.dataPoor)} />
        <MetricBox label="Evidence confidence" value={Math.round(point.confidence * 100)} suffix="%" tone="#0d9488" caption={point.confidence >= 0.66 ? 'High' : point.confidence >= 0.4 ? 'Moderate' : 'Low'} />
      </div>
      <SectionLabel>Evidence breakdown</SectionLabel>
      <div className="cai-score-list">
        {point.scores.map((score) => <div key={score.label}><span>{score.label}</span><b>{score.value === null ? 'n/a' : `${score.value.toFixed(score.value % 1 === 0 ? 0 : 1)}%`}</b></div>)}
      </div>
      <div className="cai-assessment">
        <SectionLabel>Assessment</SectionLabel>
        <p>{point.district} is currently classified as <b>{point.riskLabel}</b>. The signal is based on Lakebase district indicators and weighted by surveyed-household evidence.</p>
        <div><SectionLabel>Recommended action</SectionLabel><p>{point.severity >= 0.75 ? 'Prioritize field validation and targeted resource planning for this district.' : point.severity >= 0.45 ? 'Review service coverage and validate moderate care gaps before committing resources.' : 'Maintain monitoring cadence and focus resources on higher-risk districts.'}</p></div>
      </div>
    </div>
  );
}

function MetricBox({ label, value, suffix, tone, caption }: { label: string; value: number; suffix: string; tone: string; caption: string }) {
  return <div className="cai-metric-box"><span>{label}</span><div><b style={{ color: tone }}>{value}</b><small>{suffix}</small></div><em style={{ color: tone }}>{caption}</em></div>;
}
