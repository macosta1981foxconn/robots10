const CATEGORIES = ['en_viaje', 'esperando_viaje', 'cargando_bateria', 'descompuesto'];
const ACTIVE_TRIP_STATUSES = ['assigned', 'in_transit', 'arrived'];

function deriveCategory(robot, activeTrips = []) {
  if (activeTrips.some((trip) => ['in_transit', 'arrived'].includes(trip.status))) return 'en_viaje';
  if (activeTrips.some((trip) => trip.status === 'assigned')) return 'esperando_viaje';
  if (robot?.status === 'charging') return 'cargando_bateria';
  if (robot?.status === 'offline') return 'descompuesto';
  return 'esperando_viaje';
}

async function getRobotActiveTrips(supabase, robotId) {
  const { data, error } = await supabase
    .from('trips')
    .select('id, status')
    .eq('robot_id', robotId)
    .in('status', ACTIVE_TRIP_STATUSES);
  if (error) throw error;
  return data || [];
}

async function syncRobotCategory(supabase, robotId, note = '') {
  try {
    const [{ data: robot, error: robotError }, activeTrips] = await Promise.all([
      supabase.from('robots').select('*').eq('id', robotId).maybeSingle(),
      getRobotActiveTrips(supabase, robotId)
    ]);
    if (robotError) throw robotError;
    if (!robot) return null;

    const category = deriveCategory(robot, activeTrips);
    const { data: lastEvent, error: lastError } = await supabase
      .from('robot_status_events')
      .select('status, created_at')
      .eq('robot_id', robotId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastError) throw lastError;

    if (lastEvent?.status !== category) {
      const { error } = await supabase.from('robot_status_events').insert({
        robot_id: robotId,
        status: category,
        note
      });
      if (error) throw error;
    }
    return category;
  } catch (error) {
    // La tabla puede no existir todavía en entornos donde no se haya corrido el schema nuevo.
    return null;
  }
}

function emptyDurations() {
  return { en_viaje: 0, esperando_viaje: 0, cargando_bateria: 0, descompuesto: 0, total: 0 };
}

function addDuration(target, category, ms) {
  if (!CATEGORIES.includes(category) || ms <= 0) return;
  target[category] += ms;
  target.total += ms;
}

async function computeDurationsFromEvents(supabase, robotIds) {
  let query = supabase
    .from('robot_status_events')
    .select('robot_id, status, created_at')
    .order('created_at', { ascending: true });
  if (robotIds.length === 1) query = query.eq('robot_id', robotIds[0]);
  else if (robotIds.length > 1) query = query.in('robot_id', robotIds);

  const { data: events, error } = await query;
  if (error) throw error;

  const byRobot = {};
  for (const event of events || []) {
    if (!byRobot[event.robot_id]) byRobot[event.robot_id] = [];
    byRobot[event.robot_id].push(event);
  }

  const now = Date.now();
  const result = {};
  for (const robotId of robotIds) {
    const robotEvents = byRobot[robotId] || [];
    const durations = emptyDurations();
    let lastStatus = null;
    let lastAt = null;

    for (const event of robotEvents) {
      const at = new Date(event.created_at).getTime();
      if (lastStatus && lastAt != null) addDuration(durations, lastStatus, at - lastAt);
      lastStatus = event.status;
      lastAt = at;
    }
    if (lastStatus && lastAt != null) addDuration(durations, lastStatus, now - lastAt);

    result[robotId] = {
      ...durations,
      last_status: lastStatus,
      last_event_at: lastAt ? new Date(lastAt).toISOString() : null
    };
  }
  return { available: true, byRobot: result };
}

async function computeDurationsFallback(supabase, robots, robotIds) {
  const ids = robotIds.length ? robotIds : robots.map((robot) => robot.id);
  const { data: trips, error } = await supabase
    .from('trips')
    .select('robot_id, status, created_at, assigned_at, started_at, arrived_at, completed_at, cancelled_at')
    .in('robot_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  if (error) throw error;

  const tripsByRobot = {};
  for (const trip of trips || []) {
    if (!tripsByRobot[trip.robot_id]) tripsByRobot[trip.robot_id] = [];
    tripsByRobot[trip.robot_id].push(trip);
  }

  const now = Date.now();
  const byRobot = {};
  for (const robot of robots.filter((item) => ids.includes(item.id))) {
    const createdAt = new Date(robot.created_at || Date.now()).getTime();
    const referenceAt = new Date(robot.updated_at || robot.created_at || Date.now()).getTime();
    const robotTrips = (tripsByRobot[robot.id] || []).sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    );
    const activeTrips = robotTrips.filter((trip) => ACTIVE_TRIP_STATUSES.includes(trip.status));
    const durations = emptyDurations();

    for (const trip of robotTrips) {
      if (!trip.started_at) continue;
      const started = new Date(trip.started_at).getTime();
      const endValue =
        trip.completed_at ||
        trip.cancelled_at ||
        (['in_transit', 'arrived'].includes(trip.status) ? new Date(now).toISOString() : null);
      if (!endValue) continue;
      const ended = new Date(endValue).getTime();
      addDuration(durations, 'en_viaje', Math.max(0, ended - started));
    }

    const elapsed = Math.max(0, now - createdAt);
    if (activeTrips.length === 0 && robot.status === 'charging') {
      addDuration(durations, 'cargando_bateria', Math.max(0, now - referenceAt));
    } else if (activeTrips.length === 0 && robot.status === 'offline') {
      addDuration(durations, 'descompuesto', Math.max(0, now - referenceAt));
    }
    addDuration(durations, 'esperando_viaje', Math.max(0, elapsed - durations.en_viaje - durations.cargando_bateria - durations.descompuesto));

    byRobot[robot.id] = {
      ...durations,
      last_status: deriveCategory(robot, activeTrips),
      last_event_at: null,
      estimated: true
    };
  }
  return { available: false, byRobot };
}

async function computeDurations(supabase, { robotId = null } = {}) {
  let robotsQuery = supabase.from('robots').select('*');
  if (robotId) robotsQuery = robotsQuery.eq('id', robotId);
  const { data: robots, error: robotsError } = await robotsQuery;
  if (robotsError) throw robotsError;

  const robotIds = (robots || []).map((robot) => robot.id);
  if (robotIds.length === 0) return { available: true, byRobot: {} };

  try {
    return await computeDurationsFromEvents(supabase, robotIds);
  } catch {
    return computeDurationsFallback(supabase, robots || [], robotIds);
  }
}

module.exports = { CATEGORIES, deriveCategory, syncRobotCategory, computeDurations };
