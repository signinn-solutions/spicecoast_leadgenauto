export function notFoundHandler(req, res) {
  return res.status(404).json({ error: 'Endpoint not found' });
}

export function globalErrorHandler(err, req, res, next) {
  console.error(`[Express Server Error]:`, err);
  const status = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  return res.status(status).json({ error: message });
}
