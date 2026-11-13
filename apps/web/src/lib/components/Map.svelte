<script>
  import { onMount } from 'svelte';
  import L from 'leaflet';
  import 'leaflet/dist/leaflet.css';

  let {
    geofences = [],
    robots = [],
    sites = [],
    trips = []
  } = $props();

  let mapEl;
  let map = $state.raw(null);
  let layerGroup = $state.raw(null);
  let ready = $state(false);
  let userLocation = $state(null);

  function icon(color, label) {
    return L.divIcon({
      className: 'robot-marker',
      html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};color:white;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,.25)">${label}</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
  }

  function siteById(id) {
    return sites.find((site) => site.id === id);
  }

  function robotColor(status) {
    return {
      available: '#16a34a',
      busy: '#2563eb',
      charging: '#d97706',
      offline: '#64748b'
    }[status] || '#0f172a';
  }

  onMount(() => {
    if (!mapEl || map) return;
    map = L.map(mapEl).setView([12.1364, -86.2514], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);
    layerGroup = L.layerGroup().addTo(map);
    ready = true;

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy || null
          };
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    }

    return () => {
      ready = false;
      if (map) map.remove();
      map = null;
      layerGroup = null;
    };
  });

  $effect(() => {
    if (!ready || !map || !layerGroup) return;
    layerGroup.clearLayers();

    const bounds = L.latLngBounds([]);
    let hasBounds = false;
    const extend = (lat, lng) => {
      if (lat == null || lng == null) return;
      bounds.extend([lat, lng]);
      hasBounds = true;
    };

    for (const geofence of geofences.filter((item) => item.active !== false)) {
      const ring = geofence.polygon?.coordinates?.[0] || [];
      if (ring.length < 3) continue;
      for (const [lng, lat] of ring) extend(lat, lng);
      L.polygon(
        ring.map(([lng, lat]) => [lat, lng]),
        { color: geofence.color || '#2563eb', weight: 2, fillOpacity: 0.14 }
      )
        .addTo(layerGroup)
        .bindTooltip(geofence.name || 'Geocerca');
    }

    for (const site of sites.filter((item) => item.active !== false && item.lat != null && item.lng != null)) {
      extend(site.lat, site.lng);
      L.marker([site.lat, site.lng], {
        icon: icon(site.type === 'warehouse' ? '#f59e0b' : '#8b5cf6', site.type === 'warehouse' ? 'W' : 'L')
      })
        .addTo(layerGroup)
        .bindTooltip(`${site.name} (${site.type === 'warehouse' ? 'Almacén' : 'Línea'})`);
    }

    for (const robot of robots) {
      if (robot.current_lat == null || robot.current_lng == null) continue;
      extend(robot.current_lat, robot.current_lng);
      L.marker([robot.current_lat, robot.current_lng], {
        icon: icon(robotColor(robot.status), (robot.name || robot.code || 'R').slice(0, 2).toUpperCase())
      })
        .addTo(layerGroup)
        .bindTooltip(`${robot.name || robot.code} · ${robot.status} · ${Number(robot.load_kg || 0)} kg`);
    }

    for (const trip of trips.filter((item) => ['assigned', 'in_transit', 'arrived'].includes(item.status))) {
      const origin = siteById(trip.origin_site_id);
      const destination = siteById(trip.destination_site_id);
      if (origin?.lat == null || destination?.lat == null) continue;
      extend(origin.lat, origin.lng);
      extend(destination.lat, destination.lng);
      L.polyline(
        [
          [origin.lat, origin.lng],
          [destination.lat, destination.lng]
        ],
        { color: '#ef4444', weight: 3, dashArray: '6 6', opacity: 0.8 }
      )
        .addTo(layerGroup)
        .bindTooltip(`${trip.material} · ${trip.weight_kg} kg`);
    }

    if (userLocation) {
      if (userLocation.accuracy) {
        L.circle([userLocation.lat, userLocation.lng], {
          radius: userLocation.accuracy,
          color: '#0ea5e9',
          weight: 1,
          fillColor: '#38bdf8',
          fillOpacity: 0.08
        }).addTo(layerGroup);
      }
      L.circleMarker([userLocation.lat, userLocation.lng], {
        radius: 8,
        color: '#ffffff',
        weight: 2,
        fillColor: '#0ea5e9',
        fillOpacity: 1
      })
        .addTo(layerGroup)
        .bindTooltip('Tu ubicación');
      if (hasBounds) bounds.extend([userLocation.lat, userLocation.lng]);
    }

    if (hasBounds) map.fitBounds(bounds.pad(0.2));
    else if (userLocation) map.setView([userLocation.lat, userLocation.lng], 16);
    else map.setView([12.1364, -86.2514], 13);
  });
</script>

<div bind:this={mapEl} class="map" aria-label="Mapa de geocercas y robots"></div>

<style>
  .map {
    height: 460px;
    width: 100%;
    border-radius: 14px;
    border: 1px solid #e2e8f0;
    overflow: hidden;
    background: #e2e8f0;
  }
</style>
