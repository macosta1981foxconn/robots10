const express = require('express');
const { admin } = require('../supabase');

const router = express.Router();

async function count(table, filters = []) {
  let query = admin.from(table).select('*', { count: 'exact', head: true });
  for (const [column, value] of filters) query = query.eq(column, value);
  const { count: total, error } = await query;
  if (error) throw error;
  return total || 0;
}

router.get('/', async (req, res, next) => {
  try {
    const [robots, trips, sites, geofences] = await Promise.all([
      admin.from('robots').select('status'),
      admin.from('trips').select('status, created_at').order('created_at', { ascending: false }).limit(500),
      admin.from('sites').select('type, active'),
      count('geofences', [['active', true]])
    ]);

    for (const result of [robots, trips, sites]) {
      if (result.error) throw result.error;
    }

    const robotsByStatus = {};
    for (const robot of robots.data || []) {
      robotsByStatus[robot.status] = (robotsByStatus[robot.status] || 0) + 1;
    }

    const tripsByStatus = {};
    for (const trip of trips.data || []) {
      tripsByStatus[trip.status] = (tripsByStatus[trip.status] || 0) + 1;
    }

    const sitesByType = { warehouse: 0, line: 0 };
    for (const site of sites.data || []) {
      if (site.active && sitesByType[site.type] !== undefined) sitesByType[site.type] += 1;
    }

    return res.json({
      robots: { total: (robots.data || []).length, byStatus: robotsByStatus },
      trips: { total: (trips.data || []).length, byStatus: tripsByStatus },
      sites: sitesByType,
      geofences,
      recentTrips: (trips.data || []).slice(0, 8)
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
