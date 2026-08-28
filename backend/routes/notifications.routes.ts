import { Router } from "express";
import {
  doc,
  getDoc,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { chunk, db, fetchAll, fetchIndexed, notificationsRef } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";
import { forbidden, notFound, wrap } from "../lib/http.js";
import * as v from "../lib/validate.js";

const router = Router();

const BATCH_LIMIT = 450;

router.get(
  "/notifications/:userId",
  requireAuth,
  wrap(async (req, res) => {
    // A user only ever reads their own inbox.
    if (req.user!.id !== req.params.userId) throw forbidden("لا يمكنك عرض إشعارات مستخدم آخر");

    const max = v.num(req.query.limit, "الحد", { min: 1, max: 100, optional: true, default: 20 });

    /**
     * The header polls this endpoint every minute for every signed-in user, so
     * it is by far the most-called route in the system. It used to read the
     * user's entire notification history and throw away all but the newest 20
     * — after a school year that is hundreds of document reads per poll, per
     * user. Ordering and limiting in Firestore makes it exactly `max` reads
     * however long the history grows.
     */
    const rows = await fetchIndexed<Record<string, any>>(
      query(
        notificationsRef,
        where("user_id", "==", req.params.userId),
        orderBy("createdAt", "desc"),
        fsLimit(max)
      ),
      async () => {
        const all = await fetchAll<Record<string, any>>(
          query(notificationsRef, where("user_id", "==", req.params.userId))
        );
        all.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        return all.slice(0, max);
      },
      "notifications by user, newest first"
    );

    res.json(rows);
  })
);

router.post(
  "/notifications/read/:id",
  requireAuth,
  wrap(async (req, res) => {
    const target = doc(db, "notifications", req.params.id);
    const snap = await getDoc(target);
    if (!snap.exists()) throw notFound("الإشعار غير موجود");
    if (snap.data().user_id !== req.user!.id) throw forbidden("لا يمكنك تعديل إشعار مستخدم آخر");

    await updateDoc(target, { isRead: true });
    res.json({ success: true });
  })
);

router.post(
  "/notifications/read-all",
  requireAuth,
  wrap(async (req, res) => {
    const unread = await getDocs(
      query(notificationsRef, where("user_id", "==", req.user!.id), where("isRead", "==", false))
    );
    const refs = unread.docs.map((d) => d.ref);
    for (const group of chunk(refs, BATCH_LIMIT)) {
      const batch = writeBatch(db);
      group.forEach((ref) => batch.update(ref, { isRead: true }));
      await batch.commit();
    }
    res.json({ success: true, count: refs.length });
  })
);

export default router;
