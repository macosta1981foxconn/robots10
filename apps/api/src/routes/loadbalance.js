const express = require('express');
const { admin } = require('../supabase');
const { requireRole } = require('../middleware/auth');
const { runLoadBalancing, chooseRobot } = require('../services/loadBalancer');

const router = express.Router();

router.get('/pending', async (req, res, next) => {
  try {
    const { count, error } = await admin
      .from('trips')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    if (error) throw error;
    return res.json({ pendingTrips: count || 0 });
  } catch (error) {
    next(error);
  }
});

router.post('/run', requireRole('admin', 'dispatcher'), async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.body?.limit || 20), 100);
    const result = await runLoadBalancing(admin, { limit });
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/trips/:id/suggest', requireRole('admin', 'dispatcher'), async (req, res, next) => {
  try {
    const choice = await chooseRobot(admin, req.params.id);
    return res.json({
      trip_id: req.params.id,
      best: choice.best,
      evaluatedCount: choice.evaluatedCount
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
