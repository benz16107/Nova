import { addMemory, getMemoriesForGuest, getAllMemoriesRaw, memorySummary } from "./src/backboard";

async function test() {
    const guestId = "seed-guest-101a";

    console.log("Fetching guest memories via function...");
    const guestMems = await getMemoriesForGuest(guestId);
    console.log("Memory Summary prompt:");
    console.log(memorySummary(guestMems));
}

test().catch(console.error);
