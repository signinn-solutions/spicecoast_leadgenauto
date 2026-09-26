export function notFoundHandler(req, res) {
  return res.status(404).json({ error: 'Endpoint not found' });
}

export function globalErrorHandler(err, req, res, next) {
  const candidate = err.statusCode || err.status;
  const status = Number.isInteger(candidate) && candidate >= 400 && candidate < 600 ? candidate : 500;
  if (status >= 500) console.error('Request failed:', { method: req.method, path: req.path, code: err.code || 'INTERNAL_ERROR' });
  const message = status >= 500 ? 'The server could not complete this request.' :
    err.type === 'entity.parse.failed' ? 'Request body must be valid JSON.' :
    err.type === 'entity.too.large' ? 'Request body is too large.' : err.message || 'Request failed.';
  return res.status(status).json({ error: message });
}
