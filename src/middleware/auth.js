function requireAuth(req, res, next) {
  // Public paths that don't need auth
  const publicPaths = ['/login', '/health', '/img/', '/css/', '/js/', '/webhooks/', '/2fa/'];
  const isPublic = publicPaths.some(p => req.path === p || req.path.startsWith(p));

  if (isPublic) return next();

  // Tracking redirects must work without auth
  if (req.path.startsWith('/t/')) return next();

  if (req.session && req.session.authenticated) {
    return next();
  }

  // API requests get 401, page requests redirect to login
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  res.redirect('/login');
}

module.exports = { requireAuth };
