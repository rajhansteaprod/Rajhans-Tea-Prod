import { Request, Response } from 'express';
import { sendMetaEvent } from './meta-capi.service';
import { User } from '../../auth/models/user.model';

// Group B events. AddPaymentInfo / Purchase are added in Group C.
const ALLOWED = new Set(['ViewContent', 'AddToCart', 'InitiateCheckout', 'AddPaymentInfo']);

/**
 * Browser beacon → mirror a standard event to the Conversions API, deduped by
 * the SAME event_id the pixel used. Responds immediately (202) and never blocks
 * the user on Meta.
 *
 * SECURITY: this is a public endpoint. PII (email/phone/name) is taken ONLY from
 * the authenticated session (via authenticateOptional) — never from the request
 * body — so nobody can inject arbitrary match data. fbp/fbc/IP/UA still carry
 * match quality for anonymous visitors.
 */
export const trackBeacon = (req: Request, res: Response): void => {
  res.status(202).json({ success: true });

  const { eventName, eventId, customData, eventSourceUrl } = req.body ?? {};
  if (!eventName || !eventId || !ALLOWED.has(eventName)) return;

  const xff = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
  const base = {
    fbp: req.cookies?._fbp,
    fbc: req.cookies?._fbc,
    clientIp: xff || req.ip,
    userAgent: req.headers['user-agent'],
  };
  const userId = req.user?.userId;

  // Fire-and-forget. Resolve PII from the session only, then send.
  void (async () => {
    let pii: {
      email?: string | null;
      phone?: string | null;
      firstName?: string | null;
      lastName?: string | null;
    } = {};
    if (userId) {
      const u = await User.findById(userId, 'email phone firstName lastName')
        .lean<{ email?: string; phone?: string; firstName?: string; lastName?: string }>()
        .exec()
        .catch(() => null);
      if (u) {
        pii = { email: u.email, phone: u.phone, firstName: u.firstName, lastName: u.lastName };
      }
    }
    await sendMetaEvent({
      eventName,
      eventId,
      eventSourceUrl,
      customData,
      userData: { ...base, ...pii },
    });
  })();
};
