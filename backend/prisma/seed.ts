import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Room IDs for 3 floors: [6, 6, 4] → 101-106, 201-206, 301-304 */
const ROOM_IDS = [
  "101", "102", "103", "104", "105", "106",
  "201", "202", "203", "204", "205", "206",
  "301", "302", "303", "304",
];

const ROOMS_PER_FLOOR = [6, 6, 4];

async function main() {
  // 1. Hotel layout (floors) — dashboard uses this for room map
  await prisma.setting.upsert({
    where: { key: "hotel_layout" },
    create: { key: "hotel_layout", value: JSON.stringify({ roomsPerFloor: ROOMS_PER_FLOOR }) },
    update: { value: JSON.stringify({ roomsPerFloor: ROOMS_PER_FLOOR }) },
  });

  // 2. Rooms
  const roomIdToRoom: Record<string, { id: string; roomId: string }> = {};
  for (const roomId of ROOM_IDS) {
    const room = await prisma.room.upsert({
      where: { roomId },
      create: { roomId },
      update: {},
    });
    roomIdToRoom[roomId] = { id: room.id, roomId: room.roomId };
  }

  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

  // 3. Guests — mix of reserved, checked-in, and archived

  // Reserved (not checked in)
  const r301 = roomIdToRoom["301"].id;
  await prisma.guest.upsert({
    where: { id: "seed-guest-301" },
    create: {
      id: "seed-guest-301",
      firstName: "Alex",
      lastName: "Rivera",
      roomId: r301,
      checkedIn: false,
      archived: false,
    },
    update: {},
  });
  await prisma.guest.upsert({
    where: { id: "seed-guest-302" },
    create: {
      id: "seed-guest-302",
      firstName: "Sam",
      lastName: "Chen",
      roomId: roomIdToRoom["302"].id,
      checkedIn: false,
      archived: false,
    },
    update: {},
  });

  // Checked-in (for guest app demo and checkout flow)
  const r101 = roomIdToRoom["101"].id;
  const r102 = roomIdToRoom["102"].id;
  const r103 = roomIdToRoom["103"].id;
  const r104 = roomIdToRoom["104"].id;

  await prisma.guest.upsert({
    where: { id: "seed-guest-101a" },
    create: {
      id: "seed-guest-101a",
      firstName: "Jane",
      lastName: "Smith",
      roomId: r101,
      checkedIn: true,
      checkedInAt: oneDayAgo,
      archived: false,
    },
    update: {},
  });
  await prisma.guest.upsert({
    where: { id: "seed-guest-101b" },
    create: {
      id: "seed-guest-101b",
      firstName: "Morgan",
      lastName: "Smith",
      roomId: r101,
      checkedIn: true,
      checkedInAt: oneDayAgo,
      archived: false,
    },
    update: {},
  });
  await prisma.guest.upsert({
    where: { id: "seed-guest-102" },
    create: {
      id: "seed-guest-102",
      firstName: "John",
      lastName: "Doe",
      roomId: r102,
      checkedIn: true,
      checkedInAt: oneDayAgo,
      archived: false,
    },
    update: {},
  });
  await prisma.guest.upsert({
    where: { id: "seed-guest-103" },
    create: {
      id: "seed-guest-103",
      firstName: "Emma",
      lastName: "Wilson",
      roomId: r103,
      checkedIn: true,
      checkedInAt: oneDayAgo,
      archived: false,
    },
    update: {},
  });
  await prisma.guest.upsert({
    where: { id: "seed-guest-104a" },
    create: {
      id: "seed-guest-104a",
      firstName: "James",
      lastName: "Brown",
      roomId: r104,
      checkedIn: true,
      checkedInAt: oneDayAgo,
      archived: false,
    },
    update: {},
  });
  await prisma.guest.upsert({
    where: { id: "seed-guest-104b" },
    create: {
      id: "seed-guest-104b",
      firstName: "Lisa",
      lastName: "Brown",
      roomId: r104,
      checkedIn: true,
      checkedInAt: oneDayAgo,
      archived: false,
    },
    update: {},
  });

  // Archived (checked out) — for archived list, restore, delete, feedback
  await prisma.guest.upsert({
    where: { id: "seed-guest-201" },
    create: {
      id: "seed-guest-201",
      firstName: "Maria",
      lastName: "Garcia",
      roomId: roomIdToRoom["201"].id,
      checkedIn: true,
      checkedOut: true,
      checkedOutAt: twoDaysAgo,
      archived: true,
      archivedVia: "check_out",
    },
    update: {},
  });
  await prisma.guest.upsert({
    where: { id: "seed-guest-202" },
    create: {
      id: "seed-guest-202",
      firstName: "David",
      lastName: "Lee",
      roomId: roomIdToRoom["202"].id,
      checkedIn: true,
      checkedOut: true,
      checkedOutAt: twoDaysAgo,
      archived: true,
      archivedVia: "check_out",
    },
    update: {},
  });
  await prisma.guest.upsert({
    where: { id: "seed-guest-203" },
    create: {
      id: "seed-guest-203",
      firstName: "Sarah",
      lastName: "Kim",
      roomId: roomIdToRoom["203"].id,
      checkedIn: true,
      checkedOut: true,
      checkedOutAt: oneDayAgo,
      archived: true,
      archivedVia: "check_out",
    },
    update: {},
  });
  await prisma.guest.upsert({
    where: { id: "seed-guest-204a" },
    create: {
      id: "seed-guest-204a",
      firstName: "Tom",
      lastName: "White",
      roomId: roomIdToRoom["204"].id,
      checkedIn: true,
      checkedOut: true,
      checkedOutAt: oneDayAgo,
      archived: true,
      archivedVia: "check_out",
    },
    update: {},
  });
  await prisma.guest.upsert({
    where: { id: "seed-guest-204b" },
    create: {
      id: "seed-guest-204b",
      firstName: "Chris",
      lastName: "White",
      roomId: roomIdToRoom["204"].id,
      checkedIn: true,
      checkedOut: true,
      checkedOutAt: oneDayAgo,
      archived: true,
      archivedVia: "check_out",
    },
    update: {},
  });

  // 4. Requests — open and closed, request and complaint (Activity, AI digest)
  const requestData = [
    { id: "seed-req-1", guestId: "seed-guest-104a", roomId: "104", type: "request", description: "Extra towels and toiletries", status: "open", createdAt: now },
    { id: "seed-req-2", guestId: "seed-guest-104a", roomId: "104", type: "complaint", description: "AC was noisy first night", status: "closed", closedAt: now, createdAt: oneDayAgo },
    { id: "seed-req-3", guestId: "seed-guest-102", roomId: "102", type: "request", description: "Wake-up call at 7 AM", status: "closed", closedAt: now, createdAt: oneDayAgo },
    { id: "seed-req-4", guestId: "seed-guest-103", roomId: "103", type: "request", description: "Room service — dinner for two", status: "open", createdAt: now },
    { id: "seed-req-5", guestId: "seed-guest-201", roomId: "201", type: "complaint", description: "Late housekeeping", status: "closed", closedAt: twoDaysAgo, createdAt: twoDaysAgo },
    { id: "seed-req-6", guestId: "seed-guest-204a", roomId: "204", type: "request", description: "Late checkout requested", status: "closed", closedAt: oneDayAgo, createdAt: oneDayAgo },
  ];
  for (const r of requestData) {
    await prisma.request.upsert({
      where: { id: r.id },
      create: r,
      update: {},
    });
  }

  // 5. Feedback — for archived guests (Feedback tab)
  const feedbackData = [
    { id: "seed-fb-1", guestId: "seed-guest-201", roomId: "201", content: "Great stay overall. Would recommend the breakfast buffet.", source: "text", createdAt: twoDaysAgo },
    { id: "seed-fb-2", guestId: "seed-guest-204a", roomId: "204", content: "Comfortable room. Staff was very helpful with late checkout.", source: "text", createdAt: oneDayAgo },
  ];
  for (const f of feedbackData) {
    await prisma.feedback.upsert({
      where: { id: f.id },
      create: f,
      update: {},
    });
  }

  console.log("Demo seed complete: hotel layout, 16 rooms, guests (reserved / checked-in / archived), requests, feedback.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
