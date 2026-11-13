<script>
  import { onMount } from 'svelte';
  import { api } from '#lib/api.js';

  let report = $state(null);
  let sites = $state([]);
  let robots = $state([]);
  let robotFilter = $state('');
  let lineFilter = $state('');
  let loading = $state(false);
  let error = $state('');

  const categories = [
    { key: 'en_viaje', label: 'En viaje', color: '#10b981' },
    { key: 'esperando_viaje', label: 'Esperando viaje', color: '#f59e0b' },
    { key: 'cargando_bateria', label: 'Cargando batería', color: '#0ea5e9' },
    { key: 'descompuesto', label: 'Descompuesto', color: '#ef4444' }
  ];

  const tripStatus = {
    pending: 'Pendiente',
    assigned: 'Asignado',
    in_transit: 'En tránsito',
    arrived: 'Llegó',
    completed: 'Completado',
    cancelled: 'Cancelado'
  };

  const robotStatus = {
    available: 'Disponible',
    busy: 'Ocupado',
    charging: 'Cargando',
    offline: 'Fuera de línea'
  };

  const siteById = $derived(new Map(sites.map((site) => [site.id, site])));
  const robotById = $derived(new Map(robots.map((robot) => [robot.id, robot])));
  const lines = $derived(sites.filter((site) => site.type === 'line'));
  const grouped = $derived(report?.robots_by_status || {});
  const durationRows = $derived(
    Object.entries(report?.status_durations?.byRobot || {})
      .map(([robotId, durations]) => ({ robotId, robot: robotById.get(robotId), ...durations }))
      .sort((a, b) => (a.robot?.name || a.robotId).localeCompare(b.robot?.name || b.robotId))
  );

  function fmtDuration(ms) {
    if (!ms || ms <= 0) return '0m';
    const totalMin = Math.floor(ms / 60000);
    if (totalMin < 60) return `${totalMin}m`;
    const hours = Math.floor(totalMin / 60);
    const minutes = totalMin % 60;
    if (hours < 24) return `${hours}h ${minutes}m`;
    const days = Math.floor(hours / 24);
    const restHours = hours % 24;
    return `${days}d ${restHours}h`;
  }

  function fmtDate(value) {
    if (!value) return '—';
    return new Date(value).toLocaleString('es-NI', { dateStyle: 'short', timeStyle: 'short' });
  }

  async function loadReport() {
    loading = true;
    error = '';
    try {
      const params = new URLSearchParams();
      if (robotFilter) params.set('robot_id', robotFilter);
      if (lineFilter) params.set('line_id', lineFilter);
      report = await api(`/reports/overview${params.size ? `?${params}` : ''}`);
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    const [sitesRes, robotsRes] = await Promise.all([api('/sites'), api('/robots')]);
    sites = sitesRes.sites || [];
    robots = robotsRes.robots || [];
  });

  $effect(() => {
    void loadReport();
  });
</script>

<svelte:head>
  <title>Reportes | Control de Robots</title>
</svelte:head>

<h1>Reportes</h1>
<p class="muted">Agrupa robots por estado operativo, revisa historial de viajes y tiempos por estado.</p>

<section class="card" style="margin-bottom:18px">
  <div class="toolbar">
    <label>
      Robot
      <select bind:value={robotFilter}>
        <option value="">Todos</option>
        {#each robots as robot}
          <option value={robot.id}>{robot.name} ({robot.code})</option>
        {/each}
      </select>
    </label>
    <label>
      Línea de producción
      <select bind:value={lineFilter}>
        <option value="">Todas</option>
        {#each lines as line}
          <option value={line.id}>{line.name}</option>
        {/each}
      </select>
    </label>
    <button onclick={loadReport}>Actualizar</button>
  </div>
  {#if loading}<p class="muted">Cargando reporte...</p>{/if}
  {#if error}<p class="error">{error}</p>{/if}
</section>

{#if report}
  <section class="card" style="margin-bottom:18px">
    <h2>Robots por estado</h2>
    <div class="report-grid">
      {#each categories as category}
        <article class="report-group">
          <header style="border-top:4px solid {category.color}">
            <strong>{category.label}</strong>
            <span class="badge">{grouped[category.key]?.length || 0}</span>
          </header>
          <div class="report-list">
            {#each grouped[category.key] || [] as robot}
              <div class="report-robot">
                <strong>{robot.name}</strong>
                <span class="muted">{robot.code} · {robotStatus[robot.status] || robot.status} · batería {robot.battery_percent}%</span>
                {#if robot.active_trips}<span class="muted">Viajes activos: {robot.active_trips}</span>{/if}
              </div>
            {:else}
              <p class="muted">Sin robots en este estado.</p>
            {/each}
          </div>
        </article>
      {/each}
    </div>
  </section>

  <section class="card" style="margin-bottom:18px">
    <h2>Histórico de viajes</h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Fecha</th><th>Robot</th><th>Origen</th><th>Destino</th><th>Material</th><th>Peso</th><th>Estado</th></tr>
        </thead>
        <tbody>
          {#each report.trip_history || [] as trip}
            <tr>
              <td>{fmtDate(trip.created_at)}</td>
              <td>{trip.robot_id ? robotById.get(trip.robot_id)?.name || 'Sin asignar' : 'Sin asignar'}</td>
              <td>{siteById.get(trip.origin_site_id)?.name || '—'}</td>
              <td>{siteById.get(trip.destination_site_id)?.name || '—'}</td>
              <td>{trip.material}</td>
              <td>{trip.weight_kg} kg</td>
              <td><span class="badge">{tripStatus[trip.status] || trip.status}</span></td>
            </tr>
          {:else}
            <tr><td colspan="7" class="muted">No hay viajes para los filtros seleccionados.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <section class="card">
    <h2>Tiempo por estado</h2>
    {#if report.status_durations && !report.status_durations.available}
      <p class="muted">Estimado desde viajes y estados actuales. Para histórico exacto, corre <code>supabase/schema.sql</code> y <code>npm run db:seed</code>.</p>
    {/if}
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Robot</th><th>En viaje</th><th>Esperando viaje</th><th>Cargando batería</th><th>Descompuesto</th><th>Total</th><th>Último estado</th></tr>
        </thead>
        <tbody>
          {#each durationRows as row}
            <tr>
              <td><strong>{row.robot?.name || row.robotId}</strong><br /><span class="muted">{row.robot?.code || ''}</span></td>
              <td>{fmtDuration(row.en_viaje)}</td>
              <td>{fmtDuration(row.esperando_viaje)}</td>
              <td>{fmtDuration(row.cargando_bateria)}</td>
              <td>{fmtDuration(row.descompuesto)}</td>
              <td>{fmtDuration(row.total)}</td>
              <td><span class="badge">{row.last_status || '—'}</span></td>
            </tr>
          {:else}
            <tr><td colspan="7" class="muted">No hay datos de duración.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
{/if}

<style>
  .toolbar {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    align-items: end;
  }
  .toolbar label {
    display: grid;
    gap: 6px;
    font-size: 0.9rem;
  }
  .report-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 14px;
  }
  .report-group {
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    overflow: hidden;
  }
  .report-group header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 14px;
    background: #f8fafc;
  }
  .report-list {
    display: grid;
    gap: 10px;
    padding: 12px 14px;
  }
  .report-robot {
    display: grid;
    gap: 3px;
    padding-bottom: 10px;
    border-bottom: 1px solid #f1f5f9;
  }
  .report-robot:last-child {
    border-bottom: 0;
    padding-bottom: 0;
  }
</style>
