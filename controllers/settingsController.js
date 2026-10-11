import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/response.js';
import { getSettings, updateSettings, publicSettings } from '../services/settingsService.js';

export const getPublicSettings = asyncHandler(async (req, res) => {
  const settings = await getSettings();
  ok(res, publicSettings(settings));
});

export const getAdminSettings = asyncHandler(async (req, res) => {
  ok(res, await getSettings());
});

export const putSettings = asyncHandler(async (req, res) => {
  ok(res, await updateSettings(req.body), 'Settings updated');
});
