import { Layers, Maximize, Minus, Plus } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Text as SvgText } from 'react-native-svg';

import { SEGMENTS, TOWNS } from '@/domain/corridor';
import { LEVELS, type LevelKey } from '@/domain/levels';
import type { LatLng, Stretch } from '@/domain/stretch';
import { colors, fonts, radius, shadow } from '@/theme/tokens';

import { PickerSheet } from './PickerSheet';
import { Txt } from './ui';

// The risk-coloured road is drawn with react-native-svg from the backend's geometry, over map tiles
// (terrain, streets or satellite) placed as plain images. No map SDK or API key is needed, so it runs
// the same in Expo Go, on the web and in a release build. Without network the tiles are missing but the
// road, colours and towns still draw; the Schematic style needs no network at all.

const MAX_POINTS = 90;
const TILE = 256;
/** World units are Web Mercator in 0..1, so pixels per unit at zoom z is 256 * 2^z */
const MIN_S = TILE * 2 ** 6;
const MAX_S = TILE * 2 ** 17;
const FIT_MAX_S = TILE * 2 ** 15;
const clampS = (s: number) => Math.min(Math.max(s, MIN_S), MAX_S);

type XY = [number, number];
interface View2D {
  cx: number;
  cy: number;
  s: number; // pixels per world unit
}

export type MapStyleId = 'terrain' | 'streets' | 'satellite' | 'schematic';

interface TileStyle {
  label: string;
  maxZoom: number;
  url: (z: number, x: number, y: number) => string;
  attribution: string;
  background: string;
  /** White wash over the tiles so the risk colours stay the strongest thing on the map */
  veil: number;
  hint: string;
}

// Keyless tile sources. The web dashboard uses OpenTopoMap and CARTO; CARTO now answers every tile with
// "API KEY REQUIRED", and OpenTopoMap is dark and busy at corridor zoom, so the app uses Esri's maps.
const esri = (service: string) => (z: number, x: number, y: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/${z}/${y}/${x}`;

export const MAP_STYLES: Record<Exclude<MapStyleId, 'schematic'>, TileStyle> = {
  terrain: {
    label: 'Mountain terrain',
    maxZoom: 17,
    url: esri('World_Topo_Map'),
    hint: 'Hills, rivers and towns',
    attribution: '© Esri, HERE, Garmin, USGS, NGA, OpenStreetMap contributors',
    background: '#EEF0E8',
    veil: 0.12,
  },
  streets: {
    label: 'Clean streets',
    maxZoom: 18,
    url: esri('World_Street_Map'),
    hint: 'Roads and places',
    attribution: '© Esri, HERE, Garmin, USGS, NGA, OpenStreetMap contributors',
    background: '#F4F1E6',
    veil: 0.2,
  },
  satellite: {
    label: 'Satellite',
    maxZoom: 18,
    url: esri('World_Imagery'),
    hint: 'Photo from above',
    attribution: '© Esri, Maxar, Earthstar Geographics',
    background: '#33402F',
    veil: 0,
  },
};

// Tile servers ask apps to identify themselves (the browser sends its own on the web)
const TILE_HEADERS = { 'User-Agent': 'RaahApp/1.0 (NH-7 landslide risk; Expo)' };

// The chosen style is shared by every map in the app for the rest of the session
let sessionStyle: MapStyleId = 'terrain';
const rememberStyle = (id: MapStyleId) => {
  sessionStyle = id;
};

// react-native-svg's onPress hands responder props to the DOM on web (console noise); a plain click works there
const pressProps = (fn: () => void) => (Platform.OS === 'web' ? ({ onClick: fn } as object) : { onPress: fn });

/** Web Mercator, scaled to 0..1 (the tile grid) */
const toWorld = ([lat, lng]: LatLng): XY => {
  const sin = Math.sin((lat * Math.PI) / 180);
  return [(lng + 180) / 360, 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)];
};

function decimate(coords: LatLng[]): LatLng[] {
  if (coords.length <= MAX_POINTS) return coords;
  const step = coords.length / MAX_POINTS;
  const out: LatLng[] = [];
  for (let i = 0; i < MAX_POINTS; i++) out.push(coords[Math.floor(i * step)]);
  out.push(coords[coords.length - 1]);
  return out;
}

function bbox(points: XY[]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
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
  controls?: boolean;
  markers?: { start?: LatLng; end?: LatLng };
  /** Space covered by floating UI, so fitting keeps the road visible */
  insets?: { top?: number; bottom?: number; right?: number };
  /** Distance of the tile credit line from the bottom (keep it above sheets and legends) */
  attributionBottom?: number;
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
}

export function CorridorMap({
  stretches,
  visibleIds,
  levelOverride,
  selectedId,
  focusIds,
  focusKey,
  onSelect,
  controls,
  markers,
  insets,
  attributionBottom = 4,
  style,
  interactive = true,
}: CorridorMapProps) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View2D | null>(null);
  const [mapStyle, setMapStyleState] = useState<MapStyleId>(sessionStyle);
  const [tilesFailing, setTilesFailing] = useState(false);
  const tileStats = useRef({ ok: 0, failed: 0 });
  const setMapStyle = (id: MapStyleId) => {
    rememberStyle(id);
    tileStats.current = { ok: 0, failed: 0 };
    setTilesFailing(false);
    setMapStyleState(id);
  };
  // Contour rings and the drawn river only belong on the schematic style; tiles show the real ones
  const terrain = mapStyle === 'schematic';
  const [allLabels, setAllLabels] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const viewRef = useRef<View2D | null>(null);
  const anim = useRef<number | null>(null);
  const interactiveRef = useRef(interactive);
  // The ref mirrors the state so gesture and animation callbacks read the latest view without re-binding
  const applyView = useCallback((v: View2D) => {
    viewRef.current = v;
    setView(v);
  }, []);
  useEffect(() => {
    interactiveRef.current = interactive;
  }, [interactive]);
  const top = insets?.top ?? 0;
  const bottom = insets?.bottom ?? 0;

  const visible = useMemo(
    () => (visibleIds ? stretches.filter((s) => visibleIds.includes(s.id)) : stretches),
    [stretches, visibleIds],
  );

  // World geometry, computed once per data set
  const world = useMemo(() => {
    const lines: Record<string, XY[]> = {};
    for (const s of stretches) lines[s.id] = decimate(s.coords).map(toWorld);
    const towns: { name: string; major: boolean; p: XY; km: number }[] = [];
    for (const t of TOWNS) {
      const startSeg = SEGMENTS.find((g) => Math.abs(g.kmStart - t.km) < 0.01);
      const endSeg = SEGMENTS.find((g) => Math.abs(g.kmEnd - t.km) < 0.01);
      const line = startSeg ? lines[startSeg.id] : endSeg ? lines[endSeg.id] : null;
      if (!line?.length) continue;
      towns.push({ name: t.name, major: t.major, km: t.km, p: startSeg ? line[0] : line[line.length - 1] });
    }
    const all = Object.values(lines).flat();
    return { lines, towns, box: all.length ? bbox(all) : null };
  }, [stretches]);

  const fitView = useCallback(
    (ids: string[] | null | undefined, w: number, h: number): View2D | null => {
      const pts = (ids?.length ? ids : visible.map((s) => s.id)).flatMap((id) => world.lines[id] ?? []);
      if (!pts.length || !w || !h) return null;
      const b = bbox(pts);
      // Tight side padding: on a 360 dp phone the corridor needs the whole width to be readable
      const padX = 22;
      const padY = 30;
      const usableH = Math.max(80, h - top - bottom - padY * 2);
      const usableW = Math.max(80, w - padX * 2 - (insets?.right ?? 0));
      const bw = Math.max(b.maxX - b.minX, 1e-6);
      const bh = Math.max(b.maxY - b.minY, 1e-6);
      const s = Math.min(usableW / bw, usableH / bh, FIT_MAX_S);
      return { cx: (b.minX + b.maxX) / 2 + (insets?.right ?? 0) / 2 / s, cy: (b.minY + b.maxY) / 2, s };
    },
    [visible, world, top, bottom, insets?.right],
  );

  const animateTo = useCallback(
    (target: View2D) => {
      const from = viewRef.current;
      if (anim.current != null) cancelAnimationFrame(anim.current);
      if (!from) {
        applyView(target);
        return;
      }
      const start = Date.now();
      const dur = 420;
      const step = () => {
        const t = Math.min(1, (Date.now() - start) / dur);
        const e = 1 - Math.pow(1 - t, 3);
        applyView({
          cx: from.cx + (target.cx - from.cx) * e,
          cy: from.cy + (target.cy - from.cy) * e,
          s: Math.exp(Math.log(from.s) + (Math.log(target.s) - Math.log(from.s)) * e),
        });
        if (t < 1) anim.current = requestAnimationFrame(step);
      };
      anim.current = requestAnimationFrame(step);
    },
    [applyView],
  );

  useEffect(
    () => () => {
      if (anim.current != null) cancelAnimationFrame(anim.current);
    },
    [],
  );

  // Fit on first layout and fly whenever the focus changes
  useEffect(() => {
    if (!size.w) return;
    const v = fitView(focusIds, size.w, size.h);
    if (!v) return;
    if (viewRef.current) animateTo(v);
    else applyView(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h, focusKey, world]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - size.w) > 1 || Math.abs(height - size.h) > 1) setSize({ w: width, h: height });
  };

  const zoomBy = (f: number) => {
    const v = viewRef.current;
    if (v) animateTo({ ...v, s: clampS(v.s * f) });
  };

  // Drag to pan, two fingers to zoom. Taps fall through to the road.
  const gesture = useRef<{ start: View2D; dist: number | null } | null>(null);
  const pinchDist = (e: GestureResponderEvent) => {
    const t = e.nativeEvent.touches;
    if (!t || t.length < 2) return null;
    return Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
  };
  // Created once; its callbacks only touch refs when a gesture happens, never during render
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (e, g) =>
        interactiveRef.current && (Math.abs(g.dx) + Math.abs(g.dy) > 6 || (e.nativeEvent.touches?.length ?? 0) > 1),
      onPanResponderGrant: (e) => {
        if (anim.current != null) cancelAnimationFrame(anim.current);
        if (viewRef.current) gesture.current = { start: viewRef.current, dist: pinchDist(e) };
      },
      onPanResponderMove: (e, g) => {
        const st = gesture.current;
        if (!st) return;
        const d = pinchDist(e);
        if (d && st.dist) {
          applyView({ ...st.start, s: clampS(st.start.s * (d / st.dist)) });
        } else if (d && !st.dist) {
          gesture.current = { start: viewRef.current ?? st.start, dist: d };
        } else {
          applyView({ ...st.start, cx: st.start.cx - g.dx / st.start.s, cy: st.start.cy - g.dy / st.start.s });
        }
      },
      onPanResponderRelease: () => {
        gesture.current = null;
      },
      onPanResponderTerminationRequest: () => true,
    }),
  );

  const fitAllScale = useMemo(() => fitView(null, size.w, size.h)?.s ?? 1, [fitView, size]);

  const tiles = useMemo(() => {
    if (!view || !size.w || mapStyle === 'schematic') return [];
    const st = MAP_STYLES[mapStyle];
    const midY = (top + (size.h - bottom)) / 2;
    const z = Math.max(0, Math.min(st.maxZoom, Math.round(Math.log2(view.s / TILE))));
    const n = 2 ** z;
    const px = view.s / n; // on-screen size of one tile
    const x0 = Math.floor((view.cx - size.w / 2 / view.s) * n);
    const x1 = Math.floor((view.cx + size.w / 2 / view.s) * n);
    const y0 = Math.max(0, Math.floor((view.cy - midY / view.s) * n));
    const y1 = Math.min(n - 1, Math.floor((view.cy + (size.h - midY) / view.s) * n));
    const out: { key: string; uri: string; left: number; top: number; size: number }[] = [];
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const wx = ((tx % n) + n) % n;
        out.push({
          key: `${mapStyle}/${z}/${tx}/${ty}`,
          uri: st.url(z, wx, ty),
          left: (tx / n - view.cx) * view.s + size.w / 2,
          top: (ty / n - view.cy) * view.s + midY,
          size: px + 0.5, // overlap a hair so no seams show
        });
      }
    }
    return out;
  }, [view, size, mapStyle, top, bottom]);

  const onTile = (ok: boolean) => {
    const t = tileStats.current;
    if (ok) t.ok++;
    else t.failed++;
    const failing = t.failed >= 4 && t.ok === 0;
    if (failing !== tilesFailing) setTilesFailing(failing);
  };

  const content = useMemo(() => {
    if (!view || !size.w || !world.box) return null;
    const midY = (top + (size.h - bottom)) / 2;
    const P = ([x, y]: XY): XY => [(x - view.cx) * view.s + size.w / 2, (y - view.cy) * view.s + midY];
    const pathOf = (pts: XY[]) =>
      pts.map((p, i) => `${i ? 'L' : 'M'}${P(p)[0].toFixed(1)} ${P(p)[1].toFixed(1)}`).join('');
    const levelOf = (s: Stretch) => levelOverride?.[s.id] ?? s.level;
    const zoomed = view.s > fitAllScale * 2.2;

    // Decorative contour rings: placed from the corridor's own box so they always sit behind the road
    const b = world.box;
    const bw = b.maxX - b.minX;
    const bh = b.maxY - b.minY;
    const anchors: [number, number, number][] = [
      [0.12, 0.25, 0.22],
      [0.42, 0.8, 0.26],
      [0.62, 0.15, 0.2],
      [0.85, 0.55, 0.24],
      [0.3, 0.45, 0.16],
      [0.95, 0.05, 0.18],
    ];

    const paths = visible.map((s) => ({ s, d: pathOf(world.lines[s.id] ?? []), level: levelOf(s) }));
    const townSet = new Set<string>();
    if (visibleIds) {
      for (const s of visible) {
        townSet.add(s.from);
        townSet.add(s.to.replace(/ \(.*\)$/, ''));
      }
    }
    const selected = selectedId ? stretches.find((s) => s.id === selectedId) : null;
    const selectedTowns = selected ? [selected.from, selected.to.replace(/ \(.*\)$/, '')] : [];

    const towns = world.towns.filter((t) => {
      if (visibleIds && !townSet.has(t.name)) return false;
      return allLabels || t.major || zoomed || selectedTowns.includes(t.name);
    });

    // Skip a name that would overlap one already placed (selected towns first, then major ones)
    const priority = (t: (typeof towns)[number]) => (selectedTowns.includes(t.name) ? 0 : t.major ? 1 : 2);
    // A name near the right edge goes to the left of its dot, so it is never cut off
    const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
    const labelled = new Map<string, { x: number; anchor: 'start' | 'end' }>();
    for (const t of [...towns].sort((a, b) => priority(a) - priority(b))) {
      const [x, y] = P(t.p);
      const fs = t.major || selectedTowns.includes(t.name) ? 14 : 12;
      const width = t.name.length * fs * 0.62;
      let pos: { x: number; anchor: 'start' | 'end' } = { x: x + 10, anchor: 'start' };
      if (x + 10 + width > size.w - 6)
        pos = x - 10 - width >= 6 ? { x: x - 10, anchor: 'end' } : { x: 6, anchor: 'start' };
      const x0 = pos.anchor === 'start' ? pos.x : pos.x - width;
      const box = { x0: x0 - 2, x1: x0 + width + 2, y0: y + 4, y1: y + 23 };
      if (placed.some((p) => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0)) continue;
      placed.push(box);
      labelled.set(t.name, pos);
    }

    return (
      <>
        {terrain ? (
          <G>
            {anchors.map(([ax, ay, r], i) => {
              const c = P([b.minX + ax * bw, b.minY + ay * bh]);
              const rx = r * bw * view.s;
              return [1, 0.72, 0.46, 0.22].map((k) => (
                <Ellipse
                  key={`${i}-${k}`}
                  cx={c[0]}
                  cy={c[1]}
                  rx={rx * k}
                  ry={rx * k * 0.42}
                  stroke={colors.contour}
                  strokeWidth={1.2}
                  fill="none"
                />
              ));
            })}
            <G transform="translate(6, 10)">
              {paths.map(({ s, d }) => (
                <Path key={`r-${s.id}`} d={d} stroke={colors.river} strokeWidth={5} fill="none" strokeLinecap="round" />
              ))}
            </G>
          </G>
        ) : null}

        {selected && (!visibleIds || visibleIds.includes(selected.id)) ? (
          <Path
            d={pathOf(world.lines[selected.id] ?? [])}
            stroke={colors.navy}
            strokeOpacity={0.28}
            strokeWidth={26}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {paths.map(({ s, d }) => (
          <Path
            key={`o-${s.id}`}
            d={d}
            stroke={colors.white}
            strokeWidth={12}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {paths.map(({ s, d, level }) => (
          <Path
            key={`c-${s.id}`}
            d={d}
            stroke={LEVELS[level].color}
            strokeWidth={s.id === selectedId ? 9 : 7}
            strokeDasharray={level === 'closed' ? '10 7' : undefined}
            fill="none"
            strokeLinecap={level === 'closed' ? 'butt' : 'round'}
            strokeLinejoin="round"
          />
        ))}

        {paths
          .filter(({ level }) => LEVELS[level].rank >= 2)
          .map(({ s, level }) => {
            const line = world.lines[s.id] ?? [];
            if (!line.length) return null;
            const [x, y] = P(line[Math.floor(line.length / 2)]);
            return (
              <G key={`b-${s.id}`}>
                <Circle
                  cx={x - 8}
                  cy={y - 24}
                  r={11}
                  fill={LEVELS[level].color}
                  stroke={colors.white}
                  strokeWidth={2.5}
                />
                <SvgText
                  x={x - 8}
                  y={y - 19}
                  fontSize={14}
                  fontFamily={fonts.bodyBold}
                  fontWeight="700"
                  fill={colors.white}
                  textAnchor="middle">
                  !
                </SvgText>
              </G>
            );
          })}

        {towns.map((t) => {
          const [x, y] = P(t.p);
          const big = t.major || selectedTowns.includes(t.name);
          const label = labelled.get(t.name);
          return (
            <G key={`t-${t.name}`}>
              <Circle cx={x} cy={y} r={big ? 7 : 5} fill={colors.white} stroke={colors.ink} strokeWidth={2.5} />
              {label ? (
                <>
                  <SvgText
                    x={label.x}
                    y={y + 19}
                    textAnchor={label.anchor}
                    fontSize={big ? 14 : 12}
                    fontFamily={fonts.bodyBold}
                    fontWeight="700"
                    stroke={colors.white}
                    strokeWidth={4}
                    strokeLinejoin="round"
                    fill={colors.white}>
                    {t.name}
                  </SvgText>
                  <SvgText
                    x={label.x}
                    y={y + 19}
                    textAnchor={label.anchor}
                    fontSize={big ? 14 : 12}
                    fontFamily={fonts.bodyBold}
                    fontWeight="700"
                    fill={colors.ink}>
                    {t.name}
                  </SvgText>
                </>
              ) : null}
            </G>
          );
        })}

        {markers?.start
          ? (() => {
              const [x, y] = P(toWorld(markers.start));
              return <Circle cx={x} cy={y} r={10} fill={colors.white} stroke={colors.green} strokeWidth={4.5} />;
            })()
          : null}
        {markers?.end
          ? (() => {
              const [x, y] = P(toWorld(markers.end));
              return (
                <G>
                  <Path
                    d={`M${x} ${y} L${x - 9} ${y - 18} A 12 12 0 1 1 ${x + 9} ${y - 18} Z`}
                    fill={LEVELS.severe.color}
                    stroke={colors.white}
                    strokeWidth={2}
                  />
                  <Circle cx={x} cy={y - 24} r={4.5} fill={colors.white} />
                </G>
              );
            })()
          : null}

        {onSelect
          ? paths.map(({ s, d }) => (
              <Path
                key={`h-${s.id}`}
                d={d}
                stroke="#000"
                strokeOpacity={0.01}
                strokeWidth={28}
                fill="none"
                strokeLinecap="round"
                {...pressProps(() => onSelect(s.id))}
              />
            ))
          : null}
      </>
    );
  }, [
    view,
    size,
    world,
    visible,
    visibleIds,
    levelOverride,
    selectedId,
    stretches,
    terrain,
    allLabels,
    markers,
    onSelect,
    top,
    bottom,
    fitAllScale,
  ]);

  return (
    <View
      style={[styles.wrap, mapStyle !== 'schematic' && { backgroundColor: MAP_STYLES[mapStyle].background }, style]}
      onLayout={onLayout}
      {...responder.panHandlers}>
      {tiles.length ? (
        // Clipped here too: tiles past the edge would make the map scrollable on the web, and the
        // browser then scrolls it when a button inside regains focus
        <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none">
          {tiles.map((t) => (
            <Image
              key={t.key}
              source={{ uri: t.uri, headers: TILE_HEADERS }}
              style={{ position: 'absolute', left: t.left, top: t.top, width: t.size, height: t.size }}
              fadeDuration={0}
              onLoad={() => onTile(true)}
              onError={() => onTile(false)}
            />
          ))}
          {MAP_STYLES[mapStyle as keyof typeof MAP_STYLES].veil ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: 'white', opacity: MAP_STYLES[mapStyle as keyof typeof MAP_STYLES].veil },
              ]}
            />
          ) : null}
        </View>
      ) : null}
      {size.w > 0 ? (
        // Its own positioned layer: on the web an absolute tile layer would otherwise paint over it
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Svg width={size.w} height={size.h} accessibilityLabel="Map of NH-7 coloured by landslide risk">
            {content}
          </Svg>
        </View>
      ) : null}

      {mapStyle !== 'schematic' ? (
        <View style={[styles.attribution, { bottom: attributionBottom }]} pointerEvents="none">
          <Txt style={styles.attributionText} numberOfLines={1}>
            {tilesFailing ? 'Map needs internet · road still shown' : MAP_STYLES[mapStyle].attribution}
          </Txt>
        </View>
      ) : null}

      {controls ? (
        <View style={[styles.controls, { bottom: bottom + 16 }]} pointerEvents="box-none">
          <View style={styles.controlGroup}>
            <CtrlButton label="Zoom in" onPress={() => zoomBy(1.6)} icon={<Plus size={22} color={colors.ink} />} />
            <View style={styles.divider} />
            <CtrlButton
              label="Zoom out"
              onPress={() => zoomBy(1 / 1.6)}
              icon={<Minus size={22} color={colors.ink} />}
            />
            <View style={styles.divider} />
            <CtrlButton
              label="Map style"
              onPress={() => setLayersOpen((v) => !v)}
              icon={<Layers size={20} color={colors.ink} />}
            />
            <View style={styles.divider} />
            <CtrlButton
              label="Fit the whole corridor"
              onPress={() => {
                const v = fitView(null, size.w, size.h);
                if (v) animateTo(v);
              }}
              icon={<Maximize size={19} color={colors.ink} />}
            />
          </View>
        </View>
      ) : null}
      {/* A bottom sheet, not a popover: a popover runs off the top of a short map */}
      <PickerSheet
        visible={layersOpen}
        title="Map style"
        value={mapStyle}
        options={[
          ...(Object.keys(MAP_STYLES) as (keyof typeof MAP_STYLES)[]).map((id) => ({
            value: id,
            label: MAP_STYLES[id].label,
            hint: MAP_STYLES[id].hint,
          })),
          { value: 'schematic', label: 'Schematic', hint: 'Works without internet' },
          {
            value: 'labels',
            label: allLabels ? 'Show main towns only' : 'Show all 19 town names',
            hint: 'Town names on the map',
          },
        ]}
        onPick={(v) => {
          if (v === 'labels') setAllLabels((x) => !x);
          else setMapStyle(v as MapStyleId);
        }}
        onClose={() => setLayersOpen(false)}
      />
    </View>
  );
}

function CtrlButton({ icon, onPress, label }: { icon: React.ReactNode; onPress: () => void; label: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.ctrl}>
      {icon}
    </Pressable>
  );
}

export function Legend() {
  return (
    <View style={styles.legend}>
      {(['low', 'moderate', 'high', 'severe', 'closed'] as LevelKey[]).map((k) => (
        <View key={k} style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: LEVELS[k].color }]} />
          <Txt variant="small" style={{ fontSize: 12 }}>
            {LEVELS[k].short}
          </Txt>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.mapBg, overflow: 'hidden' },
  controls: { position: 'absolute', right: 16 },
  controlGroup: { backgroundColor: colors.white, borderRadius: radius.md, ...shadow.float },
  ctrl: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1, backgroundColor: colors.line, marginHorizontal: 8 },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    ...shadow.card,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 14, height: 5, borderRadius: 3 },
  attribution: {
    position: 'absolute',
    right: 6,
    maxWidth: '80%',
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  attributionText: { fontSize: 9, lineHeight: 12, color: colors.inkMuted },
});
