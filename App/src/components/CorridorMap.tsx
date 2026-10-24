import { Layers, Maximize, Minus, Plus } from 'lucide-react-native';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
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

import { KEYS, readJson, writeJson } from '@/api/storage';
import { SEGMENTS, TOWNS } from '@/domain/corridor';
import { LEVELS, levelShort, type LevelKey } from '@/domain/levels';
import type { LatLng, Stretch } from '@/domain/stretch';
import { fontFor, townName, useI18n } from '@/i18n';
import { colors, fonts, radius, shadow } from '@/theme/tokens';

import { PickerSheet } from './PickerSheet';
import { Txt } from './ui';

// The risk-coloured road is drawn with react-native-svg from the backend's geometry, over map tiles
// (terrain, streets or satellite) placed as plain images. No map SDK or API key is needed, so it runs
// the same in Expo Go, on the web and in a release build. Without network the tiles are missing but the
// road, colours and towns still draw; the Schematic style needs no network at all.
//
// Smoothness: while a finger drags or pinches, and while the map flies somewhere, nothing is redrawn.
// One layer holding the tiles and the road is moved and scaled with a native transform; the road and the
// tiles are drawn again once, when the movement ends. A margin is drawn round the screen so dragging
// does not reveal empty edges straight away.

const MAX_POINTS = 90;
const TILE = 256;
/** Extra drawing beyond each edge of the screen, in pixels */
const MARGIN = 220;
/** World units are Web Mercator in 0..1, so pixels per unit at zoom z is 256 * 2^z */
const MIN_S = TILE * 2 ** 6;
const MAX_S = TILE * 2 ** 17;
const FIT_MAX_S = TILE * 2 ** 15;
const clampS = (s: number) => Math.min(Math.max(s, MIN_S), MAX_S);
const NATIVE = Platform.OS !== 'web';

type XY = [number, number];
interface View2D {
  cx: number;
  cy: number;
  s: number; // pixels per world unit
}
interface Xform {
  tx: number;
  ty: number;
  k: number;
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

// Satellite by default (Aakash's choice); a style the traveller picks is shared by every map in the app
// and remembered on the phone
let sessionStyle: MapStyleId = 'satellite';
const STYLE_IDS: MapStyleId[] = ['terrain', 'streets', 'satellite', 'schematic'];
const rememberStyle = (id: MapStyleId) => {
  sessionStyle = id;
  writeJson(KEYS.mapStyle, id);
};
export async function loadSavedMapStyle(): Promise<void> {
  const saved = await readJson<MapStyleId>(KEYS.mapStyle);
  if (saved && STYLE_IDS.includes(saved)) sessionStyle = saved;
}

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

/**
 * The moving layer is scaled around the centre of the map box (w/2, h/2), while the drawing is centred
 * on midY (the free space between the overlays). These two functions convert between "drawn view +
 * transform" and the view that transform shows.
 */
function viewAfter(base: View2D, x: Xform, h: number, midY: number): View2D {
  const s = base.s * x.k;
  return { s, cx: base.cx - x.tx / s, cy: base.cy - (x.ty + (x.k - 1) * (midY - h / 2)) / s };
}
function xformTo(base: View2D, target: View2D, h: number, midY: number): Xform {
  const k = target.s / base.s;
  return {
    k,
    tx: (base.cx - target.cx) * target.s,
    ty: (base.cy - target.cy) * target.s - (k - 1) * (midY - h / 2),
  };
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
  const { t, lang } = useI18n();
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
  const top = insets?.top ?? 0;
  const bottom = insets?.bottom ?? 0;

  // --- Live transform of the moving layer (no React render while it changes) ---
  const [anim] = useState(() => ({ tx: new Animated.Value(0), ty: new Animated.Value(0), k: new Animated.Value(1) }));
  /** JS copy of the transform values (native animations do not report back frame by frame) */
  const xf = useRef<Xform>({ tx: 0, ty: 0, k: 1 });
  const viewRef = useRef<View2D | null>(null);
  const geom = useRef({ w: 0, h: 0, midY: 0 });
  const interactiveRef = useRef(interactive);
  const resetPending = useRef(false);
  const animating = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    interactiveRef.current = interactive;
  }, [interactive]);
  useEffect(() => {
    geom.current = { w: size.w, h: size.h, midY: (top + (size.h - bottom)) / 2 };
  }, [size, top, bottom]);

  const setXform = useCallback(
    (x: Xform) => {
      xf.current = x;
      anim.tx.setValue(x.tx);
      anim.ty.setValue(x.ty);
      anim.k.setValue(x.k);
    },
    [anim],
  );

  /** Draw the map for a new view; the transform goes back to identity once that drawing is on screen */
  const commitView = useCallback((v: View2D) => {
    viewRef.current = v;
    resetPending.current = true;
    setView(v);
  }, []);

  useLayoutEffect(() => {
    if (!resetPending.current) return;
    resetPending.current = false;
    setXform({ tx: 0, ty: 0, k: 1 });
  }, [view, setXform]);

  /** Bake whatever the transform shows into a redraw */
  const commitTransform = useCallback(() => {
    const base = viewRef.current;
    const x = xf.current;
    if (!base || (x.tx === 0 && x.ty === 0 && x.k === 1)) return;
    const { h, midY } = geom.current;
    commitView(viewAfter(base, x, h, midY));
  }, [commitView]);

  const stopAnimation = useCallback(() => {
    if (!animating.current) return;
    animating.current.stop();
    animating.current = null;
    // Native animations stop where they are; ask for those values so the next move starts from them
    anim.tx.stopAnimation((v) => (xf.current = { ...xf.current, tx: v }));
    anim.ty.stopAnimation((v) => (xf.current = { ...xf.current, ty: v }));
    anim.k.stopAnimation((v) => (xf.current = { ...xf.current, k: v }));
  }, [anim]);

  const animateTo = useCallback(
    (target: View2D) => {
      const base = viewRef.current;
      if (!base || !geom.current.w) {
        commitView(target);
        return;
      }
      stopAnimation();
      const { h, midY } = geom.current;
      const to = xformTo(base, target, h, midY);
      const timing = (v: Animated.Value, value: number) =>
        Animated.timing(v, {
          toValue: value,
          duration: 380,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: NATIVE,
        });
      const a = Animated.parallel([timing(anim.tx, to.tx), timing(anim.ty, to.ty), timing(anim.k, to.k)]);
      animating.current = a;
      a.start(({ finished }) => {
        if (animating.current !== a) return;
        animating.current = null;
        if (finished) {
          xf.current = to;
          commitView(target);
        }
      });
    },
    [anim, commitView, stopAnimation],
  );

  useEffect(() => () => animating.current?.stop(), []);

  const visible = useMemo(
    () => (visibleIds ? stretches.filter((s) => visibleIds.includes(s.id)) : stretches),
    [stretches, visibleIds],
  );

  // World geometry, computed once per data set
  const world = useMemo(() => {
    const lines: Record<string, XY[]> = {};
    for (const s of stretches) lines[s.id] = decimate(s.coords).map(toWorld);
    const towns: { name: string; major: boolean; p: XY; km: number }[] = [];
    for (const tw of TOWNS) {
      const startSeg = SEGMENTS.find((g) => Math.abs(g.kmStart - tw.km) < 0.01);
      const endSeg = SEGMENTS.find((g) => Math.abs(g.kmEnd - tw.km) < 0.01);
      const line = startSeg ? lines[startSeg.id] : endSeg ? lines[endSeg.id] : null;
      if (!line?.length) continue;
      towns.push({ name: tw.name, major: tw.major, km: tw.km, p: startSeg ? line[0] : line[line.length - 1] });
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

  // Fit on first layout and fly whenever the focus changes
  useEffect(() => {
    if (!size.w) return;
    geom.current = { w: size.w, h: size.h, midY: (top + (size.h - bottom)) / 2 };
    const v = fitView(focusIds, size.w, size.h);
    if (!v) return;
    if (viewRef.current) animateTo(v);
    else commitView(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h, focusKey, world]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - size.w) > 1 || Math.abs(height - size.h) > 1) setSize({ w: width, h: height });
  };

  const zoomBy = (f: number) => {
    const base = viewRef.current;
    if (!base) return;
    const { h, midY } = geom.current;
    const now = viewAfter(base, xf.current, h, midY);
    animateTo({ ...now, s: clampS(now.s * f) });
  };

  // Drag to pan, two fingers to zoom. Taps fall through to the road.
  const gesture = useRef<{ start: Xform; dist: number | null } | null>(null);
  const pinchDist = (e: GestureResponderEvent) => {
    const touches = e.nativeEvent.touches;
    if (!touches || touches.length < 2) return null;
    return Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
  };
  // Created once; its callbacks only touch refs when a gesture happens, never during render
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (e, g) =>
        interactiveRef.current && (Math.abs(g.dx) + Math.abs(g.dy) > 6 || (e.nativeEvent.touches?.length ?? 0) > 1),
      onPanResponderGrant: (e) => {
        stopAnimation();
        gesture.current = { start: { ...xf.current }, dist: pinchDist(e) };
      },
      onPanResponderMove: (e, g) => {
        const st = gesture.current;
        const base = viewRef.current;
        if (!st || !base) return;
        const d = pinchDist(e);
        let k = st.start.k;
        if (d && st.dist) k = st.start.k * (d / st.dist);
        else if (d && !st.dist) gesture.current = st.dist === null ? { start: { ...xf.current }, dist: d } : st;
        // Keep the zoom inside the limits the redraw allows
        k = Math.min(Math.max(k, MIN_S / base.s), MAX_S / base.s);
        setXform({ tx: st.start.tx + g.dx, ty: st.start.ty + g.dy, k });
      },
      onPanResponderRelease: () => {
        gesture.current = null;
        commitTransform();
      },
      onPanResponderTerminate: () => {
        gesture.current = null;
        commitTransform();
      },
      onPanResponderTerminationRequest: () => true,
    }),
  );

  const fitAllScale = useMemo(() => fitView(null, size.w, size.h)?.s ?? 1, [fitView, size]);

  // Tiles cover the screen plus the margin, in coordinates of the moving layer
  const tiles = useMemo(() => {
    if (!view || !size.w || mapStyle === 'schematic') return [];
    const st = MAP_STYLES[mapStyle];
    const midY = (top + (size.h - bottom)) / 2;
    const z = Math.max(0, Math.min(st.maxZoom, Math.round(Math.log2(view.s / TILE))));
    const n = 2 ** z;
    const px = view.s / n; // on-screen size of one tile
    const x0 = Math.floor((view.cx - (size.w / 2 + MARGIN) / view.s) * n);
    const x1 = Math.floor((view.cx + (size.w / 2 + MARGIN) / view.s) * n);
    const y0 = Math.max(0, Math.floor((view.cy - (midY + MARGIN) / view.s) * n));
    const y1 = Math.min(n - 1, Math.floor((view.cy + (size.h - midY + MARGIN) / view.s) * n));
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
    const st = tileStats.current;
    if (ok) st.ok++;
    else st.failed++;
    const failing = st.failed >= 4 && st.ok === 0;
    if (failing !== tilesFailing) setTilesFailing(failing);
  };

  const labelFont = fontFor(fonts.bodyBold, lang);

  const content = useMemo(() => {
    if (!view || !size.w || !world.box) return null;
    const midY = (top + (size.h - bottom)) / 2;
    // Drawn into an SVG that is MARGIN larger on every side, hence the offsets
    const P = ([x, y]: XY): XY => [
      (x - view.cx) * view.s + size.w / 2 + MARGIN,
      (y - view.cy) * view.s + midY + MARGIN,
    ];
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

    const towns = world.towns.filter((tw) => {
      if (visibleIds && !townSet.has(tw.name)) return false;
      return allLabels || tw.major || zoomed || selectedTowns.includes(tw.name);
    });

    // Skip a name that would overlap one already placed (selected towns first, then major ones).
    // A name near the right edge goes to the left of its dot, so it is never cut off.
    const priority = (tw: (typeof towns)[number]) => (selectedTowns.includes(tw.name) ? 0 : tw.major ? 1 : 2);
    const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
    const labelled = new Map<string, { x: number; anchor: 'start' | 'end'; text: string }>();
    const right = size.w + MARGIN - 6;
    const left = MARGIN + 6;
    for (const tw of [...towns].sort((a, c) => priority(a) - priority(c))) {
      const [x, y] = P(tw.p);
      const text = townName(tw.name);
      const fs = tw.major || selectedTowns.includes(tw.name) ? 14 : 12;
      const width = text.length * fs * 0.62;
      let pos: { x: number; anchor: 'start' | 'end' } = { x: x + 10, anchor: 'start' };
      if (x + 10 + width > right)
        pos = x - 10 - width >= left ? { x: x - 10, anchor: 'end' } : { x: left, anchor: 'start' };
      const x0 = pos.anchor === 'start' ? pos.x : pos.x - width;
      const box = { x0: x0 - 2, x1: x0 + width + 2, y0: y + 4, y1: y + 23 };
      if (placed.some((p) => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0)) continue;
      placed.push(box);
      labelled.set(tw.name, { ...pos, text });
    }

    return (
      <>
        {terrain ? (
          <G>
            {anchors.map(([ax, ay, r], i) => {
              const c = P([b.minX + ax * bw, b.minY + ay * bh]);
              const rx = r * bw * view.s;
              return [1, 0.72, 0.46, 0.22].map((kk) => (
                <Ellipse
                  key={`${i}-${kk}`}
                  cx={c[0]}
                  cy={c[1]}
                  rx={rx * kk}
                  ry={rx * kk * 0.42}
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

        {towns.map((tw) => {
          const [x, y] = P(tw.p);
          const big = tw.major || selectedTowns.includes(tw.name);
          const label = labelled.get(tw.name);
          return (
            <G key={`t-${tw.name}`}>
              <Circle cx={x} cy={y} r={big ? 7 : 5} fill={colors.white} stroke={colors.ink} strokeWidth={2.5} />
              {label ? (
                <>
                  <SvgText
                    x={label.x}
                    y={y + 19}
                    textAnchor={label.anchor}
                    fontSize={big ? 14 : 12}
                    fontFamily={labelFont}
                    fontWeight="700"
                    stroke={colors.white}
                    strokeWidth={4}
                    strokeLinejoin="round"
                    fill={colors.white}>
                    {label.text}
                  </SvgText>
                  <SvgText
                    x={label.x}
                    y={y + 19}
                    textAnchor={label.anchor}
                    fontSize={big ? 14 : 12}
                    fontFamily={labelFont}
                    fontWeight="700"
                    fill={colors.ink}>
                    {label.text}
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
    labelFont,
  ]);

  const veil = mapStyle === 'schematic' ? 0 : MAP_STYLES[mapStyle].veil;

  return (
    <View
      style={[
        styles.wrap,
        // 'clip' on the web: a clipped box that is not scrollable, so the margin drawing never scrolls it
        Platform.OS === 'web' && ({ overflow: 'clip' } as unknown as ViewStyle),
        mapStyle !== 'schematic' && { backgroundColor: MAP_STYLES[mapStyle].background },
        style,
      ]}
      onLayout={onLayout}
      {...responder.panHandlers}>
      {size.w > 0 ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { transform: [{ translateX: anim.tx }, { translateY: anim.ty }, { scale: anim.k }] },
          ]}
          pointerEvents="box-none">
          {tiles.length ? (
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {tiles.map((tl) => (
                <Image
                  key={tl.key}
                  source={{ uri: tl.uri, headers: TILE_HEADERS }}
                  style={{ position: 'absolute', left: tl.left, top: tl.top, width: tl.size, height: tl.size }}
                  fadeDuration={0}
                  onLoad={() => onTile(true)}
                  onError={() => onTile(false)}
                />
              ))}
            </View>
          ) : null}
          {veil ? (
            <View
              style={[styles.veil, { opacity: veil, width: size.w + MARGIN * 2, height: size.h + MARGIN * 2 }]}
              pointerEvents="none"
            />
          ) : null}
          {/* Its own positioned layer: on the web an absolute tile layer would otherwise paint over it */}
          <View style={styles.svgLayer} pointerEvents="box-none">
            <Svg
              width={size.w + MARGIN * 2}
              height={size.h + MARGIN * 2}
              accessibilityLabel={t('Map of NH-7 coloured by landslide risk')}>
              {content}
            </Svg>
          </View>
        </Animated.View>
      ) : null}

      {mapStyle !== 'schematic' ? (
        <View style={[styles.attribution, { bottom: attributionBottom }]} pointerEvents="none">
          <Txt style={styles.attributionText} numberOfLines={1}>
            {tilesFailing ? t('Map needs internet · road still shown') : MAP_STYLES[mapStyle].attribution}
          </Txt>
        </View>
      ) : null}

      {controls ? (
        <View style={[styles.controls, { bottom: bottom + 16 }]} pointerEvents="box-none">
          <View style={styles.controlGroup}>
            <CtrlButton label={t('Zoom in')} onPress={() => zoomBy(1.6)} icon={<Plus size={22} color={colors.ink} />} />
            <View style={styles.divider} />
            <CtrlButton
              label={t('Zoom out')}
              onPress={() => zoomBy(1 / 1.6)}
              icon={<Minus size={22} color={colors.ink} />}
            />
            <View style={styles.divider} />
            <CtrlButton
              label={t('Map style')}
              onPress={() => setLayersOpen((v) => !v)}
              icon={<Layers size={20} color={colors.ink} />}
            />
            <View style={styles.divider} />
            <CtrlButton
              label={t('Fit the whole corridor')}
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
        title={t('Map style')}
        value={mapStyle}
        options={[
          ...(Object.keys(MAP_STYLES) as (keyof typeof MAP_STYLES)[]).map((id) => ({
            value: id,
            label: t(MAP_STYLES[id].label),
            hint: t(MAP_STYLES[id].hint),
          })),
          { value: 'schematic', label: t('Schematic'), hint: t('Works without internet') },
          {
            value: 'labels',
            label: allLabels ? t('Show main towns only') : t('Show all 19 town names'),
            hint: t('Town names on the map'),
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
  useI18n();
  return (
    <View style={styles.legend}>
      {(['low', 'moderate', 'high', 'severe', 'closed'] as LevelKey[]).map((k) => (
        <View key={k} style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: LEVELS[k].color }]} />
          <Txt variant="small" style={{ fontSize: 12 }}>
            {levelShort(k)}
          </Txt>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.mapBg, overflow: 'hidden' },
  svgLayer: { position: 'absolute', left: -MARGIN, top: -MARGIN },
  veil: { position: 'absolute', left: -MARGIN, top: -MARGIN, backgroundColor: 'white' },
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
