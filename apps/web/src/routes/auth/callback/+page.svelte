<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getSupabase } from '#lib/supabase.js';
  import { setToken } from '#lib/api.js';

  let loading = $state(true);
  let error = $state('');

  onMount(async () => {
    try {
      const supabase = await getSupabase();
      const { data, error: authError } = await supabase.auth.getSession();
      if (authError) throw authError;
      if (data.session?.access_token) {
        setToken(data.session.access_token);
        await goto('/');
        return;
      }
      error = 'No se encontró una sesión de Google. Intenta iniciar sesión de nuevo.';
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  });
</script>

<div class="page-header"><div><h1>Google</h1><p class="muted">Completando autenticación...</p></div></div>
<div class="card" style="max-width:520px">
  {#if loading}
    <p class="loading">Validando sesión...</p>
  {:else if error}
    <div class="error">{error}</div>
    <p style="margin-top:12px"><a class="button" href="/login">Volver a entrar</a></p>
  {/if}
</div>
