<script>
  import { goto } from '$app/navigation';
  import { auth, setAuthSession } from '#lib/api.js';
  import { signInWithGoogle } from '#lib/supabase.js';

  let name = $state('');
  let email = $state('');
  let password = $state('');
  let role = $state('operator');
  let error = $state('');
  let notice = $state('');
  let loading = $state(false);
  let googleLoading = $state(false);

  async function submit(event) {
    event.preventDefault();
    error = '';
    notice = '';
    loading = true;
    try {
      const data = await auth.signup(email, password, name, role);
      if (data.confirmation_required) {
        notice = data.message || 'Revisa tu correo para confirmar la cuenta';
        return;
      }
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
    notice = '';
    googleLoading = true;
    try {
      await signInWithGoogle();
    } catch (err) {
      error = err.message;
      googleLoading = false;
    }
  }
</script>

<div class="page-header"><div><h1>Crear cuenta</h1><p class="muted">Las contraseñas las gestiona Supabase Auth de forma segura.</p></div></div>
<div class="card" style="max-width:560px">
  {#if error}<div class="error" style="margin-bottom:12px">{error}</div>{/if}
  {#if notice}<div class="card" style="margin-bottom:12px;background:#ecfdf5;border-color:#bbf7d0">{notice}</div>{/if}
  <button type="button" class="secondary" style="width:100%;margin-bottom:12px" onclick={continueWithGoogle} disabled={googleLoading}>
    {googleLoading ? 'Conectando con Google...' : 'Crear cuenta con Google'}
  </button>
  <p class="muted" style="text-align:center;margin:0 0 12px">o registra con email y contraseña</p>
  <form class="grid" onsubmit={submit}>
    <label>Nombre<input bind:value={name} required /></label>
    <label>Email<input type="email" bind:value={email} required /></label>
    <label>Contraseña<input type="password" bind:value={password} required minlength="8" /></label>
    <label>Rol
      <select bind:value={role}>
        <option value="operator">Operador</option>
        <option value="dispatcher">Dispatcher</option>
      </select>
    </label>
    <button disabled={loading}>{loading ? 'Creando...' : 'Crear cuenta'}</button>
  </form>
  <p class="muted" style="margin-top:12px">¿Ya tienes cuenta? <a href="/login">Entrar</a></p>
</div>
