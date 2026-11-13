<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { auth, getToken } from '#lib/api.js';

  let { children } = $props();
  let token = $state(null);
  let profile = $state(null);

  const links = [
    { href: '/', label: 'Dashboard' },
    { href: '/reports', label: 'Reportes' },
    { href: '/trips', label: 'Viajes' },
    { href: '/robots', label: 'Robots' },
    { href: '/sites', label: 'Sitios' },
    { href: '/geofences', label: 'Geocercas' }
  ];

  onMount(async () => {
    token = getToken();
    if (token) {
      try {
        const me = await auth.me();
        profile = me.profile;
      } catch {
        token = null;
        profile = null;
      }
    }
  });

  async function logout() {
    auth.logout();
    token = null;
    profile = null;
    await goto('/login');
  }
</script>

<header class="topnav">
  <a class="brand" href="/">Control de Robots</a>
  <nav>
    {#each links as link}
      <a href={link.href}>{link.label}</a>
    {/each}
  </nav>
  <div class="actions">
    {#if token}
      <span class="muted" style="color:#cbd5e1">{profile?.name || profile?.email || 'Usuario'}</span>
      <button class="secondary" onclick={logout}>Salir</button>
    {:else}
      <a href="/login">Entrar</a>
      <a class="button" href="/signup">Crear cuenta</a>
    {/if}
  </div>
</header>

<main class="container">
  {@render children()}
</main>
