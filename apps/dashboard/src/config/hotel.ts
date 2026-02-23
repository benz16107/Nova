/**
 * Hotel layout: define how many rooms each floor has.
 * Room numbering: floor 1 → 101, 102, … ; floor 2 → 201, 202, … ; etc.
 * Index 0 = floor 1, index 1 = floor 2, and so on.
 */

/** Default when no settings saved. E.g. [6, 4, 6, 8] = floor 1 has 6 rooms, etc. */
export const DEFAULT_ROOMS_PER_FLOOR: number[] = [6, 4, 6, 8];

/** Number of rooms per floor (alias for default). */
export const ROOMS_PER_FLOOR: number[] = DEFAULT_ROOMS_PER_FLOOR;

/** Build room ID list from a rooms-per-floor array. */
export function getRoomIdListFromConfig(roomsPerFloor: number[]): string[] {
  const list: string[] = [];
  roomsPerFloor.forEach((count, i) => {
    const floor = i + 1;
    for (let room = 1; room <= count; room++) {
      list.push(`${floor}${String(room).padStart(2, "0")}`);
    }
  });
  return list;
}

/** Room IDs grouped by floor from a rooms-per-floor array. */
export function getRoomsByFloorFromConfig(roomsPerFloor: number[]): { floor: number; roomIds: string[] }[] {
  return roomsPerFloor.map((count, i) => {
    const floor = i + 1;
    const roomIds: string[] = [];
    for (let room = 1; room <= count; room++) {
      roomIds.push(`${floor}${String(room).padStart(2, "0")}`);
    }
    return { floor, roomIds };
  });
}

/** Generates the list of valid room IDs (uses default config). */
export function getRoomIdList(): string[] {
  return getRoomIdListFromConfig(ROOMS_PER_FLOOR);
}

/** Room IDs grouped by floor (uses default config). */
export function getRoomsByFloor(): { floor: number; roomIds: string[] }[] {
  return getRoomsByFloorFromConfig(ROOMS_PER_FLOOR);
}
