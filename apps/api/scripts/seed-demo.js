const { admin } = require('../src/supabase');
const { deriveCategory } = require('../src/services/statusEvents');

const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const ago = (days, hours = 0, minutes = 0) => now - days * 86400000 - hours * 3600000 - minutes * 60000;

const SITES = [
  { id: '11111111-1111-4111-8111-111111111101', type: 'warehouse', name: 'Almacén Central', address: 'Parque Industrial', lat: 12.1364, lng: -86.2514 },
  { id: '11111111-1111-4111-8111-111111111102', type: 'warehouse', name: 'Almacén Norte', address: 'Zona Franca', lat: 12.15, lng: -86.27 },
  { id: '11111111-1111-4111-8111-111111111201', type: 'line', name: 'Línea A', address: 'Planta 1', lat: 12.132, lng: -86.245 },
  { id: '11111111-1111-4111-8111-111111111202', type: 'line', name: 'Línea B', address: 'Planta 2', lat: 12.14, lng: -86.24 },
  { id: '11111111-1111-4111-8111-111111111203', type: 'line', name: 'Línea C', address: 'Planta 3', lat: 12.128, lng: -86.26 },
  { id: '11111111-1111-4111-8111-111111111204', type: 'line', name: 'Línea D', address: 'Planta 4', lat: 12.145, lng: -86.265 }
];

const GEO = {
  '11111111-1111-4111-8111-111111111101': '22222222-2222-4222-8222-222222222201',
  '11111111-1111-4111-8111-111111111102': '22222222-2222-4222-8222-222222222202',
  '11111111-1111-4111-8111-111111111201': '22222222-2222-4222-8222-222222222203',
  '11111111-1111-4111-8111-111111111202': '22222222-2222-4222-8222-222222222204',
  '11111111-1111-4111-8111-111111111203': '22222222-2222-4222-8222-222222222205',
  '11111111-1111-4111-8111-111111111204': '22222222-2222-4222-8222-222222222206'
};

const ROBOTS = [
  { id: '33333333-3333-4333-8333-333333333301', name: 'Robot Alfa', code: 'R-001', capacity_kg: 150, battery_percent: 92, status: 'available', current_lat: 31.6904, current_lng: -106.4245, current_site_id: null, load_kg: 0, created_at: iso(ago(10)) },
  { id: '33333333-3333-4333-8333-333333333302', name: 'Robot Bravo', code: 'R-002', capacity_kg: 120, battery_percent: 76, status: 'busy', current_lat: 31.6921, current_lng: -106.4201, current_site_id: null, load_kg: 80, created_at: iso(ago(6)) },
  { id: '33333333-3333-4333-8333-333333333303', name: 'Robot Charlie', code: 'R-003', capacity_kg: 200, battery_percent: 45, status: 'charging', current_lat: 31.6882, current_lng: -106.4302, current_site_id: null, load_kg: 0, created_at: iso(ago(8)) },
  { id: '33333333-3333-4333-8333-333333333304', name: 'Robot Delta', code: 'R-004', capacity_kg: 100, battery_percent: 12, status: 'offline', current_lat: 31.6948, current_lng: -106.4183, current_site_id: null, load_kg: 0, created_at: iso(ago(12)) },
  { id: '33333333-3333-4333-8333-333333333305', name: 'Robot Echo', code: 'R-005', capacity_kg: 180, battery_percent: 88, status: 'available', current_lat: 31.6861, current_lng: -106.4284, current_site_id: null, load_kg: 0, created_at: iso(ago(7)) },
  { id: '33333333-3333-4333-8333-333333333306', name: 'Robot Foxtrot', code: 'R-006', capacity_kg: 140, battery_percent: 64, status: 'busy', current_lat: 31.6912, current_lng: -106.422, current_site_id: null, load_kg: 60, created_at: iso(ago(4)) },
  { id: '33333333-3333-4333-8333-333333333307', name: 'Robot Golf', code: 'R-007', capacity_kg: 110, battery_percent: 71, status: 'available', current_lat: 31.689, current_lng: -106.4261, current_site_id: null, load_kg: 0, created_at: iso(ago(9)) },
  { id: '33333333-3333-4333-8333-333333333308', name: 'Robot Hotel', code: 'R-008', capacity_kg: 130, battery_percent: 8, status: 'offline', current_lat: 31.6935, current_lng: -106.4162, current_site_id: null, load_kg: 0, created_at: iso(ago(15)) }
];

const WH = SITES[0].id;
const WH2 = SITES[1].id;
const LA = SITES[2].id;
const LB = SITES[3].id;
const LC = SITES[4].id;
const LD = SITES[5].id;
const R1 = ROBOTS[0].id, R2 = ROBOTS[1].id, R5 = ROBOTS[4].id, R6 = ROBOTS[5].id, R7 = ROBOTS[6].id;

const TRIPS = [
  { id: '44444444-4444-4444-8444-444444444401', origin_site_id: WH, destination_site_id: LA, robot_id: R1, material: 'Tornillos M8', weight_kg: 120, priority: 5, status: 'completed', created_at: iso(ago(3)), assigned_at: iso(ago(3, 0, 10)), started_at: iso(ago(3, 0, 20)), arrived_at: iso(ago(3, 1, 40)), completed_at: iso(ago(3, 1, 55)), cancelled_at: null },
  { id: '44444444-4444-4444-8444-444444444402', origin_site_id: WH2, destination_site_id: LB, robot_id: R5, material: 'Tuercas autoblocantes', weight_kg: 95, priority: 4, status: 'completed', created_at: iso(ago(2)), assigned_at: iso(ago(2, 0, 5)), started_at: iso(ago(2, 0, 15)), arrived_at: iso(ago(2, 1, 30)), completed_at: iso(ago(2, 1, 42)), cancelled_at: null },
  { id: '44444444-4444-4444-8444-444444444403', origin_site_id: WH, destination_site_id: LC, robot_id: R2, material: 'Rodamientos 6204', weight_kg: 80, priority: 8, status: 'in_transit', created_at: iso(ago(0, 2)), assigned_at: iso(ago(0, 2)), started_at: iso(ago(0, 1, 30)), arrived_at: null, completed_at: null, cancelled_at: null },
  { id: '44444444-4444-4444-8444-444444444404', origin_site_id: WH2, destination_site_id: LD, robot_id: R6, material: 'Correas timing', weight_kg: 60, priority: 6, status: 'assigned', created_at: iso(ago(0, 0, 40)), assigned_at: iso(ago(0, 0, 35)), started_at: null, arrived_at: null, completed_at: null, cancelled_at: null },
  { id: '44444444-4444-4444-8444-444444444405', origin_site_id: WH, destination_site_id: LB, robot_id: null, material: 'Arandelas planas', weight_kg: 45, priority: 3, status: 'pending', created_at: iso(ago(0, 0, 10)), assigned_at: null, started_at: null, arrived_at: null, completed_at: null, cancelled_at: null },
  { id: '44444444-4444-4444-8444-444444444406', origin_site_id: WH2, destination_site_id: LA, robot_id: R7, material: 'Empaques hidráulicos', weight_kg: 55, priority: 2, status: 'cancelled', created_at: iso(ago(4)), assigned_at: iso(ago(4, 0, 10)), started_at: iso(ago(4, 0, 20)), arrived_at: null, completed_at: null, cancelled_at: iso(ago(4, 3)) }
];

function polygonFor(site) {
  const d = 0.0015;
  const ring = [
    [site.lng - d, site.lat - d],
    [site.lng + d, site.lat - d],
    [site.lng + d, site.lat + d],
    [site.lng - d, site.lat + d],
    [site.lng - d, site.lat - d]
  ];
  return { type: 'Polygon', coordinates: [ring] };
}

async function upsert(table, rows) {
  const { error } = await admin.from(table).upsert(rows, { onConflict: 'id' });
  if (error) throw error;
}

(async () => {
  await upsert('sites', SITES.map((site) => ({ ...site, active: true })));

  await upsert('geofences', SITES.map((site) => ({
    id: GEO[site.id],
    site_id: site.id,
    name: `${site.name} geocerca`,
    type: site.type,
    polygon: polygonFor(site),
    color: site.type === 'warehouse' ? '#f59e0b' : '#8b5cf6',
    active: true
  })));

  for (const site of SITES) {
    const { error } = await admin.from('sites').update({ geofence_id: GEO[site.id] }).eq('id', site.id);
    if (error) throw error;
  }

  await upsert('robots', ROBOTS);
  await upsert('trips', TRIPS);

  let eventsAvailable = true;
  try {
    const probe = await admin.from('robot_status_events').select('id').limit(1);
    if (probe.error) eventsAvailable = false;
  } catch {
    eventsAvailable = false;
  }

  if (eventsAvailable) {
    const robotIds = ROBOTS.map((robot) => robot.id);
    await admin.from('robot_status_events').delete().in('robot_id', robotIds);

    const tripsByRobot = {};
    for (const trip of TRIPS) {
      if (!trip.robot_id) continue;
      if (!tripsByRobot[trip.robot_id]) tripsByRobot[trip.robot_id] = [];
      tripsByRobot[trip.robot_id].push(trip);
    }

    const events = [];
    const push = (robotId, status, createdAt, note) => events.push({ robot_id: robotId, status, created_at: createdAt, note });

    for (const robot of ROBOTS) {
      const robotTrips = (tripsByRobot[robot.id] || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const activeTrips = robotTrips.filter((trip) => ['assigned', 'in_transit', 'arrived'].includes(trip.status));
      const initial = robot.status === 'charging' ? 'cargando_bateria' : robot.status === 'offline' ? 'descompuesto' : 'esperando_viaje';
      push(robot.id, initial, robot.created_at, 'seed_initial');

      for (const trip of robotTrips) {
        if (trip.assigned_at) push(robot.id, 'esperando_viaje', trip.assigned_at, 'assigned');
        if (trip.started_at) push(robot.id, 'en_viaje', trip.started_at, 'started');
        const end = trip.completed_at || trip.cancelled_at;
        if (end) push(robot.id, 'esperando_viaje', end, 'finished');
      }

      const desired = deriveCategory(robot, activeTrips);
      const last = events.filter((event) => event.robot_id === robot.id).pop();
      if (last?.status !== desired) push(robot.id, desired, iso(now - 60000), 'seed_current');
    }

    if (events.length) {
      const { error } = await admin.from('robot_status_events').insert(events);
      if (error) throw error;
    }
  }

  console.log(JSON.stringify({
    ok: true,
    sites: SITES.length,
    geofences: SITES.length,
    robots: ROBOTS.length,
    trips: TRIPS.length,
    status_events: eventsAvailable ? 'inserted' : 'skipped (tabla robot_status_events no existe; corre supabase/schema.sql)'
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
