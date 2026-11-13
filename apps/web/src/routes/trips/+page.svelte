<script>
  import { onMount } from 'svelte';
  import { api } from '#lib/api.js';

  let trips = $state([]);
  let sites = $state([]);
  let robots = $state([]);
  let assignmentChoices = $state({});
  let form = $state({
    origin_site_id: '',
    destination_site_id: '',
    material: '',
    weight_kg: '',
    priority: '0',
    robot_id: ''
  });
  let loading = $state(true);
  let saving = $state(false);
  let error = $state('');
  let message = $state('');

  let warehouses = $derived(sites.filter((site) => site.type === 'warehouse' && site.active !== false));
  let lines = $derived(sites.filter((site) => site.type === 'line' && site.active !== false));

  function siteName(id) {
    return sites.find((site) => site.id === id)?.name || '-';
  }

  function robotName(id) {
    if (!id) return 'Sin asignar';
    return robots.find((robot) => robot.id === id)?.name || 'Robot';
  }

  function fmt(date) {
    return date ? new Date(date).toLocaleString('es') : '-';
  }

  async function load() {
    loading = true;
    error = '';
    try {
      const [tripsRes, sitesRes, robotsRes] = await Promise.all([
        api('/trips'),
        api('/sites'),
        api('/robots')
      ]);
      trips = tripsRes.trips || [];
      sites = sitesRes.sites || [];
      robots = robotsRes.robots || [];
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  onMount(load);

  async function createTrip(event) {
    event.preventDefault();
    error = '';
    message = '';
    saving = true;
    try {
      await api('/trips', {
        method: 'POST',
        body: {
          origin_site_id: form.origin_site_id,
          destination_site_id: form.destination_site_id,
          material: form.material,
          weight_kg: Number(form.weight_kg),
          priority: Number(form.priority) || 0,
          robot_id: form.robot_id || null
        }
      });
      message = 'Viaje creado';
      form = { ...form, material: '', weight_kg: '', priority: '0', robot_id: '' };
      await load();
    } catch (err) {
      error = err.message;
    } finally {
      saving = false;
    }
  }

  async function runAction(trip, action) {
    error = '';
    message = '';
    try {
      await api(`/trips/${trip.id}/${action}`, { method: 'POST' });
      await load();
    } catch (err) {
      error = err.message;
    }
  }

  async function autoAssign(trip) {
    error = '';
    message = '';
    try {
      await api(`/trips/${trip.id}/auto-assign`, { method: 'POST' });
      message = 'Robot asignado automáticamente';
      await load();
    } catch (err) {
      error = err.message;
    }
  }

  async function assign(trip) {
    const robotId = assignmentChoices[trip.id];
    if (!robotId) {
      error = 'Selecciona un robot para asignar';
      return;
    }
    error = '';
    message = '';
    try {
      await api(`/trips/${trip.id}/assign`, { method: 'POST', body: { robot_id: robotId } });
      delete assignmentChoices[trip.id];
      message = 'Robot asignado';
      await load();
    } catch (err) {
      error = err.message;
    }
  }

  async function runBalancing() {
    error = '';
    message = '';
    try {
      const result = await api('/load-balancing/run', { method: 'POST', body: { limit: 20 } });
      const assigned = result.results?.filter((item) => item.assigned).length || 0;
      message = `Balanceo ejecutado: ${assigned}/${result.processed} viajes asignados`;
      await load();
    } catch (err) {
      error = err.message;
    }
  }
</script>

<div class="page-header">
  <div>
    <h1>Viajes</h1>
    <p class="muted">Crea viajes de almacén a línea y controla su estado.</p>
  </div>
  <button onclick={runBalancing}>Ejecutar balanceo</button>
</div>

{#if error}<div class="error" style="margin-bottom:12px">{error}</div>{/if}
{#if message}<div class="card" style="margin-bottom:12px;background:#ecfdf5;border-color:#bbf7d0">{message}</div>{/if}

<div class="card" style="margin-bottom:16px">
  <h2>Nuevo viaje</h2>
  <form onsubmit={createTrip}>
    <div class="form-grid">
      <label>Almacén
        <select bind:value={form.origin_site_id} required>
          <option value="" disabled>Selecciona...</option>
          {#each warehouses as site}<option value={site.id}>{site.name}</option>{/each}
        </select>
      </label>
      <label>Línea de producción
        <select bind:value={form.destination_site_id} required>
          <option value="" disabled>Selecciona...</option>
          {#each lines as site}<option value={site.id}>{site.name}</option>{/each}
        </select>
      </label>
      <label>Material<input bind:value={form.material} required placeholder="Tornillos M8" /></label>
      <label>Peso (kg)<input type="number" min="0.1" step="0.1" bind:value={form.weight_kg} required /></label>
      <label>Prioridad<input type="number" bind:value={form.priority} /></label>
      <label>Robot (opcional)
        <select bind:value={form.robot_id}>
          <option value="">Automático / pendiente</option>
          {#each robots as robot}<option value={robot.id}>{robot.name}</option>{/each}
        </select>
      </label>
    </div>
    <div class="actions" style="margin-top:12px">
      <button disabled={saving}>{saving ? 'Guardando...' : 'Crear viaje'}</button>
    </div>
  </form>
</div>

<div class="card">
  <h2>Listado</h2>
  {#if loading}
    <p class="loading">Cargando viajes...</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Material</th><th>Ruta</th><th>Robot</th><th>Peso</th><th>Estado</th><th>Creado</th><th>Acciones</th></tr>
        </thead>
        <tbody>
          {#each trips as trip}
            <tr>
              <td>{trip.material}<br /><span class="muted">Prioridad {trip.priority}</span></td>
              <td>{siteName(trip.origin_site_id)} → {siteName(trip.destination_site_id)}</td>
              <td>{robotName(trip.robot_id)}</td>
              <td>{trip.weight_kg} kg</td>
              <td><span class="badge {trip.status}">{trip.status}</span></td>
              <td>{fmt(trip.created_at)}</td>
              <td>
                <div class="actions">
                  {#if trip.status === 'pending'}
                    <select style="width:auto;min-width:130px" value={assignmentChoices[trip.id] || ''} onchange={(event) => (assignmentChoices[trip.id] = event.currentTarget.value)}>
                      <option value="">Robot...</option>
                      {#each robots as robot}<option value={robot.id}>{robot.name}</option>{/each}
                    </select>
                    <button class="secondary" onclick={() => assign(trip)}>Asignar</button>
                    <button onclick={() => autoAssign(trip)}>Auto</button>
                    <button class="danger" onclick={() => runAction(trip, 'cancel')}>Cancelar</button>
                  {:else if trip.status === 'assigned'}
                    <button onclick={() => runAction(trip, 'start')}>Iniciar</button>
                    <button class="danger" onclick={() => runAction(trip, 'cancel')}>Cancelar</button>
                  {:else if trip.status === 'in_transit'}
                    <button onclick={() => runAction(trip, 'arrive')}>Llegada</button>
                    <button onclick={() => runAction(trip, 'complete')}>Completar</button>
                    <button class="danger" onclick={() => runAction(trip, 'cancel')}>Cancelar</button>
                  {:else if trip.status === 'arrived'}
                    <button onclick={() => runAction(trip, 'complete')}>Completar</button>
                    <button class="danger" onclick={() => runAction(trip, 'cancel')}>Cancelar</button>
                  {/if}
                </div>
              </td>
            </tr>
          {:else}
            <tr><td colspan="7" class="muted">No hay viajes.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
