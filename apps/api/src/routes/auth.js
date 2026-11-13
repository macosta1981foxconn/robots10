const express = require('express');
const { publicClient, admin } = require('../supabase');
const { requireAuth } = require('../middleware/auth');
const config = require('../config');

const router = express.Router();

router.get('/config', (req, res) => {
  res.json({
    supabase_url: config.supabaseUrl,
    supabase_anon_key: config.supabaseAnonKey
  });
});

async function ensureProfile(user) {
  const name = user.user_metadata?.name || user.email?.split('@')[0] || 'Usuario';
  const role = ['operator', 'dispatcher'].includes(user.user_metadata?.role)
    ? user.user_metadata.role
    : 'operator';

  const { data: existing, error: existingError } = await admin
    .from('profiles')
    .select('id, role, name, email')
    .eq('id', user.id)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    if (existing.name !== name || existing.email !== user.email) {
      const { error } = await admin
        .from('profiles')
        .update({ email: user.email, name, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (error) throw error;
    }
    return;
  }

  const { error } = await admin.from('profiles').insert({
    id: user.id,
    email: user.email,
    name,
    role
  });
  if (error) throw error;
}

router.post('/signup', async (req, res, next) => {
  try {
    const { email, password, name, role } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email y password son requeridos' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const safeRole = ['operator', 'dispatcher'].includes(role) ? role : 'operator';
    const { data, error } = await publicClient.auth.signUp({
      email,
      password,
      options: {
        data: { name: name || email.split('@')[0], role: safeRole }
      }
    });

    if (error) return res.status(400).json({ error: error.message });
    if (data.user) await ensureProfile(data.user);

    if (!data.session) {
      return res.status(201).json({
        user: data.user,
        confirmation_required: true,
        message: 'Revisa tu correo para confirmar la cuenta'
      });
    }

    return res.status(201).json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      token_type: data.session.token_type,
      user: data.user
    });
  } catch (error) {
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email y password son requeridos' });
    }

    const { data, error } = await publicClient.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: error.message });
    if (data.user) await ensureProfile(data.user);

    return res.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      token_type: data.session.token_type,
      user: data.user
    });
  } catch (error) {
    next(error);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    return res.json({ user: req.user, profile: req.profile });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
