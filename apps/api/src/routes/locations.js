const express = require('express');
const { admin } = require('../supabase');
const { pointInPolygon } = require('../utils/geo');

const router = express.Router();

async function findGeofenceForPoint(lat, lng) {
  const { data: geofences, error } = await admin
    .from('geofences')
    .select('*')
    .eq('active', true);
  if (error) throw error;

  for (const geofence of geofences || []) {
    try {
      if (pointInPolygon(lng, lat, geofence.polygon)) return geofence;
    } catch {
      // Ignora polígonos malformados y sigue evaluando el resto.
    }
  }
  return null;
}

router.post('/', async (req, res, next) => {
  try {
    const {
      robot_id,
      trip_id = null,
      lat,
      lng,
      accuracy = null,
      speed = null,
      heading = null,
      recorded_at = null
    } = req.body || {};

    if (!robot_id) return res.status(400).json({ error: 'robot_id es requerido' });
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      return res.status(400).json({ error: 'lat inválida' });
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: 'lng inválida' });
    }

    const { data: robot, error: robotError } = await admin
      .from('robots')
      .select('*')
      .eq('id', robot_id)
      .maybeSingle();
    if (robotError) throw robotError;
    if (!robot) return res.status(404).json({ error: 'Robot no encontrado' });

    const geofence = await findGeofenceForPoint(latitude, longitude);
    const timestamp = recorded_at || new Date().toISOString();

    const { data: location, error } = await admin
      .from('location_updates')
      .insert({
        robot_id,
        trip_id,
        lat: latitude,
        lng: longitude,
        accuracy,
        speed,
        heading,
        inside_geofence_id: geofence?.id || null,
        recorded_at: timestamp
      })
      .select()
      .single();
    if (error) throw error;

    await admin
      .from('robots')
      .update({
        current_lat: latitude,
        current_lng: longitude,
        current_site_id: geofence?.site_id || robot.current_site_id,
        current_geofence_id: geofence?.id || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', robot_id);

    let trip = null;
    if (trip_id) {
      const { data: existingTrip, error: tripError } = await admin
        .from('trips')
        .select('*')
        .eq('id', trip_id)
        .maybeSingle();
      if (tripError) throw tripError;

      if (
        existingTrip &&
        existingTrip.status === 'in_transit' &&
        geofence?.site_id &&
        geofence.site_id === existingTrip.destination_site_id
      ) {
        const now = new Date().toISOString();
        const { data: updatedTrip, error: updateTripError } = await admin
          .from('trips')
          .update({ status: 'arrived', arrived_at: now, updated_at: now })
          .eq('id', existingTrip.id)
          .select()
          .single();
        if (updateTripError) throw updateTripError;
        trip = updatedTrip;
      } else {
        trip = existingTrip;
      }
    }

    return res.status(201).json({
      location,
      inside_geofence_id: geofence?.id || null,
      geofence: geofence ? { id: geofence.id, name: geofence.name, type: geofence.type } : null,
      trip
    });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    let query = admin
      .from('location_updates')
      .select('*')
      .order('recorded_at', { ascending: false })
      .limit(Number(req.query.limit || 500));
    if (req.query.trip_id) query = query.eq('trip_id', req.query.trip_id);
    if (req.query.robot_id) query = query.eq('robot_id', req.query.robot_id);

    const { data, error } = await query;
    if (error) throw error;
    return res.json({ locations: data || [] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
