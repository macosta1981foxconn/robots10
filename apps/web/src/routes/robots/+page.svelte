<script>
  import { onMount } from 'svelte';
  import { api } from '#lib/api.js';

  let robots = $state([]);
  let sites = $state([]);
  let form = $state({ name: '', code: '', capacity_kg: '100', battery_percent: '100', status: 'available' });
  let loading = $state(true);
  let saving = $state(false);
  let error = $state('');

  function siteName(id) {
    return sites.find((site) => site.id === id)?.name || '-';
  }

  async function load() {
    loading = true;
    error = '';
    try {
      const [robotsRes, sitesRes] = await Promise.all([api('/robots'), api('/sites')]);
      robots = robotsRes.robots || [];
      sites = sitesRes.sites || [];
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  onMount(load);

  async function createRobot(event) {
    event.preventDefault();
    saving = true;
    error = '';
    try {
      await api('/robots', {
        method: 'POST',
        body: {
          name: form.name,
          code: form.code,
          capacity_kg: Number(form.capacity_kg),
          battery_percent: Number(form.battery_percent),
          status: form.status
        }
      });
      form = { name: '', code: '', capacity_kg: '100', battery_percent: '100', status: 'available' };
      await load();
    } catch (err) {
      error = err.message;
    } finally {
      saving = false;
    }
  }

  async function patchRobot(robot, updates) {
    error = '';
    try {
      await api(`/robots/${robot.id}`, { method: 'PATCH', body: updates });
      await load();
    } catch (err) {
      error = err.message;
    }
  }
</script>

<div class="page-header">
  <div><h1>Robots</h1><p class="muted">Capacidad, batería, estado y carga reservada.</p></div>
</div>

{#if error}<div class="error" style="margin-bottom:12px">{error}</div>{/if}

<div class="card" style="margin-bottom:16px">
  <h2>Registrar robot</h2>
  <form onsubmit={createRobot}>
    <div class="form-grid">
      <label>Nombre<input bind:value={form.name} required /></label>
      <label>Código<input bind:value={form.code} required placeholder="R-001" /></label>
      <label>Capacidad (kg)<input type="number" min="1" bind:value={form.capacity_kg} required /></label>
      <label>Batería (%)<input type="number" min="0" max="100" bind:value={form.battery_percent} required /></label>
      <label>Estado
        <select bind:value={form.status}>
          <option value="available">Disponible</option>
          <option value="busy">Ocupado</option>
          <option value="charging">Cargando</option>
          <option value="offline">Offline</option>
        </select>
      </label>
    </div>
    <div class="actions" style="margin-top:12px"><button disabled={saving}>{saving ? 'Guardando...' : 'Agregar'}</button></div>
  </form>
</div>

<div class="card">
  <h2>Flota</h2>
  {#if loading}
    <p class="loading">Cargando robots...</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead><tr><th>Robot</th><th>Capacidad</th><th>Carga</th><th>Batería</th><th>Estado</th><th>Ubicación</th></tr></thead>
        <tbody>
          {#each robots as robot}
            <tr>
              <td>{robot.name}<br /><span class="muted">{robot.code}</span></td>
              <td>
                <input type="number" min="1" value={robot.capacity_kg} style="width:90px" onchange={(event) => patchRobot(robot, { capacity_kg: Number(event.currentTarget.value) })} />
              </td>
              <td>{robot.load_kg} kg</td>
              <td>
                <input type="number" min="0" max="100" value={robot.battery_percent} style="width:90px" onchange={(event) => patchRobot(robot, { battery_percent: Number(event.currentTarget.value) })} />
              </td>
              <td>
                <select value={robot.status} onchange={(event) => patchRobot(robot, { status: event.currentTarget.value })}>
                  <option value="available">Disponible</option>
                  <option value="busy">Ocupado</option>
                  <option value="charging">Cargando</option>
                  <option value="offline">Offline</option>
                </select>
              </td>
              <td>{siteName(robot.current_site_id)}<br /><span class="muted">{robot.current_lat ?? '-'}, {robot.current_lng ?? '-'}</span></td>
            </tr>
          {:else}
            <tr><td colspan="6" class="muted">No hay robots.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
