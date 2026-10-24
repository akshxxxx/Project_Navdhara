import L from 'leaflet';
import { Layers, Maximize, Minus, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMapEvents } from 'react-leaflet';

import { readJson, writeJson, KEYS } from '@/api/storage';
import { SEGMENTS, TOWNS } from '@/domain/corridor';
import { LEVELS, LEVEL_ORDER, type LevelKey } from '@/domain/levels';
import { toTown, type LatLng, type Stretch } from '@/domain/stretch';

// The risk-coloured road on map tiles, drawn with Leaflet (the web dashboard uses Leaflet too).
// Same look as the app's map (App/src/components/CorridorMap.tsx): a white casing under each stretch's
// risk colour, closed stretches dashed, a "!" badge on High, Severe and Closed stretches, town dots.
// The Schematic style needs no tiles, so the road still draws with no internet.

export type MapStyleId = 'terrain' | 'streets' | 'satellite' | 'schematic';

const esri = (service: string) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/{z}/{y}/{x}`;
const ESRI_CREDIT = '© Esri, HERE, Garmin, USGS, NGA, OpenStreetMap contributors';

// Keyless tile sources, as in the app. A light veil keeps the risk colours the strongest thing on the map.
const STYLES: Record<MapStyleId, { label: string; hint: string; url?: string; credit?: string; opacity: number }> = {
  terrain: {
    label: 'Mountain terrain',
    hint: 'Hills, rivers and towns',
    url: esri('World_Topo_Map'),
    credit: ESRI_CREDIT,
    opacity: 0.85,
  },
  streets: {
    label: 'Clean streets',
    hint: 'Roads and places',
    url: esri('World_Street_Map'),
    credit: ESRI_CREDIT,
    opacity: 0.8,
  },
  satellite: {
    label: 'Satellite',
    hint: 'Photo from above',
    url: esri('World_Imagery'),
    credit: '© Esri, Maxar, Earthstar Geographics',
    opacity: 1,
  },
  schematic: { label: 'Schematic', hint: 'Works without internet', opacity: 1 },
};
const STYLE_IDS = Object.keys(STYLES) as MapStyleId[];

function savedStyle(): MapStyleId {
  const s = readJson<MapStyleId>(KEYS.mapStyle);
  return s && STYLE_IDS.includes(s) ? s : 'terrain';
}

const BADGE_ICONS: Partial<Record<LevelKey, L.DivIcon>> = {};
function badgeIcon(level: LevelKey): L.DivIcon {
  BADGE_ICONS[level] ??= L.divIcon({
    className: '',
    html: `<div class="risk-badge-icon" style="background:${LEVELS[level].color}">!</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 34],
  });
  return BADGE_ICONS[level]!;
}

const pinIcon = (color: string) =>
  L.divIcon({
    className: '',
    html: `<svg width="34" height="44" viewBox="0 0 34 44" aria-hidden="true"><path d="M17 43C17 43 3 26 3 16a14 14 0 0 1 28 0c0 10-14 27-14 27z" fill="${color}" stroke="#fff" stroke-width="2.5"/><circle cx="17" cy="16" r="5.5" fill="#fff"/></svg>`,
    iconSize: [34, 44],
    iconAnchor: [17, 43],
  });
const END_PIN = pinIcon(LEVELS.severe.color);
const SPOT_PIN = pinIcon('#1F5F6B');

const boundsOf = (pts: LatLng[]) => L.latLngBounds(pts.map(([a, b]) => L.latLng(a, b)));

/** Where each town sits on the road: the first point of the stretch starting there, or the last of the one ending there */
function townPoints(stretches: Stretch[]) {
  const byId = Object.fromEntries(stretches.map((s) => [s.id, s]));
  return TOWNS.flatMap((tw) => {
    const startSeg = SEGMENTS.find((g) => Math.abs(g.kmStart - tw.km) < 0.01);
    const endSeg = SEGMENTS.find((g) => Math.abs(g.kmEnd - tw.km) < 0.01);
    const s = startSeg ? byId[startSeg.id] : endSeg ? byId[endSeg.id] : null;
    if (!s?.coords.length) return [];
    const p = startSeg ? s.coords[0] : s.coords[s.coords.length - 1];
    return [{ ...tw, p }];
  });
}

export interface CorridorMapProps {
  stretches: Stretch[];
  /** Only draw these stretches (route view). Default: all. */
  visibleIds?: string[];
  /** Colour by these levels instead of each stretch's live level (risk at arrival time). */
  levelOverride?: Record<string, LevelKey>;
  selectedId?: string | null;
  /** Fit the view to these stretches; change focusKey to fly there again. */
  focusIds?: string[] | null;
  focusKey?: string | number;
  onSelect?: (id: string) => void;
  /** A click anywhere on the map (Reports: "tap the road") */
  onMapClick?: (p: LatLng) => void;
  controls?: 'full' | 'compact' | false;
  legend?: boolean;
  markers?: { start?: LatLng; end?: LatLng; spot?: LatLng };
  /** Hover text for each stretch */
  tooltip?: (s: Stretch, level: LevelKey) => React.ReactNode;
  /** Zoom with the mouse wheel. Off for maps inside long pages, so the wheel still scrolls the page. */
  wheelZoom?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function CorridorMap({
  stretches,
  visibleIds,
  levelOverride,
  selectedId,
  focusIds,
  focusKey,
  onSelect,
  onMapClick,
  controls = 'full',
  legend = false,
  markers,
  tooltip,
  wheelZoom = false,
  className,
  children,
}: CorridorMapProps) {
  const [map, setMap] = useState<L.Map | null>(null);
  const [style, setStyleState] = useState<MapStyleId>(savedStyle);
  const [menuOpen, setMenuOpen] = useState(false);
  const [allLabels, setAllLabels] = useState(false);
  const [zoom, setZoom] = useState(9);
  const [tiles, setTiles] = useState({ ok: 0, failed: 0 });

  const setStyle = (id: MapStyleId) => {
    writeJson(KEYS.mapStyle, id);
    setTiles({ ok: 0, failed: 0 });
    setStyleState(id);
    setMenuOpen(false);
  };

  const visible = useMemo(
    () => (visibleIds ? stretches.filter((s) => visibleIds.includes(s.id)) : stretches),
    [stretches, visibleIds],
  );
  const levelOf = (s: Stretch) => levelOverride?.[s.id] ?? s.level;

  const fitBounds = useMemo(() => {
    const ids = focusIds?.length ? focusIds : visible.map((s) => s.id);
    const pts = stretches.filter((s) => ids.includes(s.id)).flatMap((s) => s.coords);
    return pts.length ? boundsOf(pts) : null;
  }, [focusIds, visible, stretches]);

  const fit = (animate: boolean) => {
    if (!map || !fitBounds) return;
    const opts = { padding: [60, 60] as [number, number], maxZoom: 12 };
    if (animate) map.flyToBounds(fitBounds, { ...opts, duration: 0.6 });
    else map.fitBounds(fitBounds, opts);
  };

  // Fly whenever the focus changes
  useEffect(() => {
    fit(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, focusKey]);

  // Leaflet measures its box once; tell it when the page layout changes the box size
  useEffect(() => {
    if (!map) return;
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);

  const towns = useMemo(() => {
    const routeTowns = new Set(visibleIds ? visible.flatMap((s) => [s.from, toTown(s)]) : []);
    const selected = selectedId ? stretches.find((s) => s.id === selectedId) : null;
    const selectedTowns = selected ? [selected.from, toTown(selected)] : [];
    return townPoints(stretches)
      .filter((tw) => !visibleIds || routeTowns.has(tw.name))
      .map((tw) => ({
        ...tw,
        big: tw.major || selectedTowns.includes(tw.name),
        labelled: allLabels || tw.major || zoom >= 11 || selectedTowns.includes(tw.name),
      }));
  }, [stretches, visible, visibleIds, selectedId, allLabels, zoom]);

  const st = STYLES[style];
  const tilesFailing = tiles.failed >= 4 && tiles.ok === 0;

  if (!fitBounds) return <div className={`map-box ${className ?? ''}`} />;

  return (
    <div className={`map-box ${style === 'schematic' ? 'schematic' : ''} ${className ?? ''}`}>
      <MapContainer
        ref={setMap}
        bounds={fitBounds}
        boundsOptions={{ padding: [40, 40] }}
        zoomControl={false}
        attributionControl={!!st.url}
        minZoom={7}
        maxZoom={17}
        scrollWheelZoom={wheelZoom}
        zoomSnap={0.25}
        style={{ height: '100%', width: '100%' }}
      >
        {st.url ? (
          <TileLayer
            key={style}
            url={st.url}
            attribution={st.credit}
            opacity={st.opacity}
            eventHandlers={{
              tileload: () => setTiles((t) => (t.ok ? t : { ...t, ok: 1 })),
              tileerror: () => setTiles((t) => ({ ...t, failed: t.failed + 1 })),
            }}
          />
        ) : null}
        <ZoomWatcher onZoom={setZoom} onClick={onMapClick} />

        {/* Darker halo under the selected stretch */}
        {visible
          .filter((s) => s.id === selectedId)
          .map((s) => (
            <Polyline
              key={`sel-${s.id}`}
              positions={s.coords}
              interactive={false}
              pathOptions={{ color: '#1B2A33', opacity: 0.28, weight: 26, lineCap: 'round', lineJoin: 'round' }}
            />
          ))}
        {visible.map((s) => (
          <Polyline
            key={`case-${s.id}`}
            positions={s.coords}
            interactive={false}
            pathOptions={{ color: '#fff', weight: 12, lineCap: 'round', lineJoin: 'round' }}
          />
        ))}
        {visible.map((s) => {
          const level = levelOf(s);
          return (
            <Polyline
              key={`risk-${s.id}-${level}-${s.id === selectedId}`}
              positions={s.coords}
              interactive={false}
              pathOptions={{
                color: LEVELS[level].color,
                weight: s.id === selectedId ? 9 : 7,
                dashArray: level === 'closed' ? '10 7' : undefined,
                lineCap: level === 'closed' ? 'butt' : 'round',
                lineJoin: 'round',
              }}
            />
          );
        })}

        {visible
          .filter((s) => LEVELS[levelOf(s)].rank >= 2 && s.coords.length)
          .map((s) => (
            <Marker
              key={`badge-${s.id}-${levelOf(s)}`}
              position={s.coords[Math.floor(s.coords.length / 2)]}
              icon={badgeIcon(levelOf(s))}
              interactive={false}
              keyboard={false}
            />
          ))}

        {/* Wide, invisible lines on top: easy to hover and click */}
        {visible.map((s) => (
          <Polyline
            key={`hit-${s.id}`}
            positions={s.coords}
            pathOptions={{ color: '#000', opacity: 0.001, weight: 26 }}
            interactive={!!onSelect || !!tooltip}
            bubblingMouseEvents={!onSelect}
            eventHandlers={onSelect ? { click: () => onSelect(s.id) } : undefined}
          >
            {tooltip ? (
              <Tooltip sticky className="stretch-tip">
                {tooltip(s, levelOf(s))}
              </Tooltip>
            ) : null}
          </Polyline>
        ))}

        {towns.map((tw) => (
          <CircleMarker
            key={`town-${tw.name}-${tw.labelled}`}
            center={tw.p}
            radius={tw.big ? 7 : 5}
            interactive={false}
            pathOptions={{ color: '#1B2A33', weight: 2.5, fillColor: '#fff', fillOpacity: 1 }}
          >
            {tw.labelled ? (
              <Tooltip
                permanent
                direction="right"
                offset={[8, 12]}
                className={`town-label ${tw.big ? '' : 'minor'}`}
              >
                {tw.name}
              </Tooltip>
            ) : null}
          </CircleMarker>
        ))}

        {markers?.start ? (
          <CircleMarker
            center={markers.start}
            radius={10}
            interactive={false}
            pathOptions={{ color: '#2E7D57', weight: 4.5, fillColor: '#fff', fillOpacity: 1 }}
          />
        ) : null}
        {markers?.end ? <Marker position={markers.end} icon={END_PIN} interactive={false} keyboard={false} /> : null}
        {markers?.spot ? <Marker position={markers.spot} icon={SPOT_PIN} interactive={false} keyboard={false} /> : null}
      </MapContainer>

      {children}

      {controls ? (
        <>
          <div className={`map-controls ${controls === 'compact' ? 'compact' : ''}`}>
            <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => map?.zoomIn()}>
              <Plus size={22} />
            </button>
            <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => map?.zoomOut()}>
              <Minus size={22} />
            </button>
            <button
              type="button"
              aria-label="Fit the whole corridor"
              title="Fit the whole corridor"
              onClick={() => {
                if (!map) return;
                const all = boundsOf((visibleIds ? visible : stretches).flatMap((s) => s.coords));
                map.flyToBounds(all, { padding: [40, 40], duration: 0.6 });
              }}
            >
              <Maximize size={19} />
            </button>
            <button
              type="button"
              aria-label="Map style"
              title="Map style"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <Layers size={20} />
            </button>
          </div>
          {menuOpen ? (
            <div className="map-style-menu" role="menu">
              {STYLE_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={style === id}
                  className={style === id ? 'on' : ''}
                  onClick={() => setStyle(id)}
                >
                  <span className="strong">{STYLES[id].label}</span>
                  <span className="hint">{STYLES[id].hint}</span>
                </button>
              ))}
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={allLabels}
                onClick={() => {
                  setAllLabels((v) => !v);
                  setMenuOpen(false);
                }}
              >
                <span className="strong">{allLabels ? 'Show main towns only' : 'Show all 19 town names'}</span>
                <span className="hint">Town names on the map</span>
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {legend ? <Legend /> : null}
      {tilesFailing ? <div className="map-attribution-note">Map needs internet · road still shown</div> : null}
    </div>
  );
}

function ZoomWatcher({ onZoom, onClick }: { onZoom: (z: number) => void; onClick?: (p: LatLng) => void }) {
  const map = useMapEvents({
    zoomend: () => onZoom(map.getZoom()),
    click: (e) => onClick?.([e.latlng.lat, e.latlng.lng]),
  });
  useEffect(() => onZoom(map.getZoom()), [map, onZoom]);
  return null;
}

export function Legend() {
  return (
    <div className="legend">
      <div className="eyebrow muted">Road risk</div>
      <div className="legend-items">
        {LEVEL_ORDER.map((k) => (
          <span key={k} className="legend-item">
            <span className="legend-swatch" style={{ background: LEVELS[k].color }} />
            {LEVELS[k].label}
          </span>
        ))}
      </div>
    </div>
  );
}
