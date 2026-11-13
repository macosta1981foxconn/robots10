const express = require('express');
const { admin } = require('../supabase');
const { requireRole } = require('../middleware/auth');
const { validatePolygon } = require('../utils/geo');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await admin
      .from('geofences')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ geofences: data || [] });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireRole('admin', 'dispatcher'), async (req, res, next) => {
  try {
    const { name, type = 'zone', site_id = null, color = '#2563eb', polygon, active = true } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name es requerido' });
    const validPolygon = validatePolygon(polygon);

    const { data, error } = await admin
      .from('geofences')
      .insert({ name, type, site_id, color, polygon: validPolygon, active })
      .select()
      .single();
    if (error) throw error;
    return res.status(201).json({ geofence: data });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', requireRole('admin', 'dispatcher'), async (req, res, next) => {
  try {
    const updates = {};
    for (const key of ['name', 'type', 'site_id', 'color', 'active']) {
      if (req.body?.[key] !== undefined) updates[key] = req.body[key];
    }
    if (req.body?.polygon !== undefined) updates.polygon = validatePolygon(req.body.polygon);
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    const { data, error } = await admin
      .from('geofences')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    return res.json({ geofence: data });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireRole('admin', 'dispatcher'), async (req, res, next) => {
  try {
    const { error } = await admin.from('geofences').delete().eq('id', req.params.id);
    if (error) throw error;
    return res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
