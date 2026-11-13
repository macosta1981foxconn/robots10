const { pointInPolygon, haversineKm } = require('../utils/geo');
const { syncRobotCategory } = require('./statusEvents');

const ACTIVE_TRIP_STATUSES = ['assigned', 'in_transit', 'arrived'];
const ASSIGNABLE_ROBOT_STATUSES = ['available', 'busy'];

async function getActiveTrips(supabase, robotId, excludeTripId = null) {
  let query = supabase
    .from('trips')
    .select('id, weight_kg, status')
    .eq('robot_id', robotId)
    .in('status', ACTIVE_TRIP_STATUSES);
  if (excludeTripId) query = query.neq('id', excludeTripId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function recomputeRobotLoad(supabase, robotId) {
  const trips = await getActiveTrips(supabase, robotId);
  const loadKg = trips.reduce((sum, trip) => sum + Number(trip.weight_kg || 0), 0);

  const { data: robot, error: robotError } = await supabase
    .from('robots')
    .select('status')
    .eq('id', robotId)
    .single();
  if (robotError) throw robotError;

  let status = robot.status;
  if (status !== 'offline' && status !== 'charging') {
    status = trips.length > 0 ? 'busy' : 'available';
  }

  const { error } = await supabase
    .from('robots')
    .update({ load_kg: loadKg, status, updated_at: new Date().toISOString() })
    .eq('id', robotId);
  if (error) throw error;

  return { loadKg, activeTrips: trips.length, status };
}

async function getTripWithSites(supabase, tripId) {
  const { data: trip, error } = await supabase.from('trips').select('*').eq('id', tripId).single();
  if (error) throw error;

  const [{ data: originSite }, { data: destinationSite }] = await Promise.all([
    trip.origin_site_id
      ? supabase.from('sites').select('*').eq('id', trip.origin_site_id).single()
      : { data: null },
    trip.destination_site_id
      ? supabase.from('sites').select('*').eq('id', trip.destination_site_id).single()
      : { data: null }
  ]);

  return { trip, originSite, destinationSite };
}

function scoreRobot({ robot, trip, originSite, activeTrips, projectedLoadKg }) {
  const capacity = Number(robot.capacity_kg || 0);
  const weight = Number(trip.weight_kg || 0);

  if (capacity <= 0) return { ok: false, reason: 'Robot sin capacidad configurada' };
  if (projectedLoadKg + weight > capacity) {
    return {
      ok: false,
      reason: `Capacidad insuficiente: ${projectedLoadKg + weight} kg > ${capacity} kg`,
      projectedLoadKg
    };
  }

  const distanceKm =
    robot.current_lat != null && robot.current_lng != null && originSite?.lat != null && originSite?.lng != null
      ? haversineKm(robot.current_lat, robot.current_lng, originSite.lat, originSite.lng)
      : 0;

  const loadAfter = (projectedLoadKg + weight) / capacity;
  const battery = Number(robot.battery_percent ?? 100);
  const batteryPenalty = battery < 20 ? 50 : battery < 40 ? 20 : 0;
  const statusPenalty = robot.status === 'busy' ? 8 : 0;
  const activePenalty = activeTrips.length * 15;

  const score =
    distanceKm * 0.9 +
    loadAfter * 45 +
    activePenalty +
    batteryPenalty +
    statusPenalty;

  return {
    ok: true,
    score: Number(score.toFixed(3)),
    breakdown: {
      distanceKm: Number(distanceKm.toFixed(3)),
      loadAfter: Number(loadAfter.toFixed(3)),
      activeTrips: activeTrips.length,
      batteryPercent: battery,
      status: robot.status,
      projectedLoadKg
    }
  };
}

async function chooseRobot(supabase, tripId) {
  const { trip, originSite } = await getTripWithSites(supabase, tripId);
  if (!trip) throw new Error('Viaje no encontrado');

  const { data: robots, error } = await supabase.from('robots').select('*');
  if (error) throw error;

  const candidates = (robots || []).filter((robot) => ASSIGNABLE_ROBOT_STATUSES.includes(robot.status));
  const evaluated = [];

  for (const robot of candidates) {
    const activeTrips = await getActiveTrips(supabase, robot.id, trip.id);
    const projectedLoadKg = activeTrips.reduce((sum, item) => sum + Number(item.weight_kg || 0), 0);
    const result = scoreRobot({ robot, trip, originSite, activeTrips, projectedLoadKg });
    if (result.ok) evaluated.push({ robot, ...result });
  }

  evaluated.sort((a, b) => a.score - b.score);
  return { trip, originSite, best: evaluated[0] || null, evaluatedCount: evaluated.length };
}

async function assignTripToRobot(supabase, tripId, robotId, { automatic = false } = {}) {
  const { trip, originSite } = await getTripWithSites(supabase, tripId);
  if (!trip) throw new Error('Viaje no encontrado');
  if (['completed', 'cancelled'].includes(trip.status)) {
    throw new Error(`No se puede asignar un viaje ${trip.status}`);
  }

  const { data: robot, error: robotError } = await supabase
    .from('robots')
    .select('*')
    .eq('id', robotId)
    .single();
  if (robotError || !robot) throw new Error('Robot no encontrado');

  const activeTrips = await getActiveTrips(supabase, robot.id, trip.id);
  const projectedLoadKg = activeTrips.reduce((sum, item) => sum + Number(item.weight_kg || 0), 0);
  const scored = scoreRobot({
    robot,
    trip,
    originSite,
    activeTrips,
    projectedLoadKg
  });

  if (!scored.ok) throw new Error(scored.reason || 'Robot no elegible');

  const now = new Date().toISOString();
  const { data: updatedTrip, error: updateError } = await supabase
    .from('trips')
    .update({
      robot_id: robot.id,
      status: 'assigned',
      assigned_at: trip.assigned_at || now,
      updated_at: now
    })
    .eq('id', trip.id)
    .select()
    .single();
  if (updateError) throw updateError;

  const { error: logError } = await supabase.from('load_assignments').insert({
    trip_id: trip.id,
    robot_id: robot.id,
    score: scored.score,
    breakdown: scored.breakdown,
    automatic
  });
  if (logError) throw logError;

  await recomputeRobotLoad(supabase, robot.id);
  await syncRobotCategory(supabase, robot.id, 'trip_assigned');
  return { trip: updatedTrip, robot, score: scored.score, breakdown: scored.breakdown };
}

async function runLoadBalancing(supabase, { limit = 20 } = {}) {
  const { data: pendingTrips, error } = await supabase
    .from('trips')
    .select('*')
    .eq('status', 'pending')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;

  const results = [];
  for (const trip of pendingTrips || []) {
    try {
      const choice = await chooseRobot(supabase, trip.id);
      if (!choice.best) {
        results.push({ trip_id: trip.id, assigned: false, reason: 'No hay robots elegibles' });
        continue;
      }
      const assigned = await assignTripToRobot(supabase, trip.id, choice.best.robot.id, {
        automatic: true
      });
      results.push({
        trip_id: trip.id,
        assigned: true,
        robot_id: choice.best.robot.id,
        robot_name: choice.best.robot.name,
        score: assigned.score,
        breakdown: assigned.breakdown
      });
    } catch (err) {
      results.push({ trip_id: trip.id, assigned: false, reason: err.message });
    }
  }

  return { processed: (pendingTrips || []).length, results };
}

module.exports = {
  ACTIVE_TRIP_STATUSES,
  getActiveTrips,
  recomputeRobotLoad,
  chooseRobot,
  assignTripToRobot,
  runLoadBalancing
};
