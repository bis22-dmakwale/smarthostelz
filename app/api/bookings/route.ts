import { and, count, desc, eq, isNull, ne, or, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getDb } from "@/lib/db";
import { bookingApplications, bookingSettings, hostelRooms, hostels, roomAssignments, users } from "@/lib/db/schema";
import { sendBookingConfirmation } from "@/lib/booking-email";
import { requireUser } from "@/lib/server-auth";

export async function GET() {
  try {
    const user = await requireUser();
    const db = getDb();
    if (user.role === "admin") {
      const rows = await db.select({
        application: bookingApplications,
        studentName: users.name,
        regNo: users.regNo,
        hostelName: hostels.name,
        roomNo: hostelRooms.roomNo,
      }).from(bookingApplications)
        .innerJoin(users, eq(users.id, bookingApplications.studentId))
        .leftJoin(hostels, eq(hostels.id, bookingApplications.hostelId))
        .leftJoin(hostelRooms, eq(hostelRooms.id, bookingApplications.roomId))
        .orderBy(desc(bookingApplications.submittedAt));
      return Response.json(rows);
    }
    const rows = await db.select({
      application: bookingApplications,
      hostelName: hostels.name,
      roomNo: hostelRooms.roomNo,
      qrToken: roomAssignments.qrToken,
    }).from(bookingApplications)
      .leftJoin(hostels, eq(hostels.id, bookingApplications.hostelId))
      .leftJoin(hostelRooms, eq(hostelRooms.id, bookingApplications.roomId))
      .leftJoin(roomAssignments, eq(roomAssignments.applicationId, bookingApplications.id))
      .where(eq(bookingApplications.studentId, user.id))
      .orderBy(desc(bookingApplications.submittedAt));
    return Response.json(rows);
  } catch (error) {
    return Response.json({ error: error instanceof Response ? await error.text() : "Unable to load booking applications." }, {
      status: error instanceof Response ? error.status : 500,
    });
  }
}

export async function POST() {
  try {
    const user = await requireUser("student");
    if (!user.regNo) return Response.json({ error: "Your registration number is missing. Contact the hostel office." }, { status: 409 });
    if (user.gender !== "male" && user.gender !== "female") return Response.json({ error: "Your verified hostel eligibility is missing. Contact the hostel office." }, { status: 409 });
    const studentGender = user.gender;

    const db = getDb();
    const booking = await db.transaction(async (tx) => {
      const [settings] = await tx.select().from(bookingSettings).where(eq(bookingSettings.id, "current")).limit(1);
      const now = new Date();
      if (!settings) throw new Response("The hostel office has not configured a booking window yet.", { status: 409 });
      if (now < settings.opensAt || now > settings.closesAt) throw new Response("Booking is currently closed.", { status: 409 });

      const [existing] = await tx.select({ id: bookingApplications.id }).from(bookingApplications).where(and(
        eq(bookingApplications.studentId, user.id),
        eq(bookingApplications.academicYear, settings.academicYear),
        eq(bookingApplications.status, "approved"),
      )).limit(1);
      if (existing) throw new Response(`You already have a hostel booking for academic year ${settings.academicYear}.`, { status: 409 });

      const candidates = await tx.select({
        hostelId: hostels.id, hostelName: hostels.name,
        roomId: hostelRooms.id, roomNo: hostelRooms.roomNo, capacity: hostelRooms.capacity,
      }).from(hostels).innerJoin(hostelRooms, eq(hostelRooms.hostelId, hostels.id))
        .where(and(
          eq(hostels.gender, studentGender), eq(hostels.active, true), eq(hostelRooms.active, true),
        )).orderBy(sql`random()`);

      let selected: (typeof candidates)[number] | undefined;
      for (const candidate of candidates) {
        await tx.execute(sql`SELECT id FROM hostel_rooms WHERE id = ${candidate.roomId} FOR UPDATE`);
        const [occupied] = await tx.select({ value: count() }).from(roomAssignments).where(and(
          eq(roomAssignments.active, true), ne(roomAssignments.studentId, user.id), or(
            eq(roomAssignments.roomId, candidate.roomId),
            and(isNull(roomAssignments.roomId), eq(roomAssignments.hostel, candidate.hostelName), eq(roomAssignments.room, candidate.roomNo)),
          ),
        ));
        if (occupied.value < candidate.capacity) {
          selected = candidate;
          break;
        }
      }
      if (!selected) throw new Response("No suitable hostel room has an available bed. Contact the hostel office.", { status: 409 });

      const confirmationNo = `MUB-HT-${randomBytes(5).toString("hex").toUpperCase()}`;
      const [application] = await tx.insert(bookingApplications).values({
        studentId: user.id,
        semester: `Academic Year ${settings.academicYear}`,
        academicYear: settings.academicYear,
        gender: studentGender,
        status: "approved",
        hostelId: selected.hostelId,
        roomId: selected.roomId,
        confirmationNo,
        reviewedAt: now,
      }).returning();

      await tx.update(roomAssignments).set({ active: false }).where(and(
        eq(roomAssignments.studentId, user.id), eq(roomAssignments.active, true),
      ));
      await tx.insert(roomAssignments).values({
        studentId: user.id, applicationId: application.id, roomId: selected.roomId,
        hostel: selected.hostelName, room: selected.roomNo,
      });
      return { application, hostel: selected.hostelName, room: selected.roomNo };
    });

    let emailSent = false;
    try {
      emailSent = await sendBookingConfirmation({
        email: user.email, name: user.name,
        academicYear: booking.application.academicYear!, hostel: booking.hostel,
        room: booking.room, confirmationNo: booking.application.confirmationNo!,
      });
    } catch (error) {
      console.error("Booking confirmation email failed:", error);
    }
    return Response.json({ ...booking.application, hostelName: booking.hostel, roomNo: booking.room, emailSent }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return Response.json({ error: await error.text() }, { status: error.status });
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return Response.json({ error: "You already have a hostel booking for this academic year." }, { status: 409 });
    }
    console.error("Booking failed:", error);
    return Response.json({ error: "Unable to complete your booking." }, { status: 500 });
  }
}