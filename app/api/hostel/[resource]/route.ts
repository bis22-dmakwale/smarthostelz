import { and, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getDb } from "@/lib/db";
import {
  checkinEvents,
  lostFoundItems,
  maintenanceRequests,
  maintenanceVotes,
  notifications,
  noiseComplaints,
  hostelRooms,
  hostels,
  payments,
  receipts,
  roomAssignments,
  roomInspections,
  transferRequests,
  users,
} from "@/lib/db/schema";
import { requireUser } from "@/lib/server-auth";
import { sendRepairReportedAdmin, sendRepairUpdate, sendTransferDecision, sendTransferRequestedAdmin } from "@/lib/email";

type RouteContext = { params: Promise<{ resource: string }> };
type Body = Record<string, unknown>;

const maintenanceStates = ["reported", "verified", "assigned", "in-progress", "resolved"] as const;
const transferStates = ["approved", "rejected"] as const;
const complaintStates = ["reviewed", "resolved"] as const;
const foundStates = ["claimed", "returned"] as const;

function isText(value: unknown, max = 2000): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

async function bodyOf(request: Request): Promise<Body> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new Response("Request body must be valid JSON.", { status: 400 });
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Response("Invalid request body.", { status: 400 });
  return value as Body;
}

async function assignmentFor(studentId: string) {
  const [assignment] = await getDb().select().from(roomAssignments)
    .where(and(eq(roomAssignments.studentId, studentId), eq(roomAssignments.active, true))).limit(1);
  if (!assignment) throw new Response("No active room assignment is recorded for this account.", { status: 409 });
  return assignment;
}

async function assessRoomDamage(baseline: string[], checkout: string[]) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { status: "not-configured", assessment: null, assessedAt: null as Date | null };

  const content: Record<string, unknown>[] = [{
    type: "text",
    text: "Compare these room inspection images. The first image group is the move-in baseline; the second is the end-of-semester checkout. Report only visible damage that appears new or worsened, distinguish it from pre-existing damage, and state uncertainty. Do not recommend charges or infer intent. Return a concise severity (none, low, medium, or high) followed by findings.",
  }];
  for (const [label, photos] of [["Move-in baseline", baseline], ["End-of-semester checkout", checkout]] as const) {
    content.push({ type: "text", text: label });
    for (const photo of photos) content.push({ type: "image_url", image_url: { url: photo } });
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model: process.env.GROQ_VISION_MODEL ?? "meta-llama/llama-4-scout-17b-16e-instruct",
        temperature: 0.2,
        max_tokens: 700,
        messages: [{ role: "user", content }],
      }),
    });
    if (!response.ok) return {
      status: "failed", assessment: `Groq returned HTTP ${response.status}.`, assessedAt: new Date(),
    };
    const result = await response.json() as { choices?: { message?: { content?: string | null } }[] };
    const assessment = result.choices?.[0]?.message?.content?.trim();
    if (!assessment) return { status: "failed", assessment: "Groq returned no room assessment.", assessedAt: new Date() };
    return { status: "completed", assessment, assessedAt: new Date() };
  } catch (error) {
    console.error("Groq room assessment failed:", error);
    return { status: "failed", assessment: "The AI comparison could not be completed. The submitted photos are still saved for manual review.", assessedAt: new Date() };
  }
}

async function respondWithError(error: unknown) {
  if (error instanceof Response) return error;
  console.error("Hostel API request failed:", error);
  return Response.json({ error: "The request could not be completed. Check the server and database logs." }, { status: 500 });
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { resource } = await params;
    if (resource === "noise") {
      await requireUser("admin");
      const db = getDb();
      return Response.json(await db.select().from(noiseComplaints).orderBy(desc(noiseComplaints.submittedAt)));
    }

    const user = await requireUser();
    const db = getDb();
    if (resource === "assignment") {
      if (user.role !== "student") throw new Response("Student account required.", { status: 403 });
      const [assignment] = await db.select().from(roomAssignments)
        .where(and(eq(roomAssignments.studentId, user.id), eq(roomAssignments.active, true))).limit(1);
      return Response.json(assignment ?? null);
    }
    if (resource === "checkins") {
      return Response.json(await db.select().from(checkinEvents).where(eq(checkinEvents.studentId, user.id)).orderBy(desc(checkinEvents.eventAt)).limit(100));
    }
    if (resource === "maintenance") {
      const rows = await db.select({ item: maintenanceRequests, votes: count(maintenanceVotes.id) })
        .from(maintenanceRequests).leftJoin(maintenanceVotes, eq(maintenanceVotes.requestId, maintenanceRequests.id))
        .groupBy(maintenanceRequests.id).orderBy(desc(maintenanceRequests.reportedAt));
      const voted = user.role === "student"
        ? await db.select({ requestId: maintenanceVotes.requestId }).from(maintenanceVotes).where(eq(maintenanceVotes.studentId, user.id))
        : [];
      const votedIds = new Set(voted.map((row) => row.requestId));
      return Response.json(rows.map(({ item, votes }) => ({ ...item, votes, votedByMe: votedIds.has(item.id) })));
    }
    if (resource === "receipts") {
      if (user.role === "admin") {
        return Response.json(await db.select({
          receipt: receipts, studentName: users.name, regNo: users.regNo,
        }).from(receipts).innerJoin(users, eq(receipts.studentId, users.id)).orderBy(desc(receipts.paidAt)));
      }
      return Response.json(await db.select().from(receipts).where(eq(receipts.studentId, user.id)).orderBy(desc(receipts.paidAt)));
    }
    if (resource === "inspections") {
      if (user.role === "admin") {
        return Response.json(await db.select({
          inspection: roomInspections, studentName: users.name, regNo: users.regNo,
        }).from(roomInspections).innerJoin(users, eq(roomInspections.studentId, users.id)).orderBy(desc(roomInspections.submittedAt)));
      }
      return Response.json(await db.select().from(roomInspections).where(eq(roomInspections.studentId, user.id)).orderBy(desc(roomInspections.submittedAt)));
    }
    if (resource === "transfers") {
      if (user.role === "admin") {
        return Response.json(await db.select({
          transfer: transferRequests, studentName: users.name, regNo: users.regNo,
        }).from(transferRequests).innerJoin(users, eq(transferRequests.studentId, users.id)).orderBy(desc(transferRequests.requestedAt)));
      }
      return Response.json(await db.select().from(transferRequests).where(eq(transferRequests.studentId, user.id)).orderBy(desc(transferRequests.requestedAt)));
    }
    if (resource === "lost-found") {
      const entries = await db.select({
        item: lostFoundItems, reporterName: users.name,
      }).from(lostFoundItems).innerJoin(users, eq(lostFoundItems.studentId, users.id)).orderBy(desc(lostFoundItems.reportedAt));
      return Response.json(entries.map(({ item, ...entry }) => {
        const { studentId, ...publicItem } = item;
        return { ...entry, item: publicItem, isOwner: studentId === user.id };
      }));
    }
    if (resource === "students") {
      await requireUser("admin");
      const rows = await db.select({
        id: users.id, name: users.name, email: users.email, regNo: users.regNo,
        hostel: roomAssignments.hostel, room: roomAssignments.room,
      }).from(users).leftJoin(roomAssignments, and(
        eq(roomAssignments.studentId, users.id), eq(roomAssignments.active, true),
      )).where(eq(users.role, "student")).orderBy(users.name);
      const ids = rows.map((row) => row.id);
      const latestEvents = ids.length
        ? await db.selectDistinctOn([checkinEvents.studentId], {
          studentId: checkinEvents.studentId, action: checkinEvents.action,
        }).from(checkinEvents).where(inArray(checkinEvents.studentId, ids))
          .orderBy(checkinEvents.studentId, desc(checkinEvents.eventAt))
        : [];
      const eventByStudent = new Map(latestEvents.map((event) => [event.studentId, event]));
      return Response.json(rows.map((row) => ({
        ...row,
        checkin: eventByStudent.get(row.id)?.action ?? "none",
      })));
    }
    if (resource === "summary") {
      await requireUser("admin");
      const [studentCount] = await db.select({ value: count() }).from(users).where(eq(users.role, "student"));
      const latestEvents = await db.selectDistinctOn([checkinEvents.studentId], {
        studentId: checkinEvents.studentId, action: checkinEvents.action,
      }).from(checkinEvents).orderBy(checkinEvents.studentId, desc(checkinEvents.eventAt));
      const [openIssues] = await db.select({ value: count() }).from(maintenanceRequests)
        .where(inArray(maintenanceRequests.status, ["open", "reported", "verified", "assigned", "in-progress"]));
      const [pendingTransfers] = await db.select({ value: count() }).from(transferRequests).where(eq(transferRequests.status, "pending"));
      const activity = await db.select({
        action: checkinEvents.action, gate: checkinEvents.gate, eventAt: checkinEvents.eventAt,
        name: users.name, regNo: users.regNo, hostel: roomAssignments.hostel,
      }).from(checkinEvents).innerJoin(users, eq(checkinEvents.studentId, users.id))
        .leftJoin(roomAssignments, and(eq(roomAssignments.studentId, users.id), eq(roomAssignments.active, true)))
        .orderBy(desc(checkinEvents.eventAt)).limit(10);
      return Response.json({
        students: studentCount.value,
        checkedInEvents: latestEvents.filter((event) => event.action === "checked-in").length,
        maintenance: openIssues.value,
        transfers: pendingTransfers.value,
        activity,
      });
    }
    return Response.json({ error: "Unknown resource." }, { status: 404 });
  } catch (error) {
    return respondWithError(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { resource } = await params;
    const body = await bodyOf(request);

    if (resource === "noise") {
      if (!isText(body.location, 250) || !isText(body.message, 5000)) {
        return Response.json({ error: "A location and complaint message are required." }, { status: 400 });
      }
      const db = getDb();
      const [created] = await db.insert(noiseComplaints).values({
        location: body.location.trim(), message: body.message.trim(),
      }).returning();
      return Response.json(created, { status: 201 });
    }

    if (resource === "receipts") {
      await requireUser("admin");
      const db = getDb();
      if (typeof body.paymentId !== "string") return Response.json({ error: "Select a verified payment before issuing a receipt." }, { status: 400 });
      const [payment] = await db.select().from(payments).where(and(
        eq(payments.id, body.paymentId), eq(payments.status, "verified"),
      )).limit(1);
      if (!payment) return Response.json({ error: "Only verified payments may receive a receipt." }, { status: 409 });
      const [existing] = await db.select({ id: receipts.id }).from(receipts).where(eq(receipts.paymentId, payment.id)).limit(1);
      if (existing) return Response.json({ error: "A receipt has already been issued for this payment." }, { status: 409 });
      const [created] = await db.insert(receipts).values({
        studentId: payment.studentId,
        applicationId: payment.applicationId,
        paymentId: payment.id,
        trackingNo: `MUB-RCPT-${randomBytes(5).toString("hex").toUpperCase()}`,
        amount: payment.amount,
        method: payment.method,
      }).returning();
      return Response.json(created, { status: 201 });
    }

    const user = await requireUser("student");
    const db = getDb();
    if (resource === "checkins") {
      return Response.json({ error: "Gate events can only be recorded by an administrator scanning the allocation QR." }, { status: 403 });
    }
    if (resource === "maintenance") {
      const assignment = await assignmentFor(user.id);
      if (!isText(body.title, 250)) return Response.json({ error: "Enter a short title for the issue." }, { status: 400 });
      const title = body.title.trim();
      if (typeof body.photo !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(body.photo) || body.photo.length > 950_000) {
        return Response.json({ error: "Upload a JPEG, PNG, or WebP photo no larger than 700 KB." }, { status: 400 });
      }
      const reportPhoto = body.photo;
      const created = await db.transaction(async (tx) => {
        const [item] = await tx.insert(maintenanceRequests).values({
          studentId: user.id,
          title,
          description: typeof body.description === "string" ? body.description.trim().slice(0, 3000) : "",
          hostel: assignment.hostel,
          room: assignment.room,
          status: "reported",
          reportPhoto,
        }).returning();
        await tx.insert(maintenanceVotes).values({ requestId: item.id, studentId: user.id });
        return item;
      });
      await sendRepairReportedAdmin({ studentName: user.name, title: created.title, hostel: created.hostel, room: created.room });
      return Response.json(created, { status: 201 });
    }
    if (resource === "inspections") {
      const photos = body.photos;
      const assignment = await assignmentFor(user.id);
      if (!["check-in", "check-out"].includes(String(body.type)) || !isText(body.notes, 3000)
        || !Array.isArray(photos) || photos.length < 1 || photos.length > 4
        || !photos.every((photo) => typeof photo === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(photo) && photo.length <= 950_000)) {
        return Response.json({ error: "Select an inspection type, add notes, and upload 1–4 JPEG, PNG, or WebP images (max 700 KB each)." }, { status: 400 });
      }
      const inspectionTypeValue = body.type as "check-in" | "check-out";
      const [baseline] = await db.select().from(roomInspections).where(and(
        eq(roomInspections.assignmentId, assignment.id), eq(roomInspections.type, "check-in"),
      )).limit(1);
      const [existing] = await db.select({ id: roomInspections.id }).from(roomInspections).where(and(
        eq(roomInspections.assignmentId, assignment.id), eq(roomInspections.type, inspectionTypeValue),
      )).limit(1);
      if (existing) return Response.json({ error: `A ${inspectionTypeValue} inspection is already recorded for this room assignment.` }, { status: 409 });
      if (inspectionTypeValue === "check-out" && !baseline) {
        return Response.json({ error: "Submit the move-in baseline inspection before the end-of-semester checkout." }, { status: 409 });
      }
      const aiResult = inspectionTypeValue === "check-in"
        ? { status: "baseline", assessment: null, assessedAt: null as Date | null }
        : await assessRoomDamage(baseline!.photos, photos as string[]);
      const [created] = await db.insert(roomInspections).values({
        studentId: user.id, assignmentId: assignment.id, type: inspectionTypeValue, notes: body.notes.trim(),
        hostel: assignment.hostel, room: assignment.room, photos: photos as string[],
        aiStatus: aiResult.status, aiAssessment: aiResult.assessment, aiAssessedAt: aiResult.assessedAt,
      }).returning();
      return Response.json(created, { status: 201 });
    }
    if (resource === "transfers") {
      const assignment = await assignmentFor(user.id);
      if (!isText(body.requestedHostelId, 80) || !isText(body.requestedRoomId, 80) || !isText(body.reason, 3000)) {
        return Response.json({ error: "Select an eligible hostel and available room, and provide a reason." }, { status: 400 });
      }
      const [target] = await db.select({
        hostelId: hostels.id, hostel: hostels.name, gender: hostels.gender,
        roomId: hostelRooms.id, room: hostelRooms.roomNo, capacity: hostelRooms.capacity,
      }).from(hostelRooms).innerJoin(hostels, eq(hostels.id, hostelRooms.hostelId)).where(and(
        eq(hostelRooms.id, body.requestedRoomId), eq(hostels.id, body.requestedHostelId),
        eq(hostelRooms.active, true), eq(hostels.active, true),
      )).limit(1);
      if (!target) return Response.json({ error: "That hostel room is no longer available." }, { status: 409 });
      if (user.gender !== target.gender) return Response.json({ error: "That hostel is not eligible for your verified resident profile." }, { status: 403 });
      if (assignment.roomId === target.roomId) return Response.json({ error: "You already occupy that room." }, { status: 400 });
      const [occupied] = await db.select({ value: count() }).from(roomAssignments).where(and(
        eq(roomAssignments.active, true), or(
          eq(roomAssignments.roomId, target.roomId),
          and(isNull(roomAssignments.roomId), eq(roomAssignments.hostel, target.hostel), eq(roomAssignments.room, target.room)),
        ),
      ));
      if (occupied.value >= target.capacity) return Response.json({ error: "That room has just reached capacity. Choose another room." }, { status: 409 });
      const [created] = await db.insert(transferRequests).values({
        studentId: user.id,
        currentHostel: assignment.hostel,
        currentRoom: assignment.room,
        requestedHostel: target.hostel,
        requestedRoom: target.room,
        reason: body.reason.trim(),
      }).returning();
      await sendTransferRequestedAdmin({
        studentName: user.name, from: `${created.currentHostel} · ${created.currentRoom}`,
        to: `${created.requestedHostel} · ${created.requestedRoom}`, reason: created.reason,
      });
      return Response.json(created, { status: 201 });
    }
    if (resource === "lost-found") {
      if (!["lost", "found"].includes(String(body.type)) || !isText(body.title, 250)
        || !isText(body.description, 3000) || !isText(body.location, 250)) {
        return Response.json({ error: "Type, item name, description, and location are required." }, { status: 400 });
      }
      if (body.photo && (typeof body.photo !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(body.photo) || body.photo.length > 950_000)) {
        return Response.json({ error: "Image must be a JPEG, PNG, or WebP file no larger than 700 KB." }, { status: 400 });
      }
      const [created] = await db.insert(lostFoundItems).values({
        studentId: user.id,
        type: body.type as "lost" | "found",
        title: body.title.trim(),
        description: body.description.trim(),
        location: body.location.trim(),
        photo: typeof body.photo === "string" ? body.photo : null,
      }).returning();
      return Response.json(created, { status: 201 });
    }
    return Response.json({ error: "Unknown resource." }, { status: 404 });
  } catch (error) {
    return respondWithError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { resource } = await params;
    const body = await bodyOf(request);
    const user = await requireUser();
    const db = getDb();
    if (typeof body.id !== "string") return Response.json({ error: "A record id is required." }, { status: 400 });

    if (resource === "maintenance" && body.action === "vote") {
      if (user.role !== "student") throw new Response("Student account required.", { status: 403 });
      const [item] = await db.select().from(maintenanceRequests).where(eq(maintenanceRequests.id, body.id)).limit(1);
      if (!item) return Response.json({ error: "Maintenance request not found." }, { status: 404 });
      const [vote] = await db.select().from(maintenanceVotes).where(and(
        eq(maintenanceVotes.requestId, item.id), eq(maintenanceVotes.studentId, user.id),
      )).limit(1);
      if (vote) await db.delete(maintenanceVotes).where(eq(maintenanceVotes.id, vote.id));
      else await db.insert(maintenanceVotes).values({ requestId: item.id, studentId: user.id });
      return Response.json({ voted: !vote });
    }
    if (resource === "maintenance") {
      await requireUser("admin");
      if (!maintenanceStates.includes(body.status as typeof maintenanceStates[number])) {
        return Response.json({ error: "Choose reported, verified, assigned, in-progress, or resolved." }, { status: 400 });
      }
      const current = (await db.select().from(maintenanceRequests).where(eq(maintenanceRequests.id, body.id)).limit(1))[0];
      if (!current) return Response.json({ error: "Maintenance request not found." }, { status: 404 });
      const transitions: Record<string, string[]> = {
        reported: ["verified"], verified: ["assigned"], assigned: ["in-progress"], "in-progress": ["resolved"],
        open: ["verified"], fixed: [],
      };
      if (current.status !== body.status && !transitions[current.status]?.includes(body.status as string)) {
        return Response.json({ error: `Cannot move a ${current.status} report to ${String(body.status)}.` }, { status: 409 });
      }
      if (body.status === "assigned" && !isText(body.assignedStaff, 150)) {
        return Response.json({ error: "Enter the assigned maintenance staff member." }, { status: 400 });
      }
      if (body.status === "resolved" && !isText(body.resolutionNotes, 2000)
        && (typeof body.resolutionPhoto !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(body.resolutionPhoto))) {
        return Response.json({ error: "Add resolution notes or a completed-repair photo before closing this repair." }, { status: 400 });
      }
      if (body.resolutionPhoto !== undefined && body.resolutionPhoto !== null
        && (typeof body.resolutionPhoto !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(body.resolutionPhoto) || body.resolutionPhoto.length > 950_000)) {
        return Response.json({ error: "Resolution photo must be a JPEG, PNG, or WebP image no larger than 700 KB." }, { status: 400 });
      }
      const [updated] = await db.update(maintenanceRequests).set({
        status: body.status as typeof maintenanceStates[number],
        verificationNotes: typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : null,
        assignedStaff: body.status === "assigned" ? (body.assignedStaff as string).trim().slice(0, 150) : current.assignedStaff,
        resolutionNotes: body.status === "resolved" ? (typeof body.resolutionNotes === "string" ? body.resolutionNotes.trim().slice(0, 2000) : null) : current.resolutionNotes,
        resolutionPhoto: typeof body.resolutionPhoto === "string" ? body.resolutionPhoto : current.resolutionPhoto,
        verifiedAt: new Date(),
      }).where(eq(maintenanceRequests.id, body.id)).returning();
      if (!updated) return Response.json({ error: "Maintenance request not found." }, { status: 404 });
      if (updated.status !== current.status) {
        await db.insert(notifications).values({
          studentId: updated.studentId,
          title: "Repair request updated",
          message: `${updated.title} is now ${updated.status}${updated.assignedStaff ? ` and assigned to ${updated.assignedStaff}` : ""}${updated.resolutionNotes ? `. ${updated.resolutionNotes}` : ""}`,
        });
        const [owner] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, updated.studentId)).limit(1);
        if (owner) await sendRepairUpdate({
          to: owner.email, name: owner.name, title: updated.title, status: updated.status,
          staff: updated.assignedStaff, notes: updated.resolutionNotes,
        });
      }
      return Response.json(updated);
    }
    if (resource === "transfers") {
      await requireUser("admin");
      if (!transferStates.includes(body.status as typeof transferStates[number])) {
        return Response.json({ error: "Choose approved or rejected." }, { status: 400 });
      }
      const [transfer] = await db.select().from(transferRequests).where(eq(transferRequests.id, body.id)).limit(1);
      if (!transfer) return Response.json({ error: "Transfer request not found." }, { status: 404 });
      if (transfer.status !== "pending") return Response.json({ error: "This transfer request has already been reviewed." }, { status: 409 });
      await db.transaction(async (tx) => {
        const [updated] = await tx.update(transferRequests).set({
          status: body.status as typeof transferStates[number],
          reviewNotes: typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : null,
          reviewedAt: new Date(),
        }).where(and(eq(transferRequests.id, transfer.id), eq(transferRequests.status, "pending"))).returning();
        if (!updated) throw new Response("This transfer request has already been reviewed.", { status: 409 });
        if (body.status === "approved") {
          const [target] = await tx.select({
            roomId: hostelRooms.id, hostel: hostels.name, room: hostelRooms.roomNo,
            gender: hostels.gender, capacity: hostelRooms.capacity,
          }).from(hostelRooms).innerJoin(hostels, eq(hostels.id, hostelRooms.hostelId)).where(and(
            eq(hostels.name, transfer.requestedHostel), eq(hostelRooms.roomNo, transfer.requestedRoom),
            eq(hostels.active, true), eq(hostelRooms.active, true),
          )).limit(1);
          if (!target) throw new Response("The requested room is no longer available.", { status: 409 });
          const [student] = await tx.select({ gender: users.gender }).from(users)
            .where(eq(users.id, transfer.studentId)).limit(1);
          if (!student || student.gender !== target.gender) throw new Response("This room does not match the student's verified eligibility.", { status: 403 });
          await tx.execute(sql`SELECT id FROM hostel_rooms WHERE id = ${target.roomId} FOR UPDATE`);
          await tx.update(roomAssignments).set({ active: false }).where(and(
            eq(roomAssignments.studentId, transfer.studentId), eq(roomAssignments.active, true),
          ));
          const [occupied] = await tx.select({ value: count() }).from(roomAssignments).where(and(
            eq(roomAssignments.active, true), or(
              eq(roomAssignments.roomId, target.roomId),
              and(isNull(roomAssignments.roomId), eq(roomAssignments.hostel, target.hostel), eq(roomAssignments.room, target.room)),
            ),
          ));
          if (occupied.value >= target.capacity) throw new Response("The requested room reached capacity before approval.", { status: 409 });
          await tx.insert(roomAssignments).values({
            studentId: transfer.studentId,
            roomId: target.roomId,
            hostel: target.hostel,
            room: target.room,
          });
        }
      });
      const [requester] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, transfer.studentId)).limit(1);
      if (requester) await sendTransferDecision({
        to: requester.email, name: requester.name, status: body.status as "approved" | "rejected",
        fromRoom: `${transfer.currentHostel} · ${transfer.currentRoom}`,
        toRoom: `${transfer.requestedHostel} · ${transfer.requestedRoom}`,
        notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 500) || null : null,
      });
      return Response.json({ ok: true });
    }
    if (resource === "noise") {
      await requireUser("admin");
      if (!complaintStates.includes(body.status as typeof complaintStates[number])) {
        return Response.json({ error: "Choose reviewed or resolved." }, { status: 400 });
      }
      const [updated] = await db.update(noiseComplaints).set({
        status: body.status as typeof complaintStates[number], reviewedAt: new Date(),
      }).where(eq(noiseComplaints.id, body.id)).returning();
      if (!updated) return Response.json({ error: "Noise complaint not found." }, { status: 404 });
      return Response.json(updated);
    }
    if (resource === "lost-found") {
      if (!foundStates.includes(body.status as typeof foundStates[number])) {
        return Response.json({ error: "Choose claimed or returned." }, { status: 400 });
      }
      if (user.role === "admin") {
        const [updated] = await db.update(lostFoundItems).set({
          status: body.status as typeof foundStates[number],
        }).where(eq(lostFoundItems.id, body.id)).returning();
        if (!updated) return Response.json({ error: "Item not found." }, { status: 404 });
        return Response.json(updated);
      }
      const [item] = await db.select().from(lostFoundItems).where(eq(lostFoundItems.id, body.id)).limit(1);
      if (!item || item.type !== "found" || item.status !== "open" || item.studentId === user.id) {
        return Response.json({ error: "This item is not available to claim." }, { status: 409 });
      }
      const [updated] = await db.update(lostFoundItems).set({
        status: "claimed", claimedById: user.id,
      }).where(and(eq(lostFoundItems.id, item.id), eq(lostFoundItems.status, "open"))).returning();
      if (!updated) return Response.json({ error: "This item has already been claimed." }, { status: 409 });
      return Response.json(updated);
    }
    return Response.json({ error: "Unknown resource." }, { status: 404 });
  } catch (error) {
    return respondWithError(error);
  }
}
