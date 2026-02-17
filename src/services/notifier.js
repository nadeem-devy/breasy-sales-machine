/**
 * Simple SSE-based notification emitter
 * Pushes real-time events to connected browser clients
 */
const clients = new Set();

function addClient(res) {
  clients.add(res);
  res.on('close', () => clients.delete(res));
}

function notify(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    client.write(payload);
  }
}

module.exports = { addClient, notify };
