import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, GeoJSONSource, Layer, Map, type CameraRef } from '@maplibre/maplibre-react-native';
import { StyleSheet } from 'react-native';
import { turnaroundCoordinate, mapStyleURL, pointFeature, routeBounds, routeFeature, type RouteMapProps } from './mapShared';
import { motion } from '../theme/tokens';

export default function RouteMap(props: RouteMapProps) {
  const { location, routes, selectedRouteId, colors, reducedMotion, recenterToken } = props;
  const camera = useRef<CameraRef>(null);
  const [ready, setReady] = useState(false);
  const selected = routes.find(route => route.id === selectedRouteId);
  const ordered = useMemo(() => [...routes].sort((a, b) => Number(a.id === selectedRouteId) - Number(b.id === selectedRouteId)), [routes, selectedRouteId]);

  useEffect(() => {
    if (!ready) return;
    const duration = reducedMotion ? 0 : motion.camera;
    if (selected) {
      camera.current?.fitBounds(routeBounds(selected), { padding: { top: 64, bottom: 52, left: 48, right: 72 }, duration });
    } else if (location) {
      camera.current?.easeTo({ center: [location.longitude, location.latitude], zoom: 14, duration });
    }
  }, [ready, selected, location, reducedMotion, recenterToken]);

  return (
    <Map style={StyleSheet.absoluteFill} mapStyle={mapStyleURL(props.isDark)}
      attribution attributionPosition={{ bottom: 10, left: 10 }} compass compassPosition={{ top: 16, left: 16 }}
      touchPitch={false}
      onWillStartLoadingMap={() => { setReady(false); props.onLoadingChange(true); }}
      onDidFinishLoadingStyle={() => { setReady(true); props.onLoadingChange(false); }}
      onDidFailLoadingMap={props.onError}>
      <Camera ref={camera} initialViewState={{ center: location ? [location.longitude, location.latitude] : [0, 20], zoom: location ? 14 : 1.5 }} minZoom={1}/>
      {ordered.map(route => {
        const isSelected = route.id === selectedRouteId;
        const color = colors.route[routes.indexOf(route) % colors.route.length]!;
        return <GeoJSONSource key={route.id} id={`route-${route.id}`} data={routeFeature(route)}
          onPress={event => { event.stopPropagation(); props.onSelectRoute(route.id); }}>
          <Layer id={`halo-${route.id}`} type="line" paint={{ 'line-color': colors.routeHalo, 'line-width': isSelected ? 10 : 7, 'line-opacity': isSelected ? 0.95 : 0.6 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }}/>
          <Layer id={`line-${route.id}`} type="line" paint={{ 'line-color': color, 'line-width': isSelected ? 5 : 3, 'line-opacity': isSelected ? 1 : 0.6 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }}/>
        </GeoJSONSource>;
      })}
      {selected && <GeoJSONSource id="turnaround" data={pointFeature(...turnaroundCoordinate(selected))}>
        <Layer id="turnaround-point" type="circle" paint={{ 'circle-radius': 7, 'circle-color': colors.route[routes.indexOf(selected) % colors.route.length]!, 'circle-stroke-color': colors.routeHalo, 'circle-stroke-width': 3 }}/>
      </GeoJSONSource>}
      {location && <GeoJSONSource id="start" data={pointFeature(location.longitude, location.latitude)}>
        <Layer id="start-halo" type="circle" paint={{ 'circle-radius': 17, 'circle-color': colors.location, 'circle-opacity': 0.15 }}/>
        <Layer id="start-point" type="circle" paint={{ 'circle-radius': 7, 'circle-color': colors.location, 'circle-stroke-color': colors.routeHalo, 'circle-stroke-width': 3 }}/>
      </GeoJSONSource>}
    </Map>
  );
}
