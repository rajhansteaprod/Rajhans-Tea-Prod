import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response, NextFunction } from 'express';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (ALLOWED_MIME.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
  }
};

export const upload = multer({
  storage,
  limits: {
    fileSize: MAX_SIZE,
    fieldSize: MAX_SIZE,
    fieldNameSize: 100,
  },
  fileFilter,
});

export const uploadTimeoutMiddleware = (_req: Request, res: Response, next: NextFunction) => {
  res.setTimeout(120000); // 2 minutes for file uploads
  next();
};

export const uploadErrorHandler = (err: Error, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'File size exceeds 5MB limit. Please upload a smaller image.',
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Unexpected file field',
      });
    }
  }
  if (err.message.includes('Only')) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: err.message,
    });
  }
  return next(err);
};
