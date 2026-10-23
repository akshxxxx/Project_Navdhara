import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Tooltip, Marker, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { getLevelMeta } from '../api/adapters';

// All towns along NH-7 with precise coordinates for dynamic start/destination markers
export const ALL_TOWNS = [
  { name: 'Rishikesh', lat: 30.0869, lng: 78.2676, isMajor: true },
  { name: 'Shivpuri', lat: 30.1361, lng: 78.3898 },
  { name: 'Byasi', lat: 30.1133, lng: 78.4387 },
  { name: 'Kaudiyala', lat: 30.0751, lng: 78.5014 },
  { name: 'Devprayag', lat: 30.1459, lng: 78.5989, isMajor: true },
  { name: 'Teen Dhara', lat: 30.2106, lng: 78.6793 },
  { name: 'Kirtinagar', lat: 30.2177, lng: 78.7452 },
  { name: 'Srinagar', lat: 30.2223, lng: 78.7844, isMajor: true },
  { name: 'Sirobagarh', lat: 30.2416, lng: 78.8534 },
  { name: 'Rudraprayag', lat: 30.2851, lng: 78.9821, isMajor: true },
  { name: 'Gauchar', lat: 30.2890, lng: 79.1552 },
  { name: 'Karnaprayag', lat: 30.2587, lng: 79.2173, isMajor: true },
  { name: 'Langasu', lat: 30.2880, lng: 79.2576 },
  { name: 'Nandprayag', lat: 30.3297, lng: 79.3244, isMajor: true },
  { name: 'Chamoli', lat: 30.4055, lng: 79.3536, isMajor: true },
  { name: 'Birahi', lat: 30.4129, lng: 79.3937 },
  { name: 'Pipalkoti', lat: 30.4297, lng: 79.4304, isMajor: true },
  { name: 'Helang', lat: 30.5294, lng: 79.5284 },
  { name: 'Joshimath', lat: 30.5564, lng: 79.5663, isMajor: true },
];

function createTownMarkerIcon(town) {
  if (town.isEnd) {
    // Red pin with dot for destination
    return L.divIcon({
      className: 'town-marker-end',
      html: `
        <div style="display:flex; flex-direction:column; align-items:center; transform: translate(-50%, -100%);">
          <div style="background:#ffffff; color:#0f172a; font-weight:700; font-size:11px; padding:2px 8px; border-radius:12px; box-shadow:0 2px 6px rgba(0,0,0,0.3); white-space:nowrap; margin-bottom:2px; border:1px solid #cbd5e1;">
            ${town.name}
          </div>
          <svg width="24" height="30" viewBox="0 0 24 30" fill="none">
            <path d="M12 0C5.37258 0 0 5.37258 0 12C0 19.5 12 30 12 30C12 30 24 19.5 24 12C24 5.37258 18.6274 0 12 0Z" fill="#ef4444"/>
            <circle cx="12" cy="11" r="5" fill="#ffffff"/>
          </svg>
        </div>
      `,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
  }

  if (town.isStart) {
    // Teal ring for starting point
    return L.divIcon({
      className: 'town-marker-start',
      html: `
        <div style="display:flex; align-items:center; gap:6px; transform: translate(-10px, -10px);">
          <div style="width:18px; height:18px; border-radius:50%; background:#10b981; border:3px solid #ffffff; box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>
          <div style="background:#ffffff; color:#0f172a; font-weight:700; font-size:11px; padding:2px 8px; border-radius:12px; box-shadow:0 2px 6px rgba(0,0,0,0.25); white-space:nowrap; border:1px solid #cbd5e1;">
            ${town.name}
          </div>
        </div>
      `,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
  }

  // Regular town with small dot and white pill
  return L.divIcon({
    className: 'town-marker-intermediate',
    html: `
      <div style="display:flex; flex-direction:column; align-items:center; transform: translate(-50%, -100%);">
        <div style="background:#ffffff; color:#0f172a; font-weight:700; font-size:11px; padding:2px 7px; border-radius:10px; box-shadow:0 2px 5px rgba(0,0,0,0.25); white-space:nowrap; margin-bottom:2px; border:1px solid #cbd5e1;">
          ${town.name}
        </div>
        <div style="width:8px; height:8px; border-radius:50%; background:#0f172a; border:2px solid #ffffff; box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

// Warning / Risk badge icon placed on segments needing attention
function createWarningMarkerIcon(level, label) {
  if (level === 'closed') {
    return L.divIcon({
      className: 'warning-marker-closed',
      html: `
        <div style="
          width:26px; height:26px; border-radius:50%; background:#991b1b; border:2.5px solid #ffffff;
          box-shadow:0 3px 8px rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center;
          transform: translate(-13px, -13px); cursor:pointer;
        ">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
      `,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
  }

  // Orange exclamation for High / Moderate watch
  return L.divIcon({
    className: 'warning-marker-attention',
    html: `
      <div style="
        width:24px; height:24px; border-radius:50%; background:#f97316; border:2.5px solid #ffffff;
        box-shadow:0 3px 8px rgba(0,0,0,0.35); display:flex; align-items:center; justify-content:center;
        transform: translate(-12px, -12px); cursor:pointer;
      ">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function getSegmentMidpoint(coords) {
  if (!coords || coords.length === 0) return null;
  const midIdx = Math.floor(coords.length / 2);
  return coords[midIdx];
}

// Controller component to handle bounds and programmatic interactions
function MapController({ selectedSegment, segments, onMapReady }) {
  const map = useMap();

  useEffect(() => {
    if (map) {
      onMapReady(map);
      map.invalidateSize();
    }
  }, [map, onMapReady]);

  // Re-fit bounds whenever the route segment composition changes
  const segmentsKey = segments?.map(s => s.id).join(',');
  useEffect(() => {
    if (segments && segments.length > 0) {
      const allCoords = segments.flatMap(s => s.coords || []);
      if (allCoords.length > 0) {
        try {
          const bounds = L.latLngBounds(allCoords);
          if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [55, 55], maxZoom: 12 });
          }
        } catch (e) {
          console.warn('[InteractiveMap] fitBounds error:', e);
        }
      }
    }
  }, [segmentsKey, map]);

  useEffect(() => {
    if (selectedSegment && selectedSegment.coords && selectedSegment.coords.length > 0) {
      try {
        const segBounds = L.latLngBounds(selectedSegment.coords);
        if (segBounds.isValid()) {
          map.flyToBounds(segBounds, { padding: [80, 80], maxZoom: 13, duration: 1 });
        }
      } catch (e) {
        console.warn('[InteractiveMap] flyToBounds error:', e);
      }
    }
  }, [selectedSegment, map]);

  return null;
}

// Available map tile layer styles
export const MAP_LAYERS = {
  terrain: {
    id: 'terrain',
    label: 'Mountain Terrain',
    icon: '🏔️',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> &copy; OpenStreetMap',
    maxZoom: 17,
    subdomains: ['a', 'b', 'c'],
  },
  carto: {
    id: 'carto',
    label: 'Clean Streets',
    icon: '🗺️',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap',
    maxZoom: 19,
    subdomains: ['a', 'b', 'c', 'd'],
  },
  satellite: {
    id: 'satellite',
    label: 'Satellite View',
    icon: '🛰️',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, Maxar, Earthstar Geographics',
    maxZoom: 18,
    subdomains: ['server'],
  },
};

export const InteractiveMap = forwardRef(({
  segments,
  selectedSegment,
  onSelectSegment,
  tileMode: externalTileMode,
  onTileModeChange,
  originTown,
  destTown,
  // Optional extra points, e.g. slope-sensor nodes and proposed node sites:
  // [{ id, lat, lng, color, label, radius?, dashed? }]
  extraMarkers = [],
}, ref) => {
  const mapInstanceRef = useRef(null);
  const [internalTileMode, setInternalTileMode] = useState('terrain');

  const activeTileMode = externalTileMode || internalTileMode;
  const currentLayer = MAP_LAYERS[activeTileMode] || MAP_LAYERS.terrain;

  const originNorm = (originTown || 'Rishikesh').toLowerCase().trim();
  const destNorm = (destTown || 'Joshimath').toLowerCase().trim();

  // Dynamically resolve town markers: origin gets start ring, destination gets end pin,
  // and key intermediate towns get clean label tags
  const townsToRender = React.useMemo(() => {
    return ALL_TOWNS.map(t => {
      const isStart = t.name.toLowerCase().trim() === originNorm;
      const isEnd = t.name.toLowerCase().trim() === destNorm;
      return {
        ...t,
        isStart,
        isEnd,
      };
    }).filter(t => t.isStart || t.isEnd || t.isMajor);
  }, [originNorm, destNorm]);

  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      if (mapInstanceRef.current) mapInstanceRef.current.zoomIn();
    },
    zoomOut: () => {
      if (mapInstanceRef.current) mapInstanceRef.current.zoomOut();
    },
    resetRoute: () => {
      if (mapInstanceRef.current && segments && segments.length > 0) {
        const allCoords = segments.flatMap(s => s.coords || []);
        if (allCoords.length > 0) {
          const bounds = L.latLngBounds(allCoords);
          if (bounds.isValid()) {
            mapInstanceRef.current.flyToBounds(bounds, { padding: [50, 50], duration: 1 });
          }
        }
      }
    },
    flyToSegment: (segment) => {
      if (mapInstanceRef.current && segment?.coords && segment.coords.length > 0) {
        const bounds = L.latLngBounds(segment.coords);
        if (bounds.isValid()) {
          mapInstanceRef.current.flyToBounds(bounds, { padding: [70, 70], maxZoom: 13, duration: 1 });
        }
      }
    },
    toggleLayer: () => {
      const modes = ['terrain', 'carto', 'satellite'];
      const nextIdx = (modes.indexOf(activeTileMode) + 1) % modes.length;
      const nextMode = modes[nextIdx];
      if (onTileModeChange) {
        onTileModeChange(nextMode);
      } else {
        setInternalTileMode(nextMode);
      }
      return nextMode;
    },
    setTileMode: (mode) => {
      if (MAP_LAYERS[mode]) {
        if (onTileModeChange) {
          onTileModeChange(mode);
        } else {
          setInternalTileMode(mode);
        }
      }
    },
    getTileMode: () => activeTileMode,
    invalidateSize: () => {
      if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize();
    }
  }));

  // Force map viewport invalidation on tile style change so tiles populate immediately
  useEffect(() => {
    if (mapInstanceRef.current) {
      const timer = setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeTileMode]);

  // Center roughly in the Garhwal Himalayas (between Rishikesh and Joshimath)
  const defaultCenter = [30.3165, 78.9629];
  const defaultZoom = 9;

  return (
    <div className="w-full h-full relative z-0">
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        className="w-full h-full"
        zoomControl={false}
      >
        <TileLayer
          key={activeTileMode}
          attribution={currentLayer.attribution}
          url={currentLayer.url}
          maxZoom={currentLayer.maxZoom}
          subdomains={currentLayer.subdomains}
        />

        <MapController
          selectedSegment={selectedSegment}
          segments={segments}
          onMapReady={(m) => { mapInstanceRef.current = m; }}
        />

        {/* Render NH-7 road polylines with crisp casing & highway risk colors */}
        {segments.map(seg => {
          if (!seg.coords || seg.coords.length === 0) return null;
          const isSelected = selectedSegment?.id === seg.id;
          const meta = getLevelMeta(seg.level);
          const isClosed = seg.level === 'closed';

          // Color palette matching design:
          // Low: #10b981 (green)
          // Moderate: #eab308 (yellow)
          // High: #f97316 (orange)
          // Severe: #ef4444 (red)
          // Closed: #0f172a (dark slate/black)
          let strokeColor = '#10b981';
          if (seg.level === 1) strokeColor = '#eab308';
          else if (seg.level === 2) strokeColor = '#f97316';
          else if (seg.level === 3) strokeColor = '#ef4444';
          else if (isClosed) strokeColor = '#0f172a';

          const casingWeight = isSelected ? 13 : 9;
          const lineWeight = isSelected ? 8 : 5;

          // Midpoint marker for notable segments
          const midpoint = getSegmentMidpoint(seg.coords);
          const showAttentionBadge = (seg.level === 2 || seg.level === 3 || isClosed) && midpoint;

          return (
            <React.Fragment key={seg.id}>
              {/* Outer white casing */}
              <Polyline
                positions={seg.coords}
                pathOptions={{
                  color: isSelected ? '#0284c7' : '#ffffff',
                  weight: casingWeight,
                  opacity: 0.98,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
                eventHandlers={{
                  click: () => onSelectSegment(seg),
                }}
              />

              {/* Highway colored risk line */}
              <Polyline
                positions={seg.coords}
                pathOptions={{
                  color: strokeColor,
                  weight: lineWeight,
                  opacity: 1,
                  dashArray: isClosed ? '5 7' : undefined,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
                eventHandlers={{
                  click: () => onSelectSegment(seg),
                }}
              >
                <Tooltip sticky direction="top" className="font-sans text-xs shadow-md">
                  <div className="font-sans">
                    <span className="font-bold text-gray-900">{seg.nameEn || seg.name}</span>
                    <div className="text-gray-600 font-medium">
                      {meta.label} · Risk {Math.round((seg.score || 0) * 100)}%
                    </div>
                  </div>
                </Tooltip>
              </Polyline>

              {/* Warning badge on segments with high/severe/closed risk */}
              {showAttentionBadge && (
                <Marker
                  position={midpoint}
                  icon={createWarningMarkerIcon(seg.level, seg.name)}
                  eventHandlers={{
                    click: () => onSelectSegment(seg),
                  }}
                />
              )}
            </React.Fragment>
          );
        })}

        {extraMarkers.map(m => (
          <CircleMarker
            key={m.id}
            center={[m.lat, m.lng]}
            radius={m.radius || 9}
            pathOptions={{
              color: '#ffffff',
              weight: 2.5,
              fillColor: m.color || '#0284c7',
              fillOpacity: 0.95,
              dashArray: m.dashed ? '3 3' : undefined,
            }}
          >
            <Tooltip direction="top" className="font-sans text-xs shadow-md">{m.label}</Tooltip>
          </CircleMarker>
        ))}

        {/* Town labels along the route */}
        {townsToRender.map(town => (
          <Marker
            key={`${town.name}-${town.isStart ? 'start' : town.isEnd ? 'end' : 'mid'}`}
            position={[town.lat, town.lng]}
            icon={createTownMarkerIcon(town)}
            interactive={false}
          />
        ))}
      </MapContainer>
    </div>
  );
});

InteractiveMap.displayName = 'InteractiveMap';
