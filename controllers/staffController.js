import { body, param } from 'express-validator';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/response.js';
import * as staffService from '../services/staffService.js';

export const staffValidators = [
  body('name').trim().notEmpty(),
  body('role').optional().isIn(['barber', 'other']),
  body('available_days').optional().isArray(),
  body('service_ids').optional().isArray(),
  body('is_active').optional().isBoolean(),
];

export const listPublic = asyncHandler(async (req, res) => {
  const serviceId = req.query.service_id ? Number(req.query.service_id) : null;
  const data = serviceId
    ? await staffService.listBarbersForService(serviceId)
    : await staffService.listStaff({ admin: false, barbersOnly: true });
  ok(res, data);
});

export const getOne = asyncHandler(async (req, res) => {
  const admin = req.user?.role === 'admin';
  const data = await staffService.getStaffById(Number(req.params.id), { admin });
  ok(res, data);
});

export const getAvailability = asyncHandler(async (req, res) => {
  const resourceType = req.query.package_id
    ? 'package'
    : req.query.service_id
      ? 'service'
      : null;
  const resourceId = Number(req.query.package_id || req.query.service_id || 0) || null;
  const data = await staffService.getStaffAvailability({
    staffId: Number(req.params.id),
    resourceType,
    resourceId,
  });
  ok(res, data);
});

export const adminList = asyncHandler(async (req, res) => {
  const data = await staffService.listStaff({ admin: true });
  ok(res, data);
});

export const create = asyncHandler(async (req, res) => {
  const data = await staffService.createStaff(req.body);
  created(res, data, 'Staff member created');
});

export const update = asyncHandler(async (req, res) => {
  const data = await staffService.updateStaff(Number(req.params.id), req.body);
  ok(res, data, 'Staff member updated');
});

export const remove = asyncHandler(async (req, res) => {
  const result = await staffService.deleteStaff(Number(req.params.id));
  ok(res, result, result.message);
});

export const idParam = [param('id').isInt({ min: 1 })];
