<script>
  import { goto } from '$app/navigation';
  import { auth, setAuthSession } from '#lib/api.js';
  import { signInWithGoogle } from '#lib/supabase.js';

  let email = $state('');
  let password = $state('');
  let error = $state('');
  let loading = $state(false);
  let googleLoading = $state(false);

  async function submit(event) {
    event.preventDefault();
    error = '';
    loading = true;
    try {
      const data = await auth.login(email, password);
      setAuthSession(data);
      await goto('/');
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function continueWithGoogle() {
    error = '';
    googleLoading = true;
    try {
      await signInWithGoogle();
    } catch (err) {
      error = err.message;
      googleLoading = false;
    }
  }
</script>

<div class="page-header"><div><h1>Entrar</h1><p class="muted">Acceso al panel de control.</p></div></div>
<div class="card" style="max-width:520px">
  {#if error}<div class="error" style="margin-bottom:12px">{error}</div>{/if}
  <button type="button" class="secondary" style="width:100%;margin-bottom:12px" onclick={continueWithGoogle} disabled={googleLoading}>
    {googleLoading ? 'Conectando con Google...' : 'Continuar con Google'}
  </button>
  <p class="muted" style="text-align:center;margin:0 0 12px">o usa email y contraseña</p>
  <form class="grid" onsubmit={submit}>
    <label>Email<input type="email" bind:value={email} required /></label>
    <label>Contraseña<input type="password" bind:value={password} required minlength="8" /></label>
    <button disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button>
  </form>
  <p class="muted" style="margin-top:12px">¿No tienes cuenta? <a href="/signup">Crear cuenta</a></p>
</div>
