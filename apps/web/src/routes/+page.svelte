<script>
  import { onMount } from 'svelte';
  import { api } from '#lib/api.js';
  import Map from '#lib/components/Map.svelte';

  let dashboard = $state(null);
  let robots = $state([]);
  let sites = $state([]);
  let geofences = $state([]);
  let trips = $state([]);
  let loading = $state(true);
  let error = $state('');

  function fmt(date) {
    if (!date) return '-';
    return new Date(date).toLocaleString('es');
  }

  onMount(async () => {
    try {
      const [dash, robotsRes, sitesRes, geofencesRes, tripsRes] = await Promise.all([
        api('/dashboard'),
        api('/robots'),
        api('/sites'),
        api('/geofences'),
        api('/trips')
      ]);
      dashboard = dash;
      robots = robotsRes.robots || [];
      sites = sitesRes.sites || [];
      geofences = geofencesRes.geofences || [];
      trips = tripsRes.trips || [];
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  });
</script>

{#if loading}
  <p class="loading">Cargando dashboard...</p>
{:else if error}
  <div class="error">{error}</div>
{:else if dashboard}
  <div class="page-header">
    <div>
      <h1>Dashboard</h1>
      <p class="muted">Rastreo de viajes, robots, almacenes, líneas y geocercas.</p>
    </div>
    <a class="button" href="/trips">Crear viaje</a>
  </div>

  <div class="grid cards">
    <div class="card"><div class="stat">{dashboard.robots.total}</div><div class="muted">Robots</div></div>
    <div class="card"><div class="stat">{dashboard.trips.byStatus?.in_transit || 0}</div><div class="muted">En tránsito</div></div>
    <div class="card"><div class="stat">{dashboard.trips.byStatus?.pending || 0}</div><div class="muted">Pendientes</div></div>
    <div class="card"><div class="stat">{dashboard.sites.warehouse}</div><div class="muted">Almacenes</div></div>
    <div class="card"><div class="stat">{dashboard.sites.line}</div><div class="muted">Líneas</div></div>
    <div class="card"><div class="stat">{dashboard.geofences}</div><div class="muted">Geocercas</div></div>
  </div>

  <div class="card" style="margin-top:16px">
    <h2>Mapa operativo</h2>
    <Map {geofences} {robots} {sites} {trips} />
  </div>

  <div class="grid two" style="margin-top:16px">
    <div class="card">
      <h2>Viajes recientes</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Material</th><th>Estado</th><th>Peso</th><th>Creado</th></tr></thead>
          <tbody>
            {#each trips.slice(0, 8) as trip}
              <tr>
                <td>{trip.material}</td>
                <td><span class="badge {trip.status}">{trip.status}</span></td>
                <td>{trip.weight_kg} kg</td>
                <td>{fmt(trip.created_at)}</td>
              </tr>
            {:else}
              <tr><td colspan="4" class="muted">No hay viajes todavía.</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h2>Robots</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Robot</th><th>Estado</th><th>Carga</th><th>Batería</th></tr></thead>
          <tbody>
            {#each robots.slice(0, 8) as robot}
              <tr>
                <td>{robot.name}<br /><span class="muted">{robot.code}</span></td>
                <td><span class="badge">{robot.status}</span></td>
                <td>{robot.load_kg} kg</td>
                <td>{robot.battery_percent}%</td>
              </tr>
            {:else}
              <tr><td colspan="4" class="muted">No hay robots registrados.</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </div>
{/if}
