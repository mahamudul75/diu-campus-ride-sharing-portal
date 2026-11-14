import type http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyToken } from '../utils/jwt.ts';
import { db } from '../config/db.ts';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: number;
  isAlive?: boolean;
}

const userSockets = new Map<number, Set<AuthenticatedWebSocket>>();
let wssInstance: WebSocketServer | null = null;

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

export function initWebSocketServer(
  server: http.Server,
  isTrustedOrigin: (rawOrigin: unknown) => boolean
): WebSocketServer {
  if (wssInstance) return wssInstance;

  const wss = new WebSocketServer({ noServer: true });
  wssInstance = wss;

  server.on('upgrade', async (request, socket, head) => {
    try {
      const requestUrl = new URL(request.url || '/', 'http://localhost');
      if (requestUrl.pathname !== '/ws') {
        return;
      }

      const origin = request.headers.origin;
      if (origin !== undefined && !isTrustedOrigin(origin)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      const cookies = parseCookies(request.headers.cookie);
      const token = cookies.token;
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const decoded = verifyToken(token);
      if (!decoded) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const [rows] = await db.query('SELECT id, is_blocked FROM users WHERE id = ?', [decoded.id]);
      const user = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;
      if (!user || user.is_blocked === 1 || Boolean(user.is_blocked)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        const client = ws as AuthenticatedWebSocket;
        client.userId = user.id;
        client.isAlive = true;
        wss.emit('connection', client, request);
      });
    } catch {
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
  });

  wss.on('connection', (ws: AuthenticatedWebSocket) => {
    const userId = ws.userId;
    if (!userId) {
      ws.close();
      return;
    }

    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId)!.add(ws);

    ws.send(JSON.stringify({ event: 'ws:connected', userId }));

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data?.type === 'ping') {
          ws.send(JSON.stringify({ event: 'pong', ts: Date.now() }));
        }
      } catch {
        // Ignore malformed non-JSON frames safely
      }
    });

    ws.on('close', () => {
      const set = userSockets.get(userId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) {
          userSockets.delete(userId);
        }
      }
    });
  });

  const heartbeatInterval = setInterval(() => {
    for (const [, sockets] of userSockets.entries()) {
      for (const client of sockets) {
        if (client.isAlive === false) {
          client.terminate();
          continue;
        }
        client.isAlive = false;
        client.ping();
      }
    }
  }, 30000);
  heartbeatInterval.unref();

  return wss;
}

export function pushToUser(userId: number, payload: Record<string, any>): void {
  const sockets = userSockets.get(userId);
  if (!sockets || sockets.size === 0) return;

  const serialized = JSON.stringify(payload);
  for (const client of sockets) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(serialized);
    }
  }
}

export function pushToUsers(userIds: number[], payload: Record<string, any>): void {
  const unique = new Set(userIds);
  for (const uid of unique) {
    pushToUser(uid, payload);
  }
}
