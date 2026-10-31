import { and, desc, eq } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/db";
import { checkinEvents, hostels, roomAssignments } from "@/lib/db/schema";
import { requireUser } from "@/lib/server-auth";

export async function POST(request: Request) {
  try {
    const user = await requireUser("student");
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.code !== "string" || !["checked-in", "checked-out"].includes(String(body.action))) {
      return Response.json({ error: "Scan the official hostel gate QR and choose check-in or check-out." }, { status: 400 });
    }
    const secret = process.env.SESSION_SECRET;
    if (!secret) throw new Error("SESSION_SECRET is not configured.");
    const [, hostelId, signature, ...extra] = body.code.split(":");
    if (!hostelId || !signature || extra.length) {
      return Response.json({ error: "This is not a valid MUBAS hostel gate QR." }, { status: 400 });
    }
    const expected = Buffer.from(createHmac("sha256", secret).update(`mubas-hostel-gate:v1:${hostelId}`).digest("hex"), "hex");
    const actual = Buffer.from(signature, "hex");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return Response.json({ error: "This is not a valid MUBAS hostel gate QR." }, { status: 400 });
    }
    const db = getDb();
    const [hostel] = await db.select().from(hostels)
      .where(and(eq(hostels.id, hostelId), eq(hostels.active, true))).limit(1);
    if (!hostel) return Response.json({ error: "This hostel gate QR is no longer active." }, { status: 409 });
    const [assignment] = await db.select().from(roomAssignments)
      .where(and(eq(roomAssignments.studentId, user.id), eq(roomAssignments.active, true))).limit(1);
    if (!assignment) return Response.json({ error: "Only students with an active room allocation can use gate check-in." }, { status: 409 });
    if (assignment.hostel !== hostel.name) {
      return Response.json({ error: `Your room is assigned at ${assignment.hostel}, not ${hostel.name}.` }, { status: 403 });
    }

    const [latest] = await db.select().from(checkinEvents)
      .where(eq(checkinEvents.studentId, user.id))
      .orderBy(desc(checkinEvents.eventAt)).limit(1);
    const action = body.action as "checked-in" | "checked-out";
    if ((action === "checked-in" && latest?.action === "checked-in")
      || (action === "checked-out" && latest?.action !== "checked-in")) {
      return Response.json({ error: action === "checked-in" ? "This resident is already checked in." : "This resident must be checked in before checking out." }, { status: 409 });
    }
    const [event] = await db.insert(checkinEvents).values({
      studentId: user.id,
      action,
      gate: hostel.name,
    }).returning();
    return Response.json({
      event, action, name: user.name, regNo: user.regNo,
      hostel: assignment.hostel, room: assignment.room,
    }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Response ? await error.text() : "Unable to record this hostel entrance scan." }, {
      status: error instanceof Response ? error.status : 500,
    });
  }
}