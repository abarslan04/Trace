import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useTrace } from './src/hooks/useTrace';
import { useTheme, type Colors } from './src/theme/tokens';
import { Icon } from './src/components/Icon';
import RouteMap from './src/components/RouteMap';
import { useReducedMotion } from './src/components/useReducedMotion';

function Control({ children, onPress, label, selected, disabled, colors, style, primary = false }: {
  children: ReactNode; onPress: () => void; label: string; selected?: boolean; disabled?: boolean;
  colors: Colors; style?: StyleProp<ViewStyle>; primary?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ selected, disabled }} disabled={disabled} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => [styles.control, { backgroundColor: primary ? colors.primary : colors.surface, borderColor: focused ? colors.focus : selected ? colors.primary : colors.border, borderWidth: focused || selected ? 2 : 1, opacity: disabled ? 0.5 : pressed ? 0.72 : 1 }, style]}>
    {children}
  </Pressable>;
}

function TraceScreen() {
  const trace = useTrace();
  const { colors, isDark } = useTheme();
  const { width, height, fontScale } = useWindowDimensions();
  const wide = width >= 640 && width > height;
  const reducedMotion = useReducedMotion();
  const [custom, setCustom] = useState(false);
  const [customDistance, setCustomDistance] = useState('5');
  const [customTouched, setCustomTouched] = useState(false);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState(false);
  const [mapKey, setMapKey] = useState(0);
  const [recenterToken, setRecenterToken] = useState(0);
  const [loadingSeconds, setLoadingSeconds] = useState(0);
  const generating = trace.generationStatus === 'loading';
  const findingLocation = trace.locationStatus === 'loading';
  const customValue = Number(customDistance.replace(',', '.'));
  const validCustom = /^\d+(?:[.,]\d{0,2})?$/.test(customDistance.trim()) && customValue >= 1 && customValue <= 30;
  const customError = custom && customTouched && !validCustom;
  const routeIndex = trace.routes.findIndex(route => route.id === trace.selectedRoute?.id);
  const routeColor = colors.route[Math.max(0, routeIndex) % colors.route.length]!;
  const text = useMemo(() => createTextStyles(colors), [colors]);

  useEffect(() => {
    if (!generating) { setLoadingSeconds(0); return; }
    const timer = setInterval(() => setLoadingSeconds(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [generating]);

  const chooseDistance = (distance: number) => {
    setCustom(false); setCustomTouched(false); trace.setDistanceKm(distance); trace.clearGenerationError();
  };
  const updateCustomDistance = (value: string) => {
    setCustomDistance(value);
    const numeric = Number(value.replace(',', '.'));
    if (/^\d+(?:[.,]\d{0,2})?$/.test(value.trim()) && numeric >= 1 && numeric <= 30) trace.setDistanceKm(numeric);
  };
  const startGeneration = () => {
    setCustomTouched(true);
    if (custom && !validCustom) return;
    void trace.generateRoutes();
  };
  const locationTitle = trace.locationStatus === 'ready' ? 'Your starting point is set' : findingLocation ? 'Finding your starting point…' : trace.locationStatus === 'denied' ? 'Let’s find your starting point' : 'Start from where you are';
  const locationDetail = trace.locationError || (trace.location ? `GPS accuracy ±${Math.round(trace.location.accuracy ?? 0)} m` : 'Allow location to find routes near you.');

  const map = <View style={[styles.map, { backgroundColor: colors.mapBackground }, wide ? styles.wideMap : { minHeight: 220, height: Math.max(220, Math.min(height * 0.33, 420)) }]}>
    <RouteMap key={mapKey} location={trace.location} routes={trace.routes} selectedRouteId={trace.selectedRoute?.id ?? null}
      onSelectRoute={trace.selectRoute} colors={colors} isDark={isDark} reducedMotion={reducedMotion} recenterToken={recenterToken}
      onLoadingChange={loading => { setMapLoading(loading); if (!loading) setMapError(false); }} onError={() => { setMapError(true); setMapLoading(false); }}/>
    <View pointerEvents="box-none" style={styles.mapTop}>
      {trace.selectedRoute ? <View style={[styles.mapPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.pillNumber, { backgroundColor: routeColor }]}><Text style={[styles.pillNumberText, { color: colors.routeHalo }]}>{routeIndex + 1}</Text></View>
        <Text style={text.smallStrong}>{(trace.selectedRoute.distanceMeters / 1000).toFixed(2)} km · out & back</Text>
      </View> : <View style={[styles.mapPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Icon name="location" color={colors.primary} size={18}/><Text style={text.smallStrong}>{trace.location ? 'Start & finish here' : 'Your next run starts here'}</Text>
      </View>}
    </View>
    <View style={styles.mapActions}>
      <Control colors={colors} label={trace.selectedRoute ? 'Show the complete selected route' : 'Center map on my location'} onPress={() => setRecenterToken(value => value + 1)} disabled={!trace.location && !trace.selectedRoute} style={styles.mapControl}>
        <Icon name={trace.selectedRoute ? 'route' : 'location'} color={colors.text}/>
      </Control>
    </View>
    {mapLoading && <View pointerEvents="none" style={[styles.mapStatus, { backgroundColor: colors.surface }]}><ActivityIndicator size="small" color={colors.primary}/><Text style={text.small}>Loading map…</Text></View>}
    {mapError && <View style={[styles.mapError, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[text.small, { flex: 1 }]}>Map unavailable. Check your connection.</Text>
      <Control colors={colors} label="Reload map" onPress={() => { setMapError(false); setMapLoading(true); setMapKey(value => value + 1); }} style={{ paddingHorizontal: 12 }}><Icon name="refresh" color={colors.primary}/></Control>
    </View>}
  </View>;

  const panel = <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.panel, wide && { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', width: Math.min(width * 0.52, fontScale > 1.3 ? 440 : 400) }, { backgroundColor: colors.background }]}>
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.panelContent, wide && { paddingTop: 32 }]}>
      <View style={styles.section}>
        <Text style={text.eyebrow}>A ROUTE, JUST FOR YOU</Text>
        <Text accessibilityRole="header" style={text.heading}>Find your next run.</Text>
        <Text style={text.bodySecondary}>Pick a distance. We’ll find your way out and back.</Text>
      </View>

      <View style={[styles.locationCard, { backgroundColor: colors.surfaceMuted }]}>
        <View style={styles.locationTitle}>
          {findingLocation ? <ActivityIndicator size="small" color={colors.primary}/> : <Icon name="location" color={colors.primary} size={20}/>}
          <Text style={[text.smallStrong, { flex: 1 }]} accessibilityLiveRegion="polite">{locationTitle}</Text>
        </View>
        <Text style={text.small}>{trace.location && trace.location.accuracy === null && !trace.locationError ? 'Current location detected' : locationDetail}</Text>
        {(trace.locationStatus === 'denied' || trace.locationStatus === 'error') && <Control colors={colors} label={trace.canAskAgain ? 'Try location again' : 'Open location settings'} onPress={() => { void (trace.canAskAgain ? trace.refreshLocation() : trace.openLocationSettings()); }} style={styles.locationRetry}>
          <Text style={text.smallStrong}>{trace.canAskAgain ? 'Try location again' : 'Open settings'}</Text><Icon name="arrow" color={colors.primary} size={18}/>
        </Control>}
        {trace.locationStatus === 'ready' && trace.location && trace.location.accuracy !== null && trace.location.accuracy > 100 && <Text style={[text.small, { color: colors.warning }]}>GPS is approximate. Step outside and refresh for a better start.</Text>}
        {trace.locationStatus === 'ready' && <Pressable accessibilityRole="button" accessibilityLabel="Refresh current location" onPress={() => { void trace.refreshLocation(); }} disabled={generating} style={({ pressed }) => [styles.refreshLink, { opacity: pressed || generating ? 0.5 : 1 }]}><Text style={[text.smallStrong, { color: colors.primary }]}>Refresh location</Text><Icon name="refresh" color={colors.primary} size={16}/></Pressable>}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}><Text accessibilityRole="header" style={text.label}>How far?</Text><Text style={text.small}>Total · {trace.distanceKm} km</Text></View>
        <View style={styles.distanceRow}>
          {[3, 5, 10].map(value => <Control key={value} label={`${value} kilometers`} selected={!custom && trace.distanceKm === value} disabled={generating} onPress={() => chooseDistance(value)} colors={colors} style={[styles.distanceChip, !custom && trace.distanceKm === value && { backgroundColor: colors.primarySoft }]}>
            <Text style={[text.smallStrong, !custom && trace.distanceKm === value && { color: colors.primary }]}>{value} km</Text>
          </Control>)}
          <Control colors={colors} label="Enter a custom distance" selected={custom} disabled={generating} onPress={() => { setCustom(true); setCustomDistance(String(trace.distanceKm)); setCustomTouched(false); }} style={[styles.distanceChip, custom && { backgroundColor: colors.primarySoft }]}><Text style={text.smallStrong}>Custom</Text></Control>
        </View>
        {custom && <View style={styles.customField}>
          <Text style={text.smallStrong} nativeID="distance-label">Distance in kilometers</Text>
          <TextInput value={customDistance} onChangeText={updateCustomDistance} onBlur={() => setCustomTouched(true)} keyboardType="decimal-pad" inputMode="decimal" returnKeyType="done" editable={!generating} accessibilityLabel="Distance in kilometers, 1 to 30" accessibilityLabelledBy="distance-label" placeholder="5" placeholderTextColor={colors.textSecondary} maxLength={5}
            style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: customError ? colors.error : colors.border }]}/>
          <Text style={[text.small, customError && { color: colors.error }]} accessibilityLiveRegion="polite">{customError ? 'Enter a distance from 1 to 30 km, with up to 2 decimals.' : 'Choose any distance from 1 to 30 km.'}</Text>
        </View>}
      </View>

      {trace.storageWarning && <Text style={[text.small, { color: colors.warning }]}>{trace.storageWarning}</Text>}

      {trace.routes.length > 0 && <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Text style={text.label} accessibilityRole="header">{trace.isRestored ? 'Your last routes' : 'Choose your route'}</Text>
          <Text style={text.small}>{trace.routes.length} {trace.routes.length === 1 ? 'option' : 'options'}</Text>
        </View>
        {trace.generatedDistanceKm !== trace.distanceKm && <Text style={text.small}>These routes were generated for {trace.generatedDistanceKm} km. Generate again to use your new distance.</Text>}
        {trace.isRestored && <Text style={text.small}>Saved on this device{trace.savedAt ? ` · ${new Date(trace.savedAt).toLocaleDateString()}` : ''}. Generate again to start from your current location.</Text>}
        {trace.routes.map((route, index) => {
          const selected = route.id === trace.selectedRoute?.id;
          const color = colors.route[index % colors.route.length]!;
          return <Control key={route.id} colors={colors} label={`Route ${index + 1}, ${(route.distanceMeters / 1000).toFixed(2)} kilometers, out and back${selected ? ', selected' : ''}`} selected={selected} onPress={() => trace.selectRoute(route.id)} style={[styles.routeCard, selected && { backgroundColor: colors.primarySoft, borderColor: color }]}>
            <View style={[styles.routeNumber, { backgroundColor: color }]}><Text style={[styles.routeNumberText, { color: colors.routeHalo }]}>{index + 1}</Text></View>
            <View style={{ flex: 1, gap: 4 }}><Text style={text.smallStrong}>Route {index + 1}</Text><Text style={text.small}>Out & back</Text></View>
            <View style={styles.routeDistance}><Text style={text.routeDistance}>{(route.distanceMeters / 1000).toFixed(2)} <Text style={text.small}>km</Text></Text><Text style={text.caption}>{selected ? 'Selected' : 'View route'}</Text></View>
          </Control>;
        })}
        {trace.selectedRoute && <View style={[styles.routeNote, { borderColor: colors.border }]}>
          <Icon name="route" color={colors.primary} size={20}/><Text style={[text.small, { flex: 1 }]}>Turn around near {(trace.selectedRoute.distanceMeters / 2000).toFixed(2)} km and follow the same path back.</Text>
        </View>}
        <Text style={text.caption}>Routes use pedestrian map data. Check crossings and local access as you go.</Text>
      </View>}

      {trace.routes.length === 0 && !generating && <View style={[styles.empty, { borderColor: colors.border }]}>
        <Icon name="route" color={colors.primary} size={28}/>
        <View style={{ flex: 1, gap: 4 }}><Text style={text.smallStrong}>A fresh route. A familiar finish.</Text><Text style={text.small}>Head out, find your turning point, and retrace your steps home.</Text></View>
      </View>}
      <Pressable accessibilityRole="link" accessibilityLabel="Routing powered by GraphHopper" onPress={() => { void Linking.openURL('https://www.graphhopper.com/').catch(() => undefined); }} style={({ pressed }) => ({ minHeight: 48, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}><Text style={text.caption}>Routing powered by GraphHopper</Text></Pressable>
    </ScrollView>
      {trace.generationError && <View accessibilityRole="alert" style={[styles.notice, { backgroundColor: colors.errorBackground, borderColor: colors.error }]}>
        <Icon name="info" color={colors.error} size={20}/><Text style={[text.body, { color: colors.error, flex: 1 }]}>{trace.generationError}</Text>
      </View>}
      <View style={[styles.section, styles.actionFooter, { borderColor: colors.border }]}>
        <Control colors={colors} primary label={generating ? 'Finding routes' : 'Generate routes'} disabled={generating || findingLocation || (custom && !validCustom)} onPress={startGeneration} style={styles.generate}>
          {generating ? <ActivityIndicator color={colors.onPrimary}/> : <Icon name="route" color={colors.onPrimary}/>}
          <Text style={[text.button, { color: colors.onPrimary }]}>{generating ? 'Finding your routes…' : 'Generate routes'}</Text>
          {!generating && <Icon name="arrow" color={colors.onPrimary} size={20}/>}
        </Control>
        {generating ? <View style={styles.loadingDetails}>
          <Text style={[text.small, { flex: 1 }]} accessibilityLiveRegion="polite">{loadingSeconds < 8 ? 'Exploring nearby pedestrian paths…' : 'Checking distances for the best fit…'}</Text>
          <Control colors={colors} label="Cancel route generation" onPress={trace.cancelGeneration} style={styles.cancel}><Text style={text.smallStrong}>Cancel</Text></Control>
        </View> : <Text style={[text.caption, { textAlign: 'center' }]}>Up to 3 routes · Starting and ending near you</Text>}
      </View>

  </KeyboardAvoidingView>;

  return <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top', 'left', 'right', 'bottom']}>
    <StatusBar style={isDark ? 'light' : 'dark'}/>
    <View style={[styles.header, { borderColor: colors.border }]}>
      <View style={styles.brand}><Icon name="route" color={colors.primary} size={29}/><Text style={[styles.wordmark, { color: colors.text }]}>trace</Text></View>
      <Text style={[text.small, styles.tagline]}>Go a little further.</Text>
    </View>
    <View style={[styles.content, wide && styles.wideContent]}>{wide ? <>{panel}{map}</> : <>{map}{panel}</>}</View>
  </SafeAreaView>;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <View style={styles.fallback}><Text style={{ fontSize: 24, fontWeight: '700' }}>Trace needs a fresh start.</Text><Text style={{ fontSize: 16, lineHeight: 24 }}>Close and reopen the app to try again.</Text></View>;
  }
}

export default function App() {
  return <SafeAreaProvider><ErrorBoundary><TraceScreen/></ErrorBoundary></SafeAreaProvider>;
}

const createTextStyles = (colors: Colors) => StyleSheet.create({
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '700', letterSpacing: 1.7, lineHeight: 18 },
  heading: { color: colors.text, fontSize: 29, lineHeight: 36, fontWeight: '700', letterSpacing: -0.9 },
  body: { color: colors.text, fontSize: 16, lineHeight: 24 },
  bodySecondary: { color: colors.textSecondary, fontSize: 16, lineHeight: 24 },
  small: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  smallStrong: { color: colors.text, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  caption: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  label: { color: colors.text, fontSize: 18, lineHeight: 25, fontWeight: '600' },
  button: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  routeDistance: { color: colors.text, fontSize: 23, lineHeight: 30, fontWeight: '600', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { minHeight: 76, paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wordmark: { fontSize: 34, fontWeight: '700', letterSpacing: -1.7, lineHeight: 40 },
  tagline: { flexShrink: 1, textAlign: 'right' },
  content: { flex: 1, minHeight: 0 },
  wideContent: { flexDirection: 'row' },
  map: { overflow: 'hidden', position: 'relative' },
  wideMap: { flex: 1, minWidth: 0 },
  mapTop: { position: 'absolute', top: 16, left: 64, right: 16, alignItems: 'flex-end' },
  mapPill: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 100, borderWidth: 1 },
  pillNumber: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pillNumberText: { fontSize: 12, fontWeight: '700' },
  mapActions: { position: 'absolute', top: 72, right: 16 },
  mapControl: { width: 48, height: 48, borderRadius: 16 },
  mapStatus: { position: 'absolute', bottom: 40, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, flexDirection: 'row', gap: 8 },
  mapError: { position: 'absolute', left: 16, right: 16, bottom: 40, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, paddingLeft: 16, paddingRight: 8, paddingVertical: 8, borderWidth: 1 },
  panel: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 0 },
  panelContent: { padding: 24, gap: 24, paddingBottom: 32 },
  section: { gap: 12 },
  actionFooter: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 12, borderTopWidth: 1 },
  sectionHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  control: { minHeight: 48, minWidth: 48, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  locationCard: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, borderRadius: 16, gap: 8 },
  locationTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locationRetry: { marginTop: 4, marginBottom: 8, justifyContent: 'space-between' },
  refreshLink: { minHeight: 48, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 8, paddingRight: 16 },
  distanceRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  distanceChip: { flexGrow: 1, paddingHorizontal: 12, minWidth: 64 },
  customField: { gap: 8 },
  input: { minHeight: 52, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderRadius: 12, fontSize: 18 },
  generate: { minHeight: 58, paddingHorizontal: 16, borderRadius: 18 },
  loadingDetails: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cancel: { paddingHorizontal: 12 },
  notice: { borderWidth: 1, padding: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  routeCard: { paddingHorizontal: 16, paddingVertical: 16, gap: 12, borderRadius: 18, justifyContent: 'flex-start', flexWrap: 'wrap' },
  routeNumber: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  routeNumberText: { fontSize: 16, fontWeight: '700' },
  routeDistance: { alignItems: 'flex-end' },
  routeNote: { borderTopWidth: 1, paddingTop: 16, flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  empty: { borderTopWidth: 1, paddingTop: 24, flexDirection: 'row', gap: 16, alignItems: 'center' },
  fallback: { flex: 1, padding: 32, justifyContent: 'center', gap: 16, backgroundColor: '#F6F7F2' },
});
