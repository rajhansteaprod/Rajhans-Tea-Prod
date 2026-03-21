import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';
import { ITokenPayload } from '../types/auth.types';

let io: Server | null = null;

// Map userId → Set of socket IDs (user can have multiple tabs/devices)
const userSockets = new Map<string, Set<string>>();

export const initSocket = (httpServer: HttpServer): Server => {
  io = new Server(httpServer, {
    cors: {
      origin: config.cors.origin,
      credentials: true,
    },
    path: '/socket.io',
  });

  // Auth middleware — verify JWT from handshake
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const payload = jwt.verify(token, config.jwt.accessSecret) as ITokenPayload;
      (socket as any).userId = payload.userId;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = (socket as any).userId as string;
    logger.info({ userId, socketId: socket.id }, 'WebSocket connected');

    // Track user → socket mapping
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId)!.add(socket.id);

    // Join user-specific room
    socket.join(`user:${userId}`);

    socket.on('disconnect', () => {
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) userSockets.delete(userId);
      }
      logger.debug({ userId, socketId: socket.id }, 'WebSocket disconnected');
    });
  });

  logger.info('WebSocket server initialized');
  return io;
};

export const getIO = (): Server | null => io;

/**
 * Emit event to a specific user (all their connected tabs/devices).
 */
export const emitToUser = (userId: string, event: string, data: unknown): void => {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, data);
};

/**
 * Emit event to all connected clients.
 */
export const emitToAll = (event: string, data: unknown): void => {
  if (!io) return;
  io.emit(event, data);
};

export const getConnectedUserCount = (): number => userSockets.size;
