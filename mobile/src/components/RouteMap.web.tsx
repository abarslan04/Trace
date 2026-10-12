import { useEffect, useRef, useState } from 'react';
import { Map, NavigationControl, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { allRoutesFeature, turnaroundCoordinate, mapStyleURL, pointFeature, routeBounds, type RouteMapProps } from './mapShared';
import { motion } from '../theme/tokens';

export default function RouteMap(props: RouteMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<Map | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [ready, setReady] = useState(false);
  const [idle, setIdle] = useState(false);
  const styleURL = mapStyleURL(props.isDark);

  useEffect(() => {
    if (!container.current) return;
    latest.current.onLoadingChange(true);
    setReady(false);
    setIdle(false);
    setWorkerUrl(new URL('maplibre-gl-worker.mjs', document.baseURI).href);
    let map: Map;
    try {
      map = new Map({ container: container.current, style: styleURL, center: [0, 20], zoom: 1.5, attributionControl: { compact: false }, touchPitch: false, pitchWithRotate: false });
    } catch {
      latest.current.onError();
      return;
    }
    instance.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), 'top-left');
    map.on('load', () => {
      map.addSource('trace-routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'route-halos', type: 'line', source: 'trace-routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': latest.current.colors.routeHalo, 'line-width': 10, 'line-opacity': 0.8 } });
      map.addLayer({ id: 'route-lines', type: 'line', source: 'trace-routes', layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['case', ['get', 'selected'], 1, 0] }, paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'selected'], 5, 3], 'line-opacity': ['case', ['get', 'selected'], 1, 0.55] } });
      map.addLayer({ id: 'route-hitbox', type: 'line', source: 'trace-routes', paint: { 'line-width': 24, 'line-opacity': 0 } });
      map.addSource('trace-start', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'start-halo', type: 'circle', source: 'trace-start', paint: { 'circle-radius': 17, 'circle-color': latest.current.colors.location, 'circle-opacity': 0.15 } });
      map.addLayer({ id: 'start-dot', type: 'circle', source: 'trace-start', paint: { 'circle-radius': 7, 'circle-color': latest.current.colors.location, 'circle-stroke-color': latest.current.colors.routeHalo, 'circle-stroke-width': 3 } });
      map.addSource('trace-turnaround', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'turnaround-dot', type: 'circle', source: 'trace-turnaround', paint: { 'circle-radius': 7, 'circle-color': latest.current.colors.primary, 'circle-stroke-color': latest.current.colors.routeHalo, 'circle-stroke-width': 3 } });
      map.on('click', 'route-hitbox', event => {
        const routeId = event.features?.[0]?.properties?.routeId;
        if (typeof routeId === 'string') latest.current.onSelectRoute(routeId);
      });
      map.on('mouseenter', 'route-hitbox', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'route-hitbox', () => { map.getCanvas().style.cursor = ''; });
      setReady(true);
    });
    map.on('idle', () => { setIdle(true); latest.current.onLoadingChange(false); });
    map.on('movestart', () => setIdle(false));
    map.on('dataloading', () => setIdle(false));
    map.on('error', () => latest.current.onError());
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container.current);
    return () => { observer.disconnect(); instance.current = null; map.remove(); };
  }, [styleURL]);

  useEffect(() => {
    const map = instance.current;
    if (!map || !ready) return;
    const { routes, selectedRouteId, colors, location } = props;
    (map.getSource('trace-routes') as GeoJSONSource).setData(allRoutesFeature(routes, selectedRouteId, colors));
    (map.getSource('trace-start') as GeoJSONSource).setData(location ? pointFeature(location.longitude, location.latitude) : { type: 'FeatureCollection', features: [] });
    const selected = routes.find(route => route.id === selectedRouteId);
    if (selected) map.setPaintProperty('turnaround-dot', 'circle-color', colors.route[routes.indexOf(selected) % colors.route.length]!);
    const midpoint = selected ? turnaroundCoordinate(selected) : undefined;
    (map.getSource('trace-turnaround') as GeoJSONSource).setData(midpoint ? pointFeature(midpoint[0]!, midpoint[1]!) : { type: 'FeatureCollection', features: [] });
  }, [ready, props.routes, props.selectedRouteId, props.location, props.colors]);

  useEffect(() => {
    const map = instance.current;
    if (!map || !ready) return;
    const duration = props.reducedMotion ? 0 : motion.camera;
    const selected = props.routes.find(route => route.id === props.selectedRouteId);
    if (selected) map.fitBounds(routeBounds(selected), { padding: { top: 64, right: 72, bottom: 52, left: 48 }, duration, maxZoom: 16 });
    else if (props.location) map.easeTo({ center: [props.location.longitude, props.location.latitude], zoom: 14, duration });
  }, [ready, props.routes, props.selectedRouteId, props.location, props.recenterToken, props.reducedMotion]);

  return <div ref={container} data-map-ready={ready} data-map-idle={idle} aria-label="Interactive running route map" style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }} />;
}
