export function ok(res, data = null, message = 'Success', status = 200) {
  return res.status(status).json({ success: true, message, data });
}

export function created(res, data = null, message = 'Created') {
  return ok(res, data, message, 201);
}
