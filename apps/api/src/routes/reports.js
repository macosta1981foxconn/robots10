const express = require('express');
const { admin } = require('../supabase');
const { deriveCategory, computeDurations } = require('../services/statusEvents');

const router = express.Router();
const ACTIVE_TRIP_STATUSES = ['assigned', 'in_transit', 'arrived'];

router.get('/overview', async (req, res, next) => {
  try {
    const robotId = req.query.robot_id || null;
    const lineId = req.query.line_id || null;

    let robotsQuery = admin.from('robots').select('*').order('name');
    if (robotId) robotsQuery = robotsQuery.eq('id', robotId);
    const { data: robots, error: robotsError } = await robotsQuery;
    if (robotsError) throw robotsError;

    let tripsQuery = admin
      .from('trips')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300);
    if (robotId) tripsQuery = tripsQuery.eq('robot_id', robotId);
    if (lineId) tripsQuery = tripsQuery.eq('destination_site_id', lineId);
    const { data: trips, error: tripsError } = await tripsQuery;
    if (tripsError) throw tripsError;

    const tripList = trips || [];
    const tripsByRobot = {};
    for (const trip of tripList) {
      if (!trip.robot_id) continue;
      if (!tripsByRobot[trip.robot_id]) tripsByRobot[trip.robot_id] = [];
      tripsByRobot[trip.robot_id].push(trip);
    }

    const robotsByStatus = {
      en_viaje: [],
      esperando_viaje: [],
      cargando_bateria: [],
      descompuesto: []
    };

    for (const robot of robots || []) {
      const robotTrips = tripsByRobot[robot.id] || [];
      const activeTrips = robotTrips.filter((trip) => ACTIVE_TRIP_STATUSES.includes(trip.status));
      const category = deriveCategory(robot, activeTrips);
      robotsByStatus[category].push({
        ...robot,
        active_trips: activeTrips.length,
        category
      });
    }

    const durations = await computeDurations(admin, { robotId });

    return res.json({
      ok: true,
      filters: { robot_id: robotId, line_id: lineId },
      robots_by_status: robotsByStatus,
      trip_history: tripList,
      status_durations: durations
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
