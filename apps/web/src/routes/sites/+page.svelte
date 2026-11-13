<script>
  import { onMount } from 'svelte';
  import { api } from '#lib/api.js';

  let sites = $state([]);
  let form = $state({ type: 'warehouse', name: '', address: '', lat: '', lng: '', polygon: '' });
  let loading = $state(true);
  let saving = $state(false);
  let error = $state('');
  let message = $state('');

  async function load() {
    loading = true;
    error = '';
    try {
      const res = await api('/sites');
      sites = res.sites || [];
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  onMount(load);

  async function createSite(event) {
    event.preventDefault();
    saving = true;
    error = '';
    message = '';
    try {
      const body = {
        type: form.type,
        name: form.name,
        address: form.address || null,
        lat: form.lat === '' ? null : Number(form.lat),
        lng: form.lng === '' ? null : Number(form.lng)
      };
      if (form.polygon.trim()) {
        try {
          body.polygon = JSON.parse(form.polygon);
        } catch {
          throw new Error('El polígono debe ser JSON válido');
        }
      }
      await api('/sites', { method: 'POST', body });
      message = 'Sitio creado';
      form = { type: form.type, name: '', address: '', lat: '', lng: '', polygon: '' };
      await load();
    } catch (err) {
      error = err.message;
    } finally {
      saving = false;
    }
  }

  async function deactivate(site) {
    error = '';
    try {
      await api(`/sites/${site.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      error = err.message;
    }
  }

  function label(type) {
    return type === 'warehouse' ? 'Almacén' : 'Línea';
  }
</script>

<div class="page-header">
  <div><h1>Sitios</h1><p class="muted">Almacenes y líneas de producción. Si agregas polígono se crea su geocerca.</p></div>
</div>

{#if error}<div class="error" style="margin-bottom:12px">{error}</div>{/if}
{#if message}<div class="card" style="margin-bottom:12px;background:#ecfdf5;border-color:#bbf7d0">{message}</div>{/if}

<div class="card" style="margin-bottom:16px">
  <h2>Nuevo sitio</h2>
  <form onsubmit={createSite}>
    <div class="form-grid">
      <label>Tipo
        <select bind:value={form.type}>
          <option value="warehouse">Almacén</option>
          <option value="line">Línea de producción</option>
        </select>
      </label>
      <label>Nombre<input bind:value={form.name} required /></label>
      <label>Dirección<input bind:value={form.address} /></label>
      <label>Lat<input type="number" step="any" bind:value={form.lat} /></label>
      <label>Lng<input type="number" step="any" bind:value={form.lng} /></label>
    </div>
    <label style="margin-top:12px">Polígono GeoJSON (opcional)
      <textarea bind:value={form.polygon} placeholder='[[[-86.2700,12.1300],[-86.2600,12.1300],[-86.2600,12.1400],[-86.2700,12.1400]]]'></textarea>
    </label>
    <div class="actions" style="margin-top:12px"><button disabled={saving}>{saving ? 'Guardando...' : 'Crear sitio'}</button></div>
  </form>
</div>

{#if loading}
  <p class="loading">Cargando sitios...</p>
{:else}
  {#each ['warehouse', 'line'] as type}
    <div class="card" style="margin-bottom:16px">
      <h2>{label(type)}s</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Dirección</th><th>Coordenadas</th><th>Geocerca</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {#each sites.filter((site) => site.type === type) as site}
              <tr>
                <td>{site.name}</td>
                <td>{site.address || '-'}</td>
                <td>{site.lat ?? '-'}, {site.lng ?? '-'}</td>
                <td>{site.geofence_id ? 'Sí' : 'No'}</td>
                <td><span class="badge {site.active ? 'completed' : 'cancelled'}">{site.active ? 'Activo' : 'Inactivo'}</span></td>
                <td>{#if site.active}<button class="secondary" onclick={() => deactivate(site)}>Desactivar</button>{/if}</td>
              </tr>
            {:else}
              <tr><td colspan="6" class="muted">No hay {label(type).toLowerCase()}s.</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/each}
{/if}
