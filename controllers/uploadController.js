import fs from 'fs/promises';
import path from 'path';
import { asyncHandler } from '../utils/asyncHandler.js';
import { created } from '../utils/response.js';
import { AppError } from '../utils/AppError.js';
import { publicUploadPath, uploadRoot } from '../middleware/upload.js';
import { isR2Configured, isR2Enabled, uploadBufferToR2 } from '../services/r2Storage.js';

export const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('Image file is required.', 400);

  const folder = req.body?.folder || req.query?.folder || 'media';

  if (isR2Configured() && !isR2Enabled()) {
    throw new AppError(
      'R2 credentials are set but R2_PUBLIC_URL is empty. Enable Public Development URL (or a custom domain) on the saloon bucket, then paste that URL into server/.env as R2_PUBLIC_URL.',
      500
    );
  }

  if (isR2Enabled()) {
    const { url, key } = await uploadBufferToR2({
      buffer: req.file.buffer,
      contentType: req.file.mimetype,
      originalName: req.file.originalname,
      folder,
    });
    return created(res, { url, key, storage: 'r2' }, 'Uploaded to Cloudflare R2');
  }

  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
  const filename = `${unique}${ext}`;
  await fs.writeFile(path.join(uploadRoot, filename), req.file.buffer);

  created(res, { url: publicUploadPath(filename), filename, storage: 'local' }, 'Uploaded locally');
});
