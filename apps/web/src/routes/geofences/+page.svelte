<script>
  import { onMount } from 'svelte';
  import { api } from '#lib/api.js';
  import Map from '#lib/components/Map.svelte';
  import GeofenceDrawer from '#lib/components/GeofenceDrawer.svelte';

  let geofences = $state([]);
  let sites = $state([]);
  let form = $state({ name: '', type: 'zone', site_id: '', color: '#2563eb', polygon: '' });
  let loading = $state(true);
  let saving = $state(false);
  let error = $state('');
  let message = $state('');
  let drawerKey = $state(0);

  function siteName(id) {
    return sites.find((site) => site.id === id)?.name || 'Sin sitio';
  }

  async function load() {
    loading = true;
    error = '';
    try {
      const [geofencesRes, sitesRes] = await Promise.all([api('/geofences'), api('/sites')]);
      geofences = geofencesRes.geofences || [];
      sites = sitesRes.sites || [];
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  onMount(load);

  async function createGeofence(event) {
    event.preventDefault();
    saving = true;
    error = '';
    message = '';
    try {
      if (!form.polygon) throw new Error('Dibuja la geocerca en el mapa antes de guardar');
      let polygon;
      try {
        polygon = JSON.parse(form.polygon);
      } catch {
        throw new Error('El polígono debe ser JSON válido');
      }
      await api('/geofences', {
        method: 'POST',
        body: {
          name: form.name,
          type: form.type,
          site_id: form.site_id || null,
          color: form.color,
          polygon
        }
      });
      message = 'Geocerca creada';
      form = { name: '', type: 'zone', site_id: '', color: '#2563eb', polygon: '' };
      drawerKey += 1;
      await load();
    } catch (err) {
      error = err.message;
    } finally {
      saving = false;
    }
  }

  async function toggleActive(geofence) {
    error = '';
    try {
      await api(`/geofences/${geofence.id}`, { method: 'PATCH', body: { active: !geofence.active } });
      await load();
    } catch (err) {
      error = err.message;
    }
  }
</script>

<div class="page-header">
  <div><h1>Geocercas</h1><p class="muted">Polígonos usados para detectar entradas y salidas de robots.</p></div>
</div>

{#if error}<div class="error" style="margin-bottom:12px">{error}</div>{/if}
{#if message}<div class="card" style="margin-bottom:12px;background:#ecfdf5;border-color:#bbf7d0">{message}</div>{/if}

<div class="grid two">
  <div class="card">
    <h2>Nueva geocerca</h2>
    <form onsubmit={createGeofence} class="grid">
      <label>Nombre<input bind:value={form.name} required /></label>
      <label>Tipo
        <select bind:value={form.type}>
          <option value="zone">Zona</option>
          <option value="warehouse">Almacén</option>
          <option value="line">Línea</option>
        </select>
      </label>
      <label>Sitio asociado
        <select bind:value={form.site_id}>
          <option value="">Ninguno</option>
          {#each sites as site}<option value={site.id}>{site.name}</option>{/each}
        </select>
      </label>
      <label>Color<input type="color" bind:value={form.color} /></label>
      <div class="field">
        <span>Dibujo de geocerca</span>
        {#key drawerKey}
          <GeofenceDrawer {geofences} {sites} color={form.color} onchange={(json) => (form.polygon = json)} />
        {/key}
      </div>
      <button disabled={saving}>{saving ? 'Guardando...' : 'Crear geocerca'}</button>
    </form>
  </div>

  <div class="card">
    <h2>Vista previa</h2>
    {#if loading}
      <p class="loading">Cargando...</p>
    {:else}
      <Map {geofences} {sites} robots={[]} trips={[]} />
    {/if}
  </div>
</div>

<div class="card" style="margin-top:16px">
  <h2>Listado</h2>
  {#if loading}
    <p class="loading">Cargando geocercas...</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead><tr><th>Nombre</th><th>Tipo</th><th>Sitio</th><th>Color</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          {#each geofences as geofence}
            <tr>
              <td>{geofence.name}</td>
              <td>{geofence.type}</td>
              <td>{siteName(geofence.site_id)}</td>
              <td><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:{geofence.color}"></span></td>
              <td><span class="badge {geofence.active ? 'completed' : 'cancelled'}">{geofence.active ? 'Activa' : 'Inactiva'}</span></td>
              <td><button class="secondary" onclick={() => toggleActive(geofence)}>{geofence.active ? 'Desactivar' : 'Activar'}</button></td>
            </tr>
          {:else}
            <tr><td colspan="6" class="muted">No hay geocercas.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
