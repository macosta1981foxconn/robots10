<script>
  import { onMount } from 'svelte';
  import L from 'leaflet';
  import 'leaflet/dist/leaflet.css';

  let {
    geofences = [],
    sites = [],
    color = '#2563eb',
    onchange = () => {}
  } = $props();

  let mapEl;
  let map = $state.raw(null);
  let contextLayer = $state.raw(null);
  let drawLayer = $state.raw(null);
  let ready = $state(false);
  let points = $state([]);
  let closed = $state(false);
  let drawing = $state(false);
  let userLocation = $state(null);

  function emitPolygon() {
    if (!closed || points.length < 3) {
      onchange('');
      return;
    }
    const ring = points.map((point) => [point.lng, point.lat]);
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
    onchange(JSON.stringify({ type: 'Polygon', coordinates: [ring] }));
  }

  function addPoint(latlng) {
    if (!drawing || closed) return;
    points = [...points, { lat: latlng.lat, lng: latlng.lng }];
  }

  function startDrawing() {
    points = [];
    closed = false;
    drawing = true;
    emitPolygon();
  }

  function undoPoint() {
    if (closed) {
      closed = false;
      emitPolygon();
    }
    if (points.length) points = points.slice(0, -1);
  }

  function finishDrawing() {
    if (points.length < 3) return;
    closed = true;
    drawing = false;
    emitPolygon();
  }

  function clearDrawing() {
    points = [];
    closed = false;
    drawing = false;
    emitPolygon();
  }

  function renderContext() {
    if (!ready || !contextLayer) return;
    contextLayer.clearLayers();

    for (const geofence of geofences.filter((item) => item.active !== false)) {
      const ring = geofence.polygon?.coordinates?.[0] || [];
      if (ring.length < 3) continue;
      L.polygon(
        ring.map(([lng, lat]) => [lat, lng]),
        { color: geofence.color || '#2563eb', weight: 2, fillOpacity: 0.12 }
      )
        .addTo(contextLayer)
        .bindTooltip(geofence.name || 'Geocerca');
    }

    for (const site of sites.filter((item) => item.active !== false && item.lat != null && item.lng != null)) {
      L.circleMarker([site.lat, site.lng], {
        radius: 7,
        color: '#ffffff',
        weight: 2,
        fillColor: site.type === 'warehouse' ? '#f59e0b' : '#8b5cf6',
        fillOpacity: 1
      })
        .addTo(contextLayer)
        .bindTooltip(`${site.name} (${site.type === 'warehouse' ? 'Almacén' : 'Línea'})`);
    }

    if (userLocation) {
      if (userLocation.accuracy) {
        L.circle([userLocation.lat, userLocation.lng], {
          radius: userLocation.accuracy,
          color: '#0ea5e9',
          weight: 1,
          fillColor: '#38bdf8',
          fillOpacity: 0.08
        }).addTo(contextLayer);
      }
      L.circleMarker([userLocation.lat, userLocation.lng], {
        radius: 8,
        color: '#ffffff',
        weight: 2,
        fillColor: '#0ea5e9',
        fillOpacity: 1
      })
        .addTo(contextLayer)
        .bindTooltip('Tu ubicación');
    }
  }

  function renderDrawing() {
    if (!ready || !drawLayer) return;
    drawLayer.clearLayers();
    if (points.length === 0) return;

    const latlngs = points.map((point) => [point.lat, point.lng]);
    if (closed && points.length >= 3) {
      L.polygon(latlngs, { color, weight: 3, fillOpacity: 0.18, interactive: false }).addTo(drawLayer);
    } else {
      L.polyline(latlngs, { color, weight: 3, dashArray: '5 5', interactive: false }).addTo(drawLayer);
    }

    points.forEach((point, index) => {
      const marker = L.circleMarker([point.lat, point.lng], {
        radius: index === 0 && points.length >= 3 ? 8 : 5,
        color,
        weight: 2,
        fillColor: '#ffffff',
        fillOpacity: 1,
        interactive: false
      }).addTo(drawLayer);
      if (index === 0 && points.length >= 3 && !closed) marker.bindTooltip('Primer punto: une con el último para cerrar');
    });
  }

  onMount(() => {
    if (!mapEl || map) return;
    map = L.map(mapEl).setView([12.1364, -86.2514], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);
    contextLayer = L.layerGroup().addTo(map);
    drawLayer = L.layerGroup().addTo(map);
    map.on('click', (event) => addPoint(event.latlng));
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
      contextLayer = null;
      drawLayer = null;
    };
  });

  $effect(() => {
    renderContext();
  });

  $effect(() => {
    if (userLocation && map) map.setView([userLocation.lat, userLocation.lng], 16);
  });

  $effect(() => {
    renderDrawing();
  });
</script>

<div bind:this={mapEl} class="geofence-drawer" aria-label="Mapa para dibujar geocerca"></div>

<div class="drawer-controls">
  {#if !drawing && !closed}
    <button type="button" class="secondary" onclick={startDrawing}>Iniciar dibujo</button>
  {:else}
    <button type="button" class="secondary" onclick={undoPoint} disabled={!points.length}>Deshacer punto</button>
    {#if drawing && points.length >= 3}
      <button type="button" onclick={finishDrawing}>Cerrar polígono</button>
    {/if}
    <button type="button" class="secondary" onclick={clearDrawing}>Limpiar</button>
  {/if}
</div>

{#if closed}
  <p class="muted" style="margin-top:8px">Polígono listo. Puedes limpiarlo para volver a dibujar.</p>
{:else if drawing}
  <p class="muted" style="margin-top:8px">Haz clic en el mapa para agregar vértices. Necesitas mínimo 3 puntos.</p>
{/if}

<style>
  .geofence-drawer {
    height: 360px;
    width: 100%;
    border-radius: 14px;
    border: 1px solid #e2e8f0;
    overflow: hidden;
    background: #e2e8f0;
  }
  .drawer-controls {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 10px;
  }
</style>
