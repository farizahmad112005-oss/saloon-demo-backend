import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';
import { env } from '../config/env.js';

let client;

function getClient() {
  if (!env.r2.enabled) return null;
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: env.r2.endpoint,
      credentials: {
        accessKeyId: env.r2.accessKeyId,
        secretAccessKey: env.r2.secretAccessKey,
      },
    });
  }
  return client;
}

export function isR2Configured() {
  return Boolean(env.r2.enabled);
}

export function isR2Enabled() {
  return Boolean(env.r2.enabled && env.r2.publicUrl);
}

function sanitizeFolder(folder = 'media') {
  return String(folder || 'media')
    .replace(/[^a-zA-Z0-9/_-]/g, '')
    .replace(/^\/+|\/+$/g, '')
    .slice(0, 64) || 'media';
}

export function buildObjectKey(originalName, folder = 'media') {
  const ext = path.extname(originalName || '').toLowerCase() || '.jpg';
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  return `${sanitizeFolder(folder)}/${unique}${ext}`;
}

export function publicUrlForKey(key) {
  const base = env.r2.publicUrl.replace(/\/$/, '');
  return `${base}/${key}`;
}

export async function uploadBufferToR2({ buffer, contentType, originalName, folder }) {
  const s3 = getClient();
  if (!s3) throw new Error('R2 storage is not configured.');

  const key = buildObjectKey(originalName, folder);
  await s3.send(
    new PutObjectCommand({
      Bucket: env.r2.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream',
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );

  return { key, url: publicUrlForKey(key) };
}

export async function deleteFromR2(keyOrUrl) {
  const s3 = getClient();
  if (!s3 || !keyOrUrl) return;

  let key = keyOrUrl;
  if (String(keyOrUrl).startsWith('http')) {
    try {
      const u = new URL(keyOrUrl);
      key = u.pathname.replace(/^\//, '');
    } catch {
      return;
    }
  }

  if (!key || key.startsWith('uploads/')) return;

  await s3.send(
    new DeleteObjectCommand({
      Bucket: env.r2.bucket,
      Key: key,
    })
  );
}
