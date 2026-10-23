import React, { useState, useRef, useMemo, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import MapView, { UrlTile, Polyline, Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { LocateFixed, History, PhoneCall, Layers, Navigation } from 'lucide-react-native';

import { 
  AppHeader, 
  ThemedText, 
  BottomSheet, 
  RoadStrip, 
  SegmentDetail, 
  Button,
  SubscribeSheet,
  type BottomSheetRef
} from '../../src/components';
import { useRiskMap, useHistory } from '../../src/api/hooks';
import { towns } from '../../src/data/towns';
import { colors, spacing, radii } from '../../src/design/tokens';

// Real mountain topographic & imagery tile layers matching Backend & Frontend
export const TILE_LAYERS = {
  topo: {
    key: 'topo',
    name: 'Mountain Topo',
    icon: '⛰️',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 18,
  },
  sat: {
    key: 'sat',
    name: 'Satellite',
    icon: '🛰️',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 18,
  },
  street: {
    key: 'street',
    name: 'Street Map',
    icon: '🗺️',
    url: 'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    maxZoom: 19,
  },
} as const;

type LayerKey = keyof typeof TILE_LAYERS;

// Rishikesh to Joshimath corridor center
const ROUTE_REGION = {
  latitude: 30.32,
  longitude: 78.92,
  latitudeDelta: 0.85,
  longitudeDelta: 1.45,
};

// High-visibility vibrant palette matching Backend & Frontend workbench
export function getCorridorRiskColor(level: number | 'closed'): string {
  switch (level) {
    case 'closed': return '#991B1B';
    case 3: return '#EF4444'; // Severe
    case 2: return '#F97316'; // High
    case 1: return '#F59E0B'; // Moderate
    case 0: return '#10B981'; // Low
    default: return '#10B981';
  }
}

function getRiskCoreWidth(level: number | 'closed'): number {
  if (level === 'closed') return 8;
  switch (level) {
    case 0: return 6;
    case 1: return 7;
    case 2: return 8;
    case 3: return 9;
    default: return 6;
  }
}

export default function MapScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const isHindi = i18n.language === 'hi';
  
  const { data: riskMapData } = useRiskMap();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [activeLayer, setActiveLayer] = useState<LayerKey>('topo');
  
  const mapRef = useRef<MapView>(null);
  const sheetRef = useRef<BottomSheetRef>(null);
  const subscribeSheetRef = useRef<BottomSheetRef>(null);
  const [subscribeTarget, setSubscribeTarget] = useState<{ id: string; name: string } | null>(null);

  const { data: historyData } = useHistory();

  const segments = riskMapData?.segments || [];
  
  const selectedSegment = useMemo(() => 
    segments.find(s => s.id === selectedId),
    [segments, selectedId]
  );
  
  const closedCount = segments.filter(s => s.effectiveLevel === 'closed').length;
  const highRiskCount = segments.filter(s => s.level >= 2).length;
  const firstClosed = segments.find(s => s.effectiveLevel === 'closed');

  const fitCorridorBounds = () => {
    if (segments.length > 0 && mapRef.current) {
      const allCoords = segments.flatMap(s => s.coordinates);
      if (allCoords.length > 0) {
        mapRef.current?.fitToCoordinates(allCoords, {
          edgePadding: { top: 70, right: 60, bottom: 220, left: 60 },
          animated: true
        });
      }
    }
  };

  // Auto-fit to corridor on load
  useEffect(() => {
    if (segments.length > 0 && mapRef.current) {
      const allCoords = segments.flatMap(s => s.coordinates);
      if (allCoords.length > 0) {
        setTimeout(() => {
          mapRef.current?.fitToCoordinates(allCoords, {
            edgePadding: { top: 70, right: 60, bottom: 220, left: 60 },
            animated: false
          });
        }, 500);
      }
    }
  }, [segments.length > 0]);

  const handleToggleLayer = () => {
    setActiveLayer(prev => {
      if (prev === 'topo') return 'sat';
      if (prev === 'sat') return 'street';
      return 'topo';
    });
  };

  const handleSegmentSelect = (id: string) => {
    setSelectedId(id);
    sheetRef.current?.snapToIndex(1);
    
    const seg = segments.find(s => s.id === id);
    if (seg && mapRef.current && seg.coordinates.length > 0) {
      const lats = seg.coordinates.map(c => c.latitude);
      const lngs = seg.coordinates.map(c => c.longitude);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      
      mapRef.current.animateToRegion({
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        latitudeDelta: Math.max(0.1, (maxLat - minLat) * 1.5),
        longitudeDelta: Math.max(0.1, (maxLng - minLng) * 1.5),
      }, 500);
    }
  };

  const handleLocateMe = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'We need location to show where you are on the route.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      setUserLocation(loc);
      mapRef.current?.animateToRegion({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      });
    } catch (error) {
      console.warn('Location error:', error);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader title={t('nav.map')} />
      
      {/* Live Corridor Status Banner */}
      <TouchableOpacity 
        style={[
          styles.alertLine,
          closedCount > 0 
            ? { backgroundColor: '#1B2A33' } 
            : highRiskCount > 0 
              ? { backgroundColor: '#F8E3D8' } 
              : { backgroundColor: '#E3F1EA' }
        ]}
        onPress={() => {
          if (closedCount > 0 && firstClosed) {
            handleSegmentSelect(firstClosed.id);
          } else if (highRiskCount > 0) {
            setSelectedId(null);
            sheetRef.current?.snapToIndex(1);
          }
        }}
        activeOpacity={0.8}
      >
        <ThemedText
          variant="small"
          color={closedCount > 0 ? colors.snow : highRiskCount > 0 ? '#C4470F' : '#2E7D57'}
          style={{ fontWeight: '700' }}
        >
          {closedCount > 0
            ? `🚨 ${closedCount} road closure${closedCount > 1 ? 's' : ''} on NH-7`
            : highRiskCount > 0
              ? `⚠️ ${t('home.watch', { n: highRiskCount })} — Go with care`
              : '🟢 All 18 NH-7 sectors open & monitored • Good to go'}
        </ThemedText>
      </TouchableOpacity>
      
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          mapType="none"
          initialRegion={ROUTE_REGION}
          minZoomLevel={7}
          maxZoomLevel={18}
        >
          {/* Universal Tile Layer (ESRI Mountain Topo / Satellite / Street) */}
          <UrlTile 
            key={activeLayer}
            urlTemplate={TILE_LAYERS[activeLayer].url}
            maximumZ={TILE_LAYERS[activeLayer].maxZoom}
            tileSize={256}
            shouldReplaceMapContent={true}
            zIndex={-1}
          />
          
          {/* Highway Casing Polylines (White outer glow / outline) */}
          {segments.map(seg => {
            const isSelected = selectedId === seg.id;
            const isSevere = seg.effectiveLevel === 3;
            const isClosed = seg.effectiveLevel === 'closed';
            const coreWidth = getRiskCoreWidth(seg.effectiveLevel);
            const casingWidth = coreWidth + 4 + (isSelected ? 3 : 0);
            
            return (
              <Polyline
                key={`${seg.id}-casing`}
                coordinates={seg.coordinates}
                strokeColor={isSelected ? '#0284C7' : '#FFFFFF'}
                strokeWidth={casingWidth}
                lineDashPattern={(isSevere || isClosed) && !isSelected ? [4, 6] : undefined}
                tappable
                onPress={() => handleSegmentSelect(seg.id)}
                zIndex={isSelected ? 10 : 1}
              />
            );
          })}

          {/* Highway Core Risk Polylines (Vibrant high-contrast ribbon) */}
          {segments.map(seg => {
            const isSelected = selectedId === seg.id;
            const isClosed = seg.effectiveLevel === 'closed';
            const coreWidth = getRiskCoreWidth(seg.effectiveLevel);
            const riskColor = getCorridorRiskColor(seg.effectiveLevel);
            
            return (
              <Polyline
                key={`${seg.id}-core`}
                coordinates={seg.coordinates}
                strokeColor={riskColor}
                strokeWidth={coreWidth + (isSelected ? 2 : 0)}
                tappable
                onPress={() => handleSegmentSelect(seg.id)}
                zIndex={isSelected ? 11 : 2}
                lineDashPattern={isClosed ? [8, 8] : undefined}
              />
            );
          })}
          
          {/* Towns with clean pill badges */}
          {towns.map(town => {
            const isStart = town.id === 'rishikesh';
            const isEnd = town.id === 'joshimath';
            const townName = isHindi ? town.name_hi : town.name_en;

            return (
              <Marker
                key={town.id}
                coordinate={{ latitude: town.lat, longitude: town.lng }}
                title={townName}
                description={isStart ? 'Corridor origin' : isEnd ? 'Corridor destination' : 'Major mountain town'}
                anchor={{ x: 0.5, y: isEnd ? 0.9 : 0.5 }}
                tracksViewChanges={false}
              >
                <View style={styles.townMarkerContainer}>
                  <View style={[
                    styles.townPill, 
                    isStart && styles.townPillStart,
                    isEnd && styles.townPillEnd
                  ]}>
                    {isStart && <View style={styles.startDot} />}
                    <ThemedText 
                      variant="caption" 
                      color={isEnd ? colors.snow : colors.ink} 
                      style={[styles.townPillText, isEnd && styles.townPillTextEnd]}
                    >
                      {townName}
                    </ThemedText>
                  </View>
                  {!isEnd && <View style={[styles.townDot, isStart && styles.townDotStart]} />}
                </View>
              </Marker>
            );
          })}
          
          {userLocation && (
            <Marker
              coordinate={{
                latitude: userLocation.coords.latitude,
                longitude: userLocation.coords.longitude
              }}
              title="Your location"
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.userDotContainer}>
                <View style={styles.userDot} />
              </View>
            </Marker>
          )}

          {showHistory && historyData?.events && historyData.events.map((ev: any) => (
            <Marker
              key={`hist-${ev.id}`}
              coordinate={{ latitude: ev.lat, longitude: ev.lng }}
              title={`Landslide: ${ev.name || 'Historic'}`}
              description={ev.date || 'Historical inventory'}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={[styles.townDot, { backgroundColor: '#856404', borderColor: '#ffe69c' }]} />
            </Marker>
          ))}
        </MapView>

        {/* Floating Glassmorphic Corridor HUD Bar (Matching Image 2 Workbench) */}
        <View style={styles.hudContainer} pointerEvents="box-none">
          <View style={styles.hudPill}>
            <View style={styles.hudStat}>
              <View style={[styles.hudStatusDot, { backgroundColor: highRiskCount > 0 ? '#F97316' : '#10B981' }]} />
              <ThemedText variant="caption" color={colors.snow} style={styles.hudText}>
                Corridor: <ThemedText style={styles.hudBold}>NH-7 (247 km)</ThemedText>
              </ThemedText>
            </View>
            <View style={styles.hudDivider} />
            <View style={styles.hudStat}>
              <ThemedText variant="caption" color={colors.mist} style={styles.hudText}>
                Segments: <ThemedText style={styles.hudBold}>{segments.length || 18}</ThemedText>
              </ThemedText>
            </View>
            <View style={styles.hudDivider} />
            <View style={styles.hudStat}>
              <ThemedText variant="caption" color={colors.mist} style={styles.hudText}>
                High/Severe: <ThemedText style={[styles.hudBold, { color: highRiskCount > 0 ? '#F97316' : '#10B981' }]}>{highRiskCount}</ThemedText>
              </ThemedText>
            </View>
            <View style={styles.hudDivider} />
            <View style={styles.hudStat}>
              <ThemedText variant="caption" color={colors.mist} style={styles.hudText}>
                Weather: <ThemedText style={[styles.hudBold, { color: '#38BDF8' }]}>
                  {riskMapData?.rain_status === 'cached' ? 'CACHED' : 'LIVE'}
                </ThemedText>
              </ThemedText>
            </View>
          </View>
        </View>

        {/* Floating Corridor Risk Legend at Bottom */}
        <View style={styles.legendContainer} pointerEvents="box-none">
          <View style={styles.legendPill}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
              <ThemedText variant="caption" style={styles.legendText}>Low</ThemedText>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
              <ThemedText variant="caption" style={styles.legendText}>Mod</ThemedText>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#F97316' }]} />
              <ThemedText variant="caption" style={styles.legendText}>High</ThemedText>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
              <ThemedText variant="caption" style={styles.legendText}>Severe</ThemedText>
            </View>
            {closedCount > 0 && (
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#1B2A33' }]} />
                <ThemedText variant="caption" style={styles.legendText}>Closed</ThemedText>
              </View>
            )}
          </View>
        </View>
        
        {/* Floating Action Controls on Right Side */}
        <View style={styles.controls}>
          <TouchableOpacity 
            style={[styles.controlButton, { backgroundColor: '#FEE2E2' }]} 
            onPress={() => router.push('/emergency')}
            accessibilityLabel="Emergency SOS"
          >
            <PhoneCall size={22} color="#DC2626" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.controlButton} 
            onPress={handleToggleLayer}
            accessibilityLabel="Switch Map Layer"
          >
            <ThemedText style={{ fontSize: 18 }}>{TILE_LAYERS[activeLayer].icon}</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.controlButton} 
            onPress={fitCorridorBounds}
            accessibilityLabel="Fit Entire Corridor"
          >
            <Navigation size={22} color={colors.ink} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.controlButton, showHistory && { backgroundColor: colors.mist }]} 
            onPress={() => setShowHistory(!showHistory)}
            accessibilityLabel="Toggle Historical Landslides"
          >
            <History size={24} color={showHistory ? colors.ink : colors.granite} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlButton} onPress={handleLocateMe} accessibilityLabel="Locate Me">
            <LocateFixed size={24} color={colors.ink} />
          </TouchableOpacity>
        </View>
      </View>
      
      <BottomSheet ref={sheetRef} initialIndex={0}>
        {selectedSegment ? (
          <SegmentDetail 
            segment={selectedSegment} 
            updatedAt={riskMapData?.as_of}
            onAlertMe={() => {
              setSubscribeTarget({ id: selectedSegment.id, name: selectedSegment.name });
              subscribeSheetRef.current?.snapToIndex(1);
            }}
            onReport={() => router.push('/report')}
          />
        ) : (
          <View style={styles.sheetContent}>
            <View style={styles.dragHandle} />
            <View style={styles.sheetHeader}>
              <ThemedText variant="h3" color={colors.ink}>
                Stretches to watch
              </ThemedText>
              <ThemedText variant="small" color={colors.granite}>
                {riskMapData?.rain_status === 'cached' ? 'Weather data is cached' : (riskMapData?.as_of ? t('status.fresh', { n: Math.floor((Date.now() - new Date(riskMapData.as_of).getTime()) / 60000) }) : '')}
              </ThemedText>
            </View>
            <View style={styles.actionRow}>
              <View style={{ flex: 1 }}>
                <Button label={t('nav.plan')} variant="primary" onPress={() => router.push('/plan')} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label={t('drive_mode')} variant="secondary" onPress={() => router.push('/drive')} />
              </View>
            </View>
            <View style={styles.stripContainer}>
               <RoadStrip 
                 segments={segments} 
                 towns={towns}
                 orientation="vertical"
                 onSelect={handleSegmentSelect}
               />
            </View>
          </View>
        )}
      </BottomSheet>

      <BottomSheet ref={subscribeSheetRef} initialIndex={-1}>
        {subscribeTarget && (
          <SubscribeSheet
            itemId={subscribeTarget.id}
            itemName={subscribeTarget.name}
            onClose={() => subscribeSheetRef.current?.snapToIndex(-1)}
            onSuccess={(name) => {
              Alert.alert('Subscribed', `You will receive hazard alerts for ${name}.`);
            }}
          />
        )}
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.snow },
  alertLine: {
    backgroundColor: '#F8E3D8',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapContainer: { flex: 1, backgroundColor: '#EAEAEA', position: 'relative' },
  
  /* Floating Corridor HUD Pill (From Image 2) */
  hudContainer: {
    position: 'absolute',
    top: 14,
    left: 14,
    zIndex: 100,
  },
  hudPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(13, 20, 36, 0.90)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.28)',
    boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.5)',
    elevation: 6,
    gap: 8,
  },
  hudStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  hudStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  hudText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  hudBold: {
    fontWeight: '700',
    color: '#F8FAFC',
  },
  hudDivider: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },

  /* Floating Risk Legend Pill */
  legendContainer: {
    position: 'absolute',
    bottom: 210,
    left: 14,
    zIndex: 90,
  },
  legendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.15)',
    elevation: 3,
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
    fontWeight: '700',
    color: colors.ink,
  },

  controls: { 
    position: 'absolute', 
    bottom: 210, 
    right: spacing.base,
    gap: spacing.sm,
    zIndex: 90,
  },
  controlButton: {
    width: 46, 
    height: 46, 
    borderRadius: radii.full,
    backgroundColor: colors.snow, 
    alignItems: 'center', 
    justifyContent: 'center',
    elevation: 4, 
    boxShadow: '0px 2px 5px rgba(0,0,0,0.2)',
  },
  townMarkerContainer: { 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  townPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginBottom: 2,
    boxShadow: '0px 2px 4px rgba(0,0,0,0.25)',
    elevation: 3,
  },
  townPillStart: {
    borderColor: '#10B981',
    borderWidth: 1.5,
  },
  townPillEnd: {
    backgroundColor: '#EF4444',
    borderColor: '#B91C1C',
  },
  townPillText: {
    fontFamily: 'IBMPlexSansCondensed_600SemiBold',
    fontSize: 11,
    color: colors.ink,
  },
  townPillTextEnd: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  townDot: { 
    width: 7, 
    height: 7, 
    borderRadius: 3.5, 
    backgroundColor: '#0F172A', 
    borderWidth: 1.5, 
    borderColor: '#FFFFFF' 
  },
  townDotStart: {
    backgroundColor: '#10B981',
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  startDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 4,
  },
  userDotContainer: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: 'rgba(29, 94, 107, 0.2)', alignItems: 'center', justifyContent: 'center',
  },
  userDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.river, borderWidth: 1.5, borderColor: colors.snow,
  },
  sheetContent: { flex: 1, paddingTop: spacing.xs },
  dragHandle: {
    alignSelf: 'center', width: 32, height: 4,
    backgroundColor: colors.mist, borderRadius: 2, marginBottom: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'baseline', marginBottom: spacing.md,
  },
  actionRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  stripContainer: { flex: 1, alignItems: 'center' }
});
