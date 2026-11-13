const express = require('express');
const { admin } = require('../supabase');
const { requireRole } = require('../middleware/auth');
const { syncRobotCategory } = require('../services/statusEvents');

const router = express.Router();

const EDITABLE = ['name', 'code', 'capacity_kg', 'battery_percent', 'status', 'current_lat', 'current_lng', 'current_site_id'];

router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await admin
      .from('robots')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ robots: data || [] });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireRole('admin', 'dispatcher'), async (req, res, next) => {
  try {
    const { name, code, capacity_kg = 100, battery_percent = 100, status = 'available' } = req.body || {};
    if (!name || !code) return res.status(400).json({ error: 'name y code son requeridos' });
    if (!['available', 'busy', 'charging', 'offline'].includes(status)) {
      return res.status(400).json({ error: 'status inválido' });
    }

    const { data, error } = await admin
      .from('robots')
      .insert({ name, code, capacity_kg, battery_percent, status })
      .select()
      .single();
    if (error) throw error;
    await syncRobotCategory(admin, data.id, 'robot_created');
    return res.status(201).json({ robot: data });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', requireRole('admin', 'dispatcher'), async (req, res, next) => {
  try {
    const updates = {};
    for (const key of EDITABLE) {
      if (req.body?.[key] !== undefined) updates[key] = req.body[key];
    }
    if (updates.status && !['available', 'busy', 'charging', 'offline'].includes(updates.status)) {
      return res.status(400).json({ error: 'status inválido' });
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await admin
      .from('robots')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    await syncRobotCategory(admin, data.id, 'robot_updated');
    return res.json({ robot: data });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
