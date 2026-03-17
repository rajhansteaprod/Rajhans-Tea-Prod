import { ITokenDoc } from '../models/token.model';

// ---------------------------------------------------------------------------
// View shapes
// ---------------------------------------------------------------------------

/**
 * What a user sees when they list their own sessions.
 * IP is masked — last octet hidden for privacy ("192.168.1.xxx").
 * isCurrent = true marks the session they are calling from right now.
 */
export interface SessionUserView {
  _id: string;
  deviceName: string;
  browser: string;
  os: string;
  deviceType: 'mobile' | 'desktop' | 'tablet';
  ip: string;          // masked
  isCurrent: boolean;
  createdAt: Date;
  lastUsedAt: Date;
}

/**
 * What an admin sees when they inspect a user's sessions.
 * Extends the user view with full IP and raw UA for forensics.
 */
export interface SessionAdminView extends SessionUserView {
  userId: string;
  fullIp: string;      // unmasked
  userAgent: string;   // raw UA string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Mask the last octet of an IPv4 address.
 * IPv6 is truncated after the first 3 groups.
 */
function maskIp(ip: string): string {
  if (!ip || ip === 'Unknown') return 'Unknown';
  // IPv4: 192.168.1.42 → 192.168.1.xxx
  const v4 = ip.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
  if (v4) return `${v4[1]}.xxx`;
  // IPv6: 2001:db8:85a3::8a2e:370:7334 → 2001:db8:85a3:xxxx
  if (ip.includes(':')) return ip.split(':').slice(0, 3).join(':') + ':xxxx';
  return ip;
}

// ---------------------------------------------------------------------------
// Factory class
// ---------------------------------------------------------------------------

export class SessionDTO {
  /**
   * Shape a token doc for the owning user.
   *
   * @param token            - The Mongoose token document.
   * @param currentTokenHash - SHA-256 hash of the caller's active refresh token
   *                           (read from the httpOnly cookie server-side).
   *                           Pass null if not available.
   */
  static forUser(token: ITokenDoc, currentTokenHash: string | null): SessionUserView {
    return {
      _id:        token._id.toString(),
      deviceName: token.deviceInfo?.deviceName  ?? 'Unknown Device',
      browser:    token.deviceInfo?.browser     ?? 'Unknown Browser',
      os:         token.deviceInfo?.os          ?? 'Unknown OS',
      deviceType: token.deviceInfo?.deviceType  ?? 'desktop',
      ip:         maskIp(token.deviceInfo?.ip   ?? ''),
      isCurrent:  currentTokenHash !== null && token.token === currentTokenHash,
      createdAt:  token.createdAt,
      lastUsedAt: token.lastUsedAt ?? token.createdAt,
    };
  }

  /**
   * Shape a token doc for an admin.
   * Admin gets everything the user sees PLUS full IP + raw UA string.
   */
  static forAdmin(token: ITokenDoc, currentTokenHash: string | null = null): SessionAdminView {
    return {
      ...SessionDTO.forUser(token, currentTokenHash),
      userId:    token.user.toString(),
      fullIp:    token.deviceInfo?.ip        ?? 'Unknown',
      userAgent: token.deviceInfo?.userAgent ?? 'Unknown',
    };
  }
}
