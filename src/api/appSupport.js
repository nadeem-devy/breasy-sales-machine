// ============================================
// App Support SMS Log API
// Fetches SMS messages from Twilio API for the
// app support number(s) — read-only tracking
// ============================================
const express = require('express');
const router = express.Router();
const config = require('../config');

function getClient() {
  if (config.twilio.accountSid && config.twilio.authToken &&
      !config.twilio.accountSid.startsWith('ACxxxx')) {
    const twilio = require('twilio');
    return twilio(config.twilio.accountSid, config.twilio.authToken);
  }
  return null;
}

/**
 * GET /api/app-support/messages
 * Fetch SMS messages from Twilio for all configured phone numbers.
 * Query params: page (default 0), limit (default 50), direction (inbound/outbound-api), from, to, dateFrom, dateTo
 */
router.get('/messages', async (req, res) => {
  try {
    const client = getClient();
    if (!client) {
      return res.json({ messages: [], total: 0, error: 'Twilio not configured' });
    }

    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const page = parseInt(req.query.page) || 0;
    const direction = req.query.direction || '';
    const filterPhone = req.query.phone || '';
    const dateFrom = req.query.dateFrom || '';
    const dateTo = req.query.dateTo || '';
    const search = req.query.search || '';

    // Build Twilio list options
    const listOpts = {
      limit: 1000, // fetch a larger set then paginate locally
    };

    if (dateFrom) listOpts.dateSentAfter = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setDate(end.getDate() + 1);
      listOpts.dateSentBefore = end;
    }

    // Fetch messages — if filterPhone is set, use it; otherwise fetch all
    if (filterPhone) {
      if (direction === 'inbound') {
        listOpts.from = filterPhone;
      } else if (direction === 'outbound-api') {
        listOpts.to = filterPhone;
      }
    }

    const allMessages = await client.messages.list(listOpts);

    // Filter locally for direction, search
    let filtered = allMessages;

    if (direction && !filterPhone) {
      filtered = filtered.filter(m => m.direction === direction);
    }

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(m =>
        (m.body || '').toLowerCase().includes(q) ||
        (m.to || '').includes(q) ||
        (m.from || '').includes(q)
      );
    }

    // Sort by date descending
    filtered.sort((a, b) => new Date(b.dateSent || b.dateCreated) - new Date(a.dateSent || a.dateCreated));

    const total = filtered.length;
    const start = page * limit;
    const paginated = filtered.slice(start, start + limit);

    const messages = paginated.map(m => ({
      sid: m.sid,
      from: m.from,
      to: m.to,
      body: m.body,
      status: m.status,
      direction: m.direction,
      date_sent: m.dateSent || m.dateCreated,
      num_segments: m.numSegments,
      price: m.price,
      error_code: m.errorCode,
      error_message: m.errorMessage,
    }));

    res.json({ messages, total, page, limit });
  } catch (err) {
    console.error('[APP-SUPPORT] Error fetching Twilio messages:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/app-support/stats
 * Quick stats: total sent today, total received today, total this week
 */
router.get('/stats', async (req, res) => {
  try {
    const client = getClient();
    if (!client) {
      return res.json({ sent_today: 0, received_today: 0, total_week: 0 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);

    const [todayMessages, weekMessages] = await Promise.all([
      client.messages.list({ dateSentAfter: today, limit: 1000 }),
      client.messages.list({ dateSentAfter: weekAgo, limit: 1000 }),
    ]);

    const sent_today = todayMessages.filter(m => m.direction === 'outbound-api' || m.direction === 'outbound-reply').length;
    const received_today = todayMessages.filter(m => m.direction === 'inbound').length;

    res.json({ sent_today, received_today, total_week: weekMessages.length });
  } catch (err) {
    console.error('[APP-SUPPORT] Stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
