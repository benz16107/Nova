// Reset all room unlocks (used on backend boot)
export async function resetAllRoomUnlocks(): Promise<void> {
  await writeRoomUnlockMap({});
}
import { prisma } from "./db.js";

const ROOM_UNLOCK_SETTING_KEY = "room_unlock_map_v1";

type RoomUnlockMap = Record<string, { unlockedAt: string; cardUid?: string | null }>;

async function readRoomUnlockMap(): Promise<RoomUnlockMap> {
  const setting = await prisma.setting.findUnique({ where: { key: ROOM_UNLOCK_SETTING_KEY } });
  if (!setting?.value) return {};
  try {
    const parsed = JSON.parse(setting.value) as RoomUnlockMap;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

async function writeRoomUnlockMap(map: RoomUnlockMap): Promise<void> {
  await prisma.setting.upsert({
    where: { key: ROOM_UNLOCK_SETTING_KEY },
    create: { key: ROOM_UNLOCK_SETTING_KEY, value: JSON.stringify(map) },
    update: { value: JSON.stringify(map) },
  });
}

export async function isRoomUnlocked(roomId: string): Promise<boolean> {
  const map = await readRoomUnlockMap();
  return !!map[roomId];
}

export async function unlockRoom(roomId: string, cardUid?: string): Promise<void> {
  const map = await readRoomUnlockMap();
  map[roomId] = {
    unlockedAt: new Date().toISOString(),
    cardUid: cardUid?.trim() || null,
  };
  await writeRoomUnlockMap(map);
}

export async function lockRoom(roomId: string): Promise<void> {
  const map = await readRoomUnlockMap();
  if (!map[roomId]) return;
  delete map[roomId];
  await writeRoomUnlockMap(map);
}
