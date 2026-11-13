const express = require('express');
const { admin } = require('../supabase');
const { requireRole } = require('../middleware/auth');
const {
  assignTripToRobot,
  chooseRobot,
  recomputeRobotLoad
} = require('../services/loadBalancer');
const { syncRobotCategory } = require('../services/statusEvents');

const router = express.Router();

async function getTripOr404(id) {
  const { data, error } = await admin.from('trips').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function getSite(id) {
  if (!id) return null;
  const { data, error } = await admin.from('sites').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

router.get('/', async (req, res, next) => {
  try {
    let query = admin.from('trips').select('*').order('created_at', { ascending: false }).limit(300);
    if (req.query.status) query = query.eq('status', req.query.status);
    if (req.query.robot_id) query = query.eq('robot_id', req.query.robot_id);
    if (req.query.destination_site_id) query = query.eq('destination_site_id', req.query.destination_site_id);
    if (req.query.origin_site_id) query = query.eq('origin_site_id', req.query.origin_site_id);

    const { data, error } = await query;
    if (error) throw error;
    return res.json({ trips: data || [] });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const trip = await getTripOr404(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Viaje no encontrado' });

    const [{ data: locations }, { data: assignments }] = await Promise.all([
      admin.from('location_updates').select('*').eq('trip_id', trip.id).order('recorded_at', { ascending: false }).limit(500),
      admin.from('load_assignments').select('*').eq('trip_id', trip.id).order('created_at', { ascending: false })
    ]);

    return res.json({ trip, locations: locations || [], assignments: assignments || [] });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireRole('admin', 'dispatcher'), async (req, res, next) => {
  try {
    const {
      origin_site_id,
      destination_site_id,
      material,
      weight_kg,
      priority = 0,
      robot_id = null
    } = req.body || {};

    if (!origin_site_id || !destination_site_id) {
      return res.status(400).json({ error: 'origin_site_id y destination_site_id son requeridos' });
    }
    if (!material) return res.status(400).json({ error: 'material es requerido' });
    const weight = Number(weight_kg);
    if (!Number.isFinite(weight) || weight <= 0) {
      return res.status(400).json({ error: 'weight_kg debe ser mayor a 0' });
    }

    const [originSite, destinationSite] = await Promise.all([
      getSite(origin_site_id),
      getSite(destination_site_id)
    ]);
    if (!originSite || originSite.type !== 'warehouse') {
      return res.status(400).json({ error: 'origin_site_id debe ser un almacén' });
    }
    if (!destinationSite || destinationSite.type !== 'line') {
      return res.status(400).json({ error: 'destination_site_id debe ser una línea de producción' });
    }

    const { data: trip, error } = await admin
      .from('trips')
      .insert({
        origin_site_id,
        destination_site_id,
        material,
        weight_kg: weight,
        priority: Number(priority) || 0,
        status: 'pending',
        created_by: req.user.id
      })
      .select()
      .single();
    if (error) throw error;

    if (robot_id) {
      const assigned = await assignTripToRobot(admin, trip.id, robot_id, { automatic: false });
      return res.status(201).json({ trip: assigned.trip, assignment: assigned });
    }

    return res.status(201).json({ trip });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/assign', requireRole('admin', 'dispatcher'), async (req, res, next) => {
  try {
    const robotId = req.body?.robot_id;
    if (!robotId) return res.status(400).json({ error: 'robot_id es requerido' });
    const assigned = await assignTripToRobot(admin, req.params.id, robotId, { automatic: false });
    return res.json({ trip: assigned.trip, assignment: assigned });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/auto-assign', requireRole('admin', 'dispatcher'), async (req, res, next) => {
  try {
    const choice = await chooseRobot(admin, req.params.id);
    if (!choice.best) {
      return res.status(409).json({ error: 'No hay robots elegibles para este viaje' });
    }
    const assigned = await assignTripToRobot(admin, req.params.id, choice.best.robot.id, {
      automatic: true
    });
    return res.json({ trip: assigned.trip, assignment: assigned, score: choice.best.score });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/start', requireRole('admin', 'dispatcher', 'operator'), async (req, res, next) => {
  try {
    const trip = await getTripOr404(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Viaje no encontrado' });
    if (trip.status !== 'assigned') {
      return res.status(400).json({ error: 'Solo se puede iniciar un viaje asignado' });
    }

    const originSite = await getSite(trip.origin_site_id);
    const now = new Date().toISOString();
    const { data: updatedTrip, error } = await admin
      .from('trips')
      .update({ status: 'in_transit', started_at: now, updated_at: now })
      .eq('id', trip.id)
      .select()
      .single();
    if (error) throw error;

    if (trip.robot_id) {
      await admin
        .from('robots')
        .update({
          status: 'busy',
          current_site_id: trip.origin_site_id,
          current_lat: originSite?.lat ?? null,
          current_lng: originSite?.lng ?? null,
          updated_at: now
        })
        .eq('id', trip.robot_id);
      await recomputeRobotLoad(admin, trip.robot_id);
      await syncRobotCategory(admin, trip.robot_id, 'trip_started');
    }

    return res.json({ trip: updatedTrip });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/arrive', requireRole('admin', 'dispatcher', 'operator'), async (req, res, next) => {
  try {
    const trip = await getTripOr404(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Viaje no encontrado' });
    if (trip.status !== 'in_transit') {
      return res.status(400).json({ error: 'Solo se puede marcar llegada de un viaje en tránsito' });
    }

    const destinationSite = await getSite(trip.destination_site_id);
    const now = new Date().toISOString();
    const { data: updatedTrip, error } = await admin
      .from('trips')
      .update({ status: 'arrived', arrived_at: now, updated_at: now })
      .eq('id', trip.id)
      .select()
      .single();
    if (error) throw error;

    if (trip.robot_id) {
      await admin
        .from('robots')
        .update({
          current_site_id: trip.destination_site_id,
          current_lat: destinationSite?.lat ?? null,
          current_lng: destinationSite?.lng ?? null,
          updated_at: now
        })
        .eq('id', trip.robot_id);
      await syncRobotCategory(admin, trip.robot_id, 'trip_arrived');
    }

    return res.json({ trip: updatedTrip });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/complete', requireRole('admin', 'dispatcher', 'operator'), async (req, res, next) => {
  try {
    const trip = await getTripOr404(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Viaje no encontrado' });
    if (['completed', 'cancelled'].includes(trip.status)) {
      return res.status(400).json({ error: `El viaje ya está ${trip.status}` });
    }

    const destinationSite = await getSite(trip.destination_site_id);
    const now = new Date().toISOString();
    const { data: updatedTrip, error } = await admin
      .from('trips')
      .update({ status: 'completed', completed_at: now, updated_at: now })
      .eq('id', trip.id)
      .select()
      .single();
    if (error) throw error;

    if (trip.robot_id) {
      await admin
        .from('robots')
        .update({
          current_site_id: trip.destination_site_id,
          current_lat: destinationSite?.lat ?? null,
          current_lng: destinationSite?.lng ?? null,
          updated_at: now
        })
        .eq('id', trip.robot_id);
      await recomputeRobotLoad(admin, trip.robot_id);
      await syncRobotCategory(admin, trip.robot_id, 'trip_completed');
    }

    return res.json({ trip: updatedTrip });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/cancel', requireRole('admin', 'dispatcher'), async (req, res, next) => {
  try {
    const trip = await getTripOr404(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Viaje no encontrado' });
    if (['completed', 'cancelled'].includes(trip.status)) {
      return res.status(400).json({ error: `El viaje ya está ${trip.status}` });
    }

    const now = new Date().toISOString();
    const { data: updatedTrip, error } = await admin
      .from('trips')
      .update({ status: 'cancelled', cancelled_at: now, updated_at: now })
      .eq('id', trip.id)
      .select()
      .single();
    if (error) throw error;

    if (trip.robot_id) {
      await recomputeRobotLoad(admin, trip.robot_id);
      await syncRobotCategory(admin, trip.robot_id, 'trip_cancelled');
    }
    return res.json({ trip: updatedTrip });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
