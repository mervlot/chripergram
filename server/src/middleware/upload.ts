import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import multer from 'multer';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { env } from '../config/env';
import { db } from '../config/db';
import { ApiError } from '../utils/apiError';
import {
  FIELD_KINDS,
  isAcceptableDeclaredMime,
  normalizeMime,
  resolveUpload,
  type MediaKind,
} from '../utils/mediaTypes';

export const uploadRoot = path.resolve(process.cwd(), env.upload.dir);
export const uploadPublicPath = '/uploads';
fs.mkdirSync(uploadRoot, { recursive: true });

// Allowed types, MIME normalization and content sniffing live in
// utils/mediaTypes.ts. The stored extension and Content-Type always come from
// that allow-list (never from the client-supplied filename or raw MIME):
// express.static picks the response Content-Type from the stored extension, so
// honouring a name like "x.html" or "x.svg" would let uploads run as HTML/SVG
// (stored XSS).
//
// On disk the file is first written under a neutral ".part" name because its
// real type is only known once its leading bytes have been inspected in
// verifyUploads(); it is then renamed to the verified extension.
const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, _file, cb) => {
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.part`);
  },
});

if (env.cloudinary.enabled) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
    secure: true,
  });
}

const baseUpload = multer({
  storage:
    env.cloudinary.enabled || env.isProd
      ? multer.memoryStorage()
      : diskStorage,
  limits: { fileSize: env.upload.maxBytes },
  // Early, cheap rejection on the declared type only. The declared type may
  // carry codec parameters ("video/webm;codecs=vp9,opus") or be a generic
  // "application/octet-stream" (some Android pickers); both are acceptable
  // here and settled by the byte check below.
  fileFilter: (_req, file, cb) => {
    if (isAcceptableDeclaredMime(file.mimetype)) cb(null, true);
    else cb(new ApiError(400, `Unsupported file type: ${normalizeMime(file.mimetype) || 'unknown'}`));
  },
});

function collectFiles(req: Request): Express.Multer.File[] {
  const f = req.files as Express.Multer.File[] | Record<string, Express.Multer.File[]> | undefined;
  const out: Express.Multer.File[] = [];
  if (Array.isArray(f)) out.push(...f);
  else if (f) for (const list of Object.values(f)) out.push(...list);
  if (req.file) out.push(req.file);
  return out;
}

async function readHead(file: Express.Multer.File, length = 32): Promise<Uint8Array> {
  if (file.buffer) return file.buffer.subarray(0, length);
  if (!file.path) return new Uint8Array(0);
  const handle = await fs.promises.open(file.path, 'r');
  try {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buf, 0, length, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function discardFiles(files: Express.Multer.File[]) {
  await Promise.all(
    files.map((f) => (f.path ? fs.promises.unlink(f.path).catch(() => undefined) : undefined)),
  );
}

// Verifies every uploaded file by content, then rewrites mimetype / filename /
// path to the verified canonical values so storage and serving agree.
async function verifyUploads(req: Request) {
  const files = collectFiles(req);
  for (const file of files) {
    const result = resolveUpload(
      await readHead(file),
      file.size ?? file.buffer?.length ?? 0,
      file.mimetype,
    );
    if (!result.ok) throw new ApiError(400, result.message);

    const allowed: MediaKind[] | undefined = FIELD_KINDS[file.fieldname];
    if (allowed && !allowed.includes(result.type.kind)) {
      throw new ApiError(400, `The "${file.fieldname}" field does not accept ${result.type.kind} files.`);
    }

    file.mimetype = result.type.mime;
    if (file.path) {
      const finalName = file.filename.replace(/\.part$/, result.type.ext);
      const finalPath = path.join(path.dirname(file.path), finalName);
      await fs.promises.rename(file.path, finalPath);
      file.filename = finalName;
      file.path = finalPath;
    }
  }
}

// Wraps a multer handler so that any file failing byte verification is removed
// from disk and reported as a clean 400 before the controller runs.
function guarded(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    handler(req, res, (err?: unknown) => {
      if (err) return next(err);
      verifyUploads(req).then(
        () => next(),
        (verifyErr) => {
          void discardFiles(collectFiles(req));
          next(verifyErr);
        },
      );
    });
  };
}

export const upload = {
  fields: (fields: readonly multer.Field[]) => guarded(baseUpload.fields(fields)),
  array: (name: string, maxCount?: number) => guarded(baseUpload.array(name, maxCount)),
  single: (name: string) => guarded(baseUpload.single(name)),
};

function uploadToCloudinary(file: Express.Multer.File): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: env.cloudinary.folder,
        resource_type: 'auto',
        use_filename: false,
        unique_filename: true,
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error('Cloudinary did not return an upload result'));
          return;
        }
        resolve(result);
      },
    );

    stream.end(file.buffer);
  });
}

// Stores an uploaded file permanently when Cloudinary is configured and
// otherwise returns the URL of the local disk copy created by Multer.
export async function storeUploadedFile(file: Express.Multer.File): Promise<string> {
  if (env.cloudinary.enabled) {
    const result = await uploadToCloudinary(file);
    return result.secure_url;
  }

  if (env.isProd) {
    if (!file.buffer) throw new Error('Uploaded file is missing its memory buffer');
    const stored = await db.storedUpload.create({
      data: {
        data: file.buffer,
        mimeType: file.mimetype,
        originalName: file.originalname.slice(0, 255),
        size: file.size,
      },
      select: { id: true },
    });
    return `${env.apiUrl}${uploadPublicPath}/${stored.id}`;
  }

  if (!file.filename) throw new Error('Uploaded file is missing its local filename');
  return `${env.apiUrl}${uploadPublicPath}/${file.filename}`;
}

export async function serveStoredUpload(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const stored = await db.storedUpload.findUnique({
    where: { id: req.params.id },
    select: { data: true, mimeType: true, size: true },
  });
  if (!stored) {
    next();
    return;
  }

  const buf = Buffer.from(stored.data);
  const total = buf.length;

  res.set({
    'Content-Type': stored.mimeType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    // Uploads must never execute as documents, even if a browser mishandles
    // the declared media type.
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });

  // Byte-range support: <video>/<audio> (Safari/iOS especially) will not play
  // or seek without 206 Partial Content responses.
  const range = req.headers.range;
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (match) {
    let start = match[1] === '' ? NaN : Number(match[1]);
    let end = match[2] === '' ? NaN : Number(match[2]);
    if (Number.isNaN(start) && !Number.isNaN(end)) {
      // suffix range: last N bytes
      start = Math.max(0, total - end);
      end = total - 1;
    } else if (!Number.isNaN(start) && Number.isNaN(end)) {
      end = total - 1;
    }
    if (Number.isNaN(start) || start > end || start >= total) {
      res.status(416).set('Content-Range', `bytes */${total}`).end();
      return;
    }
    end = Math.min(end, total - 1);
    res.status(206).set({
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Length': String(end - start + 1),
    });
    res.end(buf.subarray(start, end + 1));
    return;
  }

  res.set('Content-Length', String(total));
  res.send(buf);
}
