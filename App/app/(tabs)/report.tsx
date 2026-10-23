import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Image, Modal, TextInput, AccessibilityInfo, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Location from 'expo-location';
import MapView, { Marker, UrlTile } from 'react-native-maps';
import Animated, { useSharedValue, useAnimatedProps, withTiming, Easing } from 'react-native-reanimated';
import { Svg, Path } from 'react-native-svg';

import { AppHeader, ThemedText, Button, Chip } from '../../src/components';
import { useRiskMap } from '../../src/api/hooks';
import { nearestSegment } from '../../src/utils/nearestSegment';
import { enqueueReport } from '../../src/api/queue';
import { postFieldReport, HttpError, NetworkError } from '../../src/api/client';
import { colors, spacing, radii } from '../../src/design/tokens';
import type { FieldReportSubmission } from '../../src/api/types';

const AnimatedPath = Animated.createAnimatedComponent(Path);

const REPORT_TYPES = [
  { id: 'slide', en: 'Landslide or debris' },
  { id: 'rockfall', en: 'Falling rocks' },
  { id: 'crack', en: 'Cracks or sinking road' },
  { id: 'water', en: 'Water on the road' },
  { id: 'blocked', en: 'Road blocked' }
] as const;

export default function ReportScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { data: riskMapData } = useRiskMap();
  
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
  const [nearest, setNearest] = useState<{name: string, km: number} | null>(null);
  
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [reporterName, setReporterName] = useState('');
  
  const [isMapVisible, setIsMapVisible] = useState(false);
  const [mapLocation, setMapLocation] = useState<{lat: number, lng: number} | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  const progress = useSharedValue(0);

  useEffect(() => {
    if (isSuccess && !reduceMotion) {
      progress.value = 0;
      progress.value = withTiming(1, { duration: 300, easing: Easing.inOut(Easing.ease) });
    } else if (isSuccess && reduceMotion) {
      progress.value = 1;
    }
  }, [isSuccess, reduceMotion]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: 100 - progress.value * 100,
  }));

  const fetchLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'Location permission is required to report an incident.');
      return;
    }
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      updateLocation(loc.coords.latitude, loc.coords.longitude);
    } catch {
      Alert.alert('Error', 'Could not fetch location.');
    }
  };

  const updateLocation = (lat: number, lng: number) => {
    setLocation({ lat, lng });
    if (riskMapData?.segments) {
      const n = nearestSegment(lat, lng, riskMapData.segments);
      if (n) setNearest({ name: n.segment.name, km: n.km });
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'Camera permission is required.');
      return;
    }
    
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });
    
    if (!result.canceled && result.assets.length > 0) {
      const uri = result.assets[0].uri;
      const manipResult = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: Math.min(result.assets[0].width, 1280) } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );
      setPhotoUri(manipResult.uri);
      
      if (!location) {
        fetchLocation();
      }
    }
  };

  const handleMapConfirm = () => {
    if (mapLocation) {
      updateLocation(mapLocation.lat, mapLocation.lng);
    }
    setIsMapVisible(false);
  };

  const handleSubmit = async () => {
    if (!photoUri || !location || !selectedTypeId) return;
    
    setIsSubmitting(true);
    
    const selectedTypeObj = REPORT_TYPES.find(t => t.id === selectedTypeId)!;
    const desc = note.trim() ? `[${selectedTypeObj.en}] ${note.trim()}` : `[${selectedTypeObj.en}]`;
    const finalName = reporterName.trim() || 'Traveller';
    
    const submission: FieldReportSubmission = {
      lat: location.lat,
      lng: location.lng,
      reporter_name: finalName,
      description: desc,
      photo_url: undefined, // no endpoint, save on phone
    };
    
    try {
      // Try to send immediately
      const res = await postFieldReport(submission);
      
      try {
        const storedIdsStr = await AsyncStorage.getItem('raah_my_report_ids');
        const storedIds = storedIdsStr ? JSON.parse(storedIdsStr) : [];
        if (res && res.id) {
          storedIds.push(res.id);
          await AsyncStorage.setItem('raah_my_report_ids', JSON.stringify(storedIds));
        }
      } catch (e) {}

      // Success online
      setIsOfflineMode(false);
      setIsSuccess(true);
      
      // Also save to queue as verified or pending just to keep history
      await enqueueReport(submission, photoUri);
    } catch (err: any) {
      if (err instanceof HttpError) {
        if (err.status === 422) {
          Alert.alert('Error', 'You seem to be too far from NH-7 to report here.');
        } else if (err.status === 409) {
          setIsOfflineMode(false);
          setIsSuccess(true); // Already reported. Thank you.
        } else if (err.status === 429) {
          Alert.alert('Too many reports', 'Too many reports. Try again in a minute.');
          // Queue it
          await enqueueReport(submission, photoUri);
          setIsOfflineMode(true);
          setIsSuccess(true);
        } else {
          Alert.alert('Error', 'Failed to submit report. Please try again.');
        }
      } else {
        // Network error, queue it
        await enqueueReport(submission, photoUri);
        setIsOfflineMode(true);
        setIsSuccess(true);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setPhotoUri(null);
    setLocation(null);
    setNearest(null);
    setSelectedTypeId(null);
    setNote('');
    setReporterName('');
    setIsSuccess(false);
  };

  const isFormValid = photoUri && location && selectedTypeId;

  if (isSuccess) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <AppHeader title={t('nav.report')} />
        <View style={styles.successContainer}>
          <View style={styles.checkCircle}>
            <Svg width="48" height="48" viewBox="0 0 48 48">
              <AnimatedPath
                d="M14 24 L22 32 L34 16"
                stroke={colors.snow}
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                strokeDasharray="100"
                animatedProps={animatedProps}
              />
            </Svg>
          </View>
          <ThemedText variant="h2" color={colors.ink} style={styles.successTitle}>
            {isOfflineMode 
              ? "Saved on this phone. It sends when you have signal." 
              : "Report sent. An official will check it."}
          </ThemedText>
          <View style={styles.successActions}>
            <Button 
              label="See my reports" 
              variant="primary" 
              onPress={() => {
                resetForm();
                router.push('/report/mine');
              }} 
            />
            <Button 
              label="Done" 
              variant="secondary" 
              onPress={resetForm} 
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader title={t('nav.report')} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        
        <View style={styles.headerArea}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <ThemedText variant="h2" color={colors.ink}>
              Report an incident
            </ThemedText>
            <TouchableOpacity onPress={() => router.push('/report/mine')}>
              <ThemedText variant="small" color={colors.river} style={{ fontWeight: '700' }}>
                My Reports →
              </ThemedText>
            </TouchableOpacity>
          </View>
          <ThemedText variant="small" color={colors.granite}>
            Do not stop on a slope to take a photo. Report from a safe place.
          </ThemedText>
        </View>

        {/* Photo */}
        <View style={styles.section}>
          {!photoUri ? (
            <TouchableOpacity style={styles.photoBtn} onPress={takePhoto}>
              <ThemedText variant="body" color={colors.river}>+ Take photo</ThemedText>
            </TouchableOpacity>
          ) : (
            <View style={styles.photoPreview}>
              <Image source={{ uri: photoUri }} style={styles.photoImg} />
              <TouchableOpacity style={styles.retakeBtn} onPress={takePhoto}>
                <ThemedText variant="small" color={colors.snow}>Retake</ThemedText>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Location */}
        <View style={styles.section}>
          <ThemedText variant="h3" color={colors.ink} style={styles.label}>Location</ThemedText>
          {location ? (
            <View style={styles.locRow}>
              <ThemedText variant="body" color={colors.ink} style={{ flex: 1 }}>
                {nearest ? `${nearest.name} (km ${nearest.km})` : `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`}
              </ThemedText>
              <TouchableOpacity onPress={() => setIsMapVisible(true)}>
                <ThemedText variant="body" color={colors.river}>Change on map</ThemedText>
              </TouchableOpacity>
            </View>
          ) : (
            <Button label="Get my location" variant="secondary" onPress={fetchLocation} />
          )}
        </View>

        {/* Type */}
        <View style={styles.section}>
          <ThemedText variant="h3" color={colors.ink} style={styles.label}>Incident type</ThemedText>
          <View style={styles.chipRow}>
            {REPORT_TYPES.map(type => (
              <Chip 
                key={type.id} 
                label={t(`report.type.${type.id}`, type.en)} 
                selected={selectedTypeId === type.id} 
                onPress={() => setSelectedTypeId(type.id)} 
              />
            ))}
          </View>
        </View>

        {/* Note */}
        <View style={styles.section}>
          <ThemedText variant="h3" color={colors.ink} style={styles.label}>Note (optional)</ThemedText>
          <TextInput 
            style={styles.input}
            placeholder="Add details..."
            placeholderTextColor={colors.granite}
            value={note}
            onChangeText={setNote}
            maxLength={100}
          />
        </View>

        {/* Name */}
        <View style={styles.section}>
          <ThemedText variant="h3" color={colors.ink} style={styles.label}>Your name (optional)</ThemedText>
          <TextInput 
            style={styles.input}
            placeholder="Traveller"
            placeholderTextColor={colors.granite}
            value={reporterName}
            onChangeText={setReporterName}
            maxLength={50}
          />
        </View>
        
        <View style={styles.submitArea}>
          <Button 
            label="Send report" 
            variant="primary" 
            onPress={handleSubmit} 
            disabled={!isFormValid || isSubmitting}
          />
          <TouchableOpacity onPress={() => router.push('/report/mine')} style={{ alignItems: 'center', marginTop: spacing.md }}>
            <ThemedText variant="body" color={colors.river}>View my reports</ThemedText>
          </TouchableOpacity>
        </View>
      </ScrollView>
      
      {/* Map Picker Modal */}
      <Modal visible={isMapVisible} animationType="slide">
        <SafeAreaView style={styles.safe}>
          <AppHeader title="Change location" showBack onBack={() => setIsMapVisible(false)} />
          <MapView 
            style={{ flex: 1 }}
            mapType="none"
            initialRegion={{
              latitude: location?.lat || 30.136,
              longitude: location?.lng || 78.394,
              latitudeDelta: 0.1,
              longitudeDelta: 0.1,
            }}
            onPress={(e) => setMapLocation({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}
          >
            <UrlTile 
              urlTemplate="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
              maximumZ={18}
              tileSize={256}
              shouldReplaceMapContent={true}
              zIndex={-1}
            />
            {mapLocation && <Marker coordinate={{ latitude: mapLocation.lat, longitude: mapLocation.lng }} />}
          </MapView>
          <View style={{ padding: spacing.base }}>
            <Button label="Confirm location" variant="primary" onPress={handleMapConfirm} disabled={!mapLocation} />
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.snow },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base, paddingBottom: spacing['2xl'] },
  headerArea: { marginBottom: spacing.xl, gap: spacing.xs },
  section: { marginBottom: spacing.xl },
  label: { marginBottom: spacing.sm },
  photoBtn: { height: 120, backgroundColor: colors.mist, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.granite, borderStyle: 'dashed' },
  photoPreview: { height: 160, borderRadius: radii.md, overflow: 'hidden', position: 'relative' },
  photoImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  retakeBtn: { position: 'absolute', bottom: spacing.sm, right: spacing.sm, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.sm },
  locRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.mist, padding: spacing.sm, borderRadius: radii.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.mist, borderRadius: radii.sm, padding: spacing.sm, color: colors.ink, fontFamily: 'IBMPlexSans_400Regular', fontSize: 16, height: 48 },
  submitArea: { marginTop: spacing.lg },
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  checkCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.river, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  successTitle: { textAlign: 'center', marginBottom: spacing.xl },
  successActions: { width: '100%', gap: spacing.md }
});
