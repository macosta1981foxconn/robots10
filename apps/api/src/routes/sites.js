const express = require('express');
const { admin } = require('../supabase');
const { requireRole } = require('../middleware/auth');
const { validatePolygon } = require('../utils/geo');

const router = express.Router();

function validateSiteBody(body) {
  const type = body?.type;
  if (!['warehouse', 'line'].includes(type)) {
    throw new Error("type debe ser 'warehouse' o 'line'");
  }
  if (!body?.name) throw new Error('name es requerido');
}

router.get('/', async (req, res, next) => {
  try {
    let query = admin.from('sites').select('*').order('type').order('name');
    if (req.query.type) query = query.eq('type', req.query.type);
    const { data, error } = await query;
    if (error) throw error;
    return res.json({ sites: data || [] });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireRole('admin', 'dispatcher'), async (req, res, next) => {
  try {
    validateSiteBody(req.body);
    const { type, name, address = null, lat = null, lng = null, polygon = null, color = '#16a34a' } = req.body;

    const { data: site, error } = await admin
      .from('sites')
      .insert({ type, name, address, lat, lng, active: true })
      .select()
      .single();
    if (error) throw error;

    if (polygon) {
      const validPolygon = validatePolygon(polygon);
      const { data: geofence, error: geofenceError } = await admin
        .from('geofences')
        .insert({
          name: `${name} geocerca`,
          type,
          site_id: site.id,
          color,
          polygon: validPolygon,
          active: true
        })
        .select()
        .single();
      if (geofenceError) throw geofenceError;

      const { data: updated, error: updateError } = await admin
        .from('sites')
        .update({ geofence_id: geofence.id })
        .eq('id', site.id)
        .select()
        .single();
      if (updateError) throw updateError;
      return res.status(201).json({ site: updated, geofence });
    }

    return res.status(201).json({ site });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', requireRole('admin', 'dispatcher'), async (req, res, next) => {
  try {
    const updates = {};
    for (const key of ['name', 'address', 'lat', 'lng', 'active']) {
      if (req.body?.[key] !== undefined) updates[key] = req.body[key];
    }
    if (req.body?.type !== undefined) {
      if (!['warehouse', 'line'].includes(req.body.type)) {
        return res.status(400).json({ error: "type debe ser 'warehouse' o 'line'" });
      }
      updates.type = req.body.type;
    }
    if (Object.keys(updates).length === 0 && req.body?.polygon === undefined) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    let siteQuery = admin.from('sites').select('*').eq('id', req.params.id).single();
    const { data: existing, error: existingError } = await siteQuery;
    if (existingError) throw existingError;

    let site = existing;
    if (Object.keys(updates).length > 0) {
      const { data, error } = await admin
        .from('sites')
        .update(updates)
        .eq('id', req.params.id)
        .select()
        .single();
      if (error) throw error;
      site = data;
    }

    if (req.body?.polygon !== undefined) {
      const validPolygon = validatePolygon(req.body.polygon);
      const payload = {
        name: `${site.name} geocerca`,
        type: site.type,
        site_id: site.id,
        polygon: validPolygon,
        active: true
      };
      if (req.body?.color) payload.color = req.body.color;

      if (site.geofence_id) {
        const { data: geofence, error } = await admin
          .from('geofences')
          .update(payload)
          .eq('id', site.geofence_id)
          .select()
          .single();
        if (error) throw error;
        return res.json({ site, geofence });
      }

      const { data: geofence, error } = await admin
        .from('geofences')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      const { data: updated, error: updateError } = await admin
        .from('sites')
        .update({ geofence_id: geofence.id })
        .eq('id', site.id)
        .select()
        .single();
      if (updateError) throw updateError;
      return res.json({ site: updated, geofence });
    }

    return res.json({ site });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireRole('admin', 'dispatcher'), async (req, res, next) => {
  try {
    const { data: site, error } = await admin
      .from('sites')
      .update({ active: false })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    if (site.geofence_id) {
      await admin.from('geofences').update({ active: false }).eq('id', site.geofence_id);
    }
    return res.json({ site });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
