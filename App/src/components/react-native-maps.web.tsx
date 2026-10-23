import React, { forwardRef, useImperativeHandle, useState, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface MapViewProps {
  style?: any;
  initialRegion?: Region;
  region?: Region;
  onPress?: (event: { nativeEvent: { coordinate: LatLng; position?: { x: number; y: number } } }) => void;
  children?: React.ReactNode;
  mapType?: string;
  minZoomLevel?: number;
  maxZoomLevel?: number;
  showsUserLocation?: boolean;
}

export interface MarkerProps {
  coordinate: LatLng;
  onPress?: () => void;
  anchor?: { x: number; y: number };
  tracksViewChanges?: boolean;
  children?: React.ReactNode;
  title?: string;
  description?: string;
}

export interface PolylineProps {
  coordinates: LatLng[];
  strokeColor?: string;
  strokeWidth?: number;
  lineDashPattern?: number[];
  tappable?: boolean;
  onPress?: () => void;
  zIndex?: number;
}

export interface UrlTileProps {
  urlTemplate: string;
  maximumZ?: number;
  tileSize?: number;
}

export const UrlTile = (_props: UrlTileProps) => null;
export const Polygon = (_props: any) => null;
export const Circle = (_props: any) => null;
export const Callout = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>;

export const Marker = ({ coordinate, onPress, children }: MarkerProps) => {
  if (!children) return null;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      {children}
    </TouchableOpacity>
  );
};

export const Polyline = (_props: PolylineProps) => null;

let leafletScriptLoading = false;
let leafletLoaded = false;

function loadLeaflet(callback: () => void) {
  if (typeof window === 'undefined') return;
  if ((window as any).L) {
    leafletLoaded = true;
    callback();
    return;
  }
  if (!document.getElementById('leaflet-css')) {
    const link = document.createElement('link');
    link.id = 'leaflet-css';
    link.rel = 'stylesheet';
    link.href = 'http://localhost:8000/static/vendor/leaflet/leaflet.css';
    link.onerror = () => {
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    };
    document.head.appendChild(link);
  }
  if (leafletScriptLoading) {
    const interval = setInterval(() => {
      if ((window as any).L) {
        clearInterval(interval);
        callback();
      }
    }, 50);
    return;
  }
  leafletScriptLoading = true;
  const script = document.createElement('script');
  script.src = 'http://localhost:8000/static/vendor/leaflet/leaflet.js';
  script.onerror = () => {
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  };
  script.onload = () => {
    leafletLoaded = true;
    callback();
  };
  document.body.appendChild(script);
}

const TILE_LAYERS: Record<string, { url: string; maxZoom: number; attribution: string }> = {
  terrain: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 18,
    attribution: 'Tiles © Esri',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 18,
    attribution: 'Tiles © Esri',
  },
  street: {
    url: 'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    maxZoom: 19,
    attribution: '© CARTO © OpenStreetMap',
  },
};

export const MapView = forwardRef<any, MapViewProps>((props, ref) => {
  const { style, initialRegion, onPress, children } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const polylinesLayerRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const activeTileLayerRef = useRef<any>(null);

  const [activeTileMode, setActiveTileMode] = useState<'street' | 'terrain' | 'satellite'>('terrain');

  const [currentRegion, setCurrentRegion] = useState(initialRegion || {
    latitude: 30.32,
    longitude: 78.92,
    latitudeDelta: 0.85,
    longitudeDelta: 1.45,
  });

  useImperativeHandle(ref, () => ({
    fitToCoordinates: (coords: LatLng[], options?: any) => {
      if (mapInstanceRef.current && (window as any).L && coords && coords.length > 0) {
        const bounds = coords.map(c => [c.latitude, c.longitude]);
        mapInstanceRef.current.fitBounds(bounds, {
          padding: [options?.edgePadding?.top || 50, options?.edgePadding?.right || 50],
          animate: options?.animated ?? true,
        });
      }
    },
    animateToRegion: (region: Region, _duration?: number) => {
      setCurrentRegion(region);
      if (mapInstanceRef.current) {
        const zoom = Math.max(8, Math.min(16, Math.round(Math.log2(360 / region.longitudeDelta))));
        mapInstanceRef.current.setView([region.latitude, region.longitude], zoom);
      }
    },
    setCamera: (_camera: any) => {},
  }));

  // Switch base tile layer
  const setTileMode = (mode: 'street' | 'terrain' | 'satellite') => {
    setActiveTileMode(mode);
    if (!mapInstanceRef.current || !(window as any).L) return;
    const L = (window as any).L;
    const conf = TILE_LAYERS[mode];
    if (activeTileLayerRef.current) {
      mapInstanceRef.current.removeLayer(activeTileLayerRef.current);
    }
    activeTileLayerRef.current = L.tileLayer(conf.url, {
      maxZoom: conf.maxZoom,
      attribution: conf.attribution,
    }).addTo(mapInstanceRef.current);
  };

  // Initialize Leaflet map
  useEffect(() => {
    if (typeof window === 'undefined') return;

    loadLeaflet(() => {
      if (!containerRef.current || mapInstanceRef.current) return;
      const L = (window as any).L;
      if (!L) return;

      const map = L.map(containerRef.current, {
        center: [currentRegion.latitude, currentRegion.longitude],
        zoom: 9,
        zoomControl: true,
      });

      const conf = TILE_LAYERS[activeTileMode];
      activeTileLayerRef.current = L.tileLayer(conf.url, {
        maxZoom: conf.maxZoom,
        attribution: conf.attribution,
      }).addTo(map);

      polylinesLayerRef.current = L.layerGroup().addTo(map);
      markersLayerRef.current = L.layerGroup().addTo(map);

      if (onPress) {
        map.on('click', (e: any) => {
          onPress({
            nativeEvent: {
              coordinate: { latitude: e.latlng.lat, longitude: e.latlng.lng },
              position: { x: e.containerPoint.x, y: e.containerPoint.y },
            },
          });
        });
      }

      mapInstanceRef.current = map;
      setTimeout(() => map.invalidateSize(), 200);
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

function flattenMapChildren(children: React.ReactNode): React.ReactElement[] {
  const result: React.ReactElement[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === React.Fragment) {
      result.push(...flattenMapChildren((child.props as any).children));
    } else {
      result.push(child);
    }
  });
  return result;
}

  // Update Polylines and Markers whenever children change
  useEffect(() => {
    if (!mapInstanceRef.current || !(window as any).L) return;
    const L = (window as any).L;
    const allElements = flattenMapChildren(children);

    // Redraw Polylines
    if (polylinesLayerRef.current) {
      polylinesLayerRef.current.clearLayers();
      allElements.forEach((child) => {
        if (child.type === Polyline || (child.props as any)?.coordinates) {
          const pProps = child.props as PolylineProps;
          if (pProps.coordinates && pProps.coordinates.length > 0) {
            const latlngs = pProps.coordinates.map(c => [c.latitude, c.longitude]);
            const poly = L.polyline(latlngs, {
              color: pProps.strokeColor || '#F59E0B',
              weight: pProps.strokeWidth || 6,
              opacity: 0.98,
              lineCap: 'round',
              lineJoin: 'round',
              dashArray: pProps.lineDashPattern ? pProps.lineDashPattern.join(',') : undefined,
            });
            if (pProps.onPress) {
              poly.on('click', (e: any) => {
                L.DomEvent.stopPropagation(e);
                pProps.onPress?.();
              });
            }
            poly.addTo(polylinesLayerRef.current);
          }
        }
      });
    }

    // Redraw Markers
    if (markersLayerRef.current) {
      markersLayerRef.current.clearLayers();
      allElements.forEach((child) => {
        if (child.type === Marker || (child.props as any)?.coordinate) {
          const mProps = child.props as MarkerProps;
          if (mProps.coordinate) {
            const title = mProps.title || '';
            const isStart = title.toLowerCase().includes('rishikesh');
            const isEnd = title.toLowerCase().includes('joshimath') || title.toLowerCase().includes('badrinath');
            const isHistory = (child.key && String(child.key).startsWith('hist-')) || (child.props as any)?.description?.includes('landslide');
            
            let html = '';
            if (isStart) {
              // Rishikesh green ring + pill
              html = `
                <div style="display:flex; align-items:center; gap:6px; transform: translate(-10px, -10px); cursor:pointer;">
                  <div style="width:16px; height:16px; border-radius:50%; background:#10B981; border:3px solid #ffffff; box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>
                  <div style="background:#ffffff; color:#0f172a; font-weight:700; font-size:11px; padding:3px 9px; border-radius:12px; box-shadow:0 2px 6px rgba(0,0,0,0.25); white-space:nowrap; border:1.5px solid #10B981;">
                    🟢 ${title || 'Rishikesh'}
                  </div>
                </div>
              `;
            } else if (isEnd) {
              // Destination red pin + pill
              html = `
                <div style="display:flex; flex-direction:column; align-items:center; transform: translate(-50%, -100%); cursor:pointer;">
                  <div style="background:#EF4444; color:#ffffff; font-weight:800; font-size:11px; padding:3px 9px; border-radius:12px; box-shadow:0 2px 8px rgba(239,68,68,0.4); white-space:nowrap; margin-bottom:2px; border:1.5px solid #B91C1C;">
                    📍 ${title || 'Joshimath'}
                  </div>
                  <svg width="22" height="28" viewBox="0 0 24 30" fill="none">
                    <path d="M12 0C5.37258 0 0 5.37258 0 12C0 19.5 12 30 12 30C12 30 24 19.5 24 12C24 5.37258 18.6274 0 12 0Z" fill="#EF4444"/>
                    <circle cx="12" cy="11" r="5" fill="#ffffff"/>
                  </svg>
                </div>
              `;
            } else if (isHistory) {
              // Historical incident amber badge
              html = `
                <div style="
                  width:18px; height:18px; border-radius:50%; background:#d97706; border:2px solid #ffffff;
                  box-shadow:0 2px 6px rgba(0,0,0,0.35); display:flex; align-items:center; justify-content:center;
                  transform: translate(-9px, -9px); cursor:pointer;
                ">
                  <div style="width:6px; height:6px; background:#ffffff; border-radius:1px; transform: rotate(45deg);"></div>
                </div>
              `;
            } else if (title) {
              // Intermediate town label pill
              html = `
                <div style="display:flex; flex-direction:column; align-items:center; transform: translate(-50%, -100%); cursor:pointer;">
                  <div style="background:#ffffff; color:#0f172a; font-weight:700; font-size:11px; padding:2px 8px; border-radius:10px; box-shadow:0 2px 5px rgba(0,0,0,0.25); white-space:nowrap; margin-bottom:2px; border:1px solid #cbd5e1;">
                    ${title}
                  </div>
                  <div style="width:7px; height:7px; border-radius:50%; background:#0f172a; border:2px solid #ffffff; box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>
                </div>
              `;
            } else {
              // Generic dot (e.g. user location)
              html = `
                <div style="
                  width: 14px; height: 14px; border-radius: 50%;
                  background: #1D5E6B; border: 2.5px solid #FFFFFF;
                  box-shadow: 0 2px 6px rgba(0,0,0,0.35);
                  transform: translate(-7px, -7px);
                "></div>
              `;
            }

            const icon = L.divIcon({
              className: 'rn-map-marker',
              html,
              iconSize: [0, 0],
              iconAnchor: [0, 0],
            });

            const marker = L.marker([mProps.coordinate.latitude, mProps.coordinate.longitude], { icon });
            if (mProps.onPress) {
              marker.on('click', (e: any) => {
                L.DomEvent.stopPropagation(e);
                mProps.onPress?.();
              });
            }
            marker.addTo(markersLayerRef.current);
          }
        }
      });
    }
  }, [children]);

  const handleFitCorridor = () => {
    if (mapInstanceRef.current && (window as any).L) {
      // Rishikesh to Joshimath bounds
      mapInstanceRef.current.flyToBounds([
        [30.0869, 78.2676], // Rishikesh
        [30.5564, 79.5663], // Joshimath
      ], { padding: [60, 60], duration: 1 });
    }
  };

  return (
    <View style={[styles.mapContainer, style]}>
      {/* HTML container for Leaflet */}
      <div
        ref={containerRef as any}
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          backgroundColor: '#E6F4FE',
        }}
      />
      {/* Controls & Layer switcher */}
      <View style={styles.topControls} pointerEvents="box-none">
        <View style={styles.layerSwitcher}>
          {(['street', 'terrain', 'satellite'] as const).map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.layerBtn, activeTileMode === m && styles.layerBtnActive]}
              onPress={() => setTileMode(m)}
              activeOpacity={0.8}
            >
              <Text style={[styles.layerBtnText, activeTileMode === m && styles.layerBtnTextActive]}>
                {m === 'street' ? '🗺️ Street' : m === 'terrain' ? '⛰️ Terrain' : '🛰️ Sat'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.fitBtn} onPress={handleFitCorridor} activeOpacity={0.8}>
          <Text style={styles.fitBtnText}>🎯 Fit NH-7</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

MapView.displayName = 'MapView';

export default MapView;

const styles = StyleSheet.create({
  mapContainer: {
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#E6F4FE',
    minHeight: 250,
  },
  topControls: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 1000,
  },
  layerSwitcher: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 8,
    padding: 3,
    boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  layerBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  layerBtnActive: {
    backgroundColor: '#1D5E6B',
  },
  layerBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  layerBtnTextActive: {
    color: '#ffffff',
  },
  fitBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  fitBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1B2A33',
  },
  legendContainer: {
    position: 'absolute',
    bottom: 12,
    left: 10,
    zIndex: 1000,
  },
  legendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    boxShadow: '0 2px 5px rgba(0,0,0,0.15)',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#334155',
  },
});
