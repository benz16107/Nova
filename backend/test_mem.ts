import { addMemory, getMemoriesForGuest, getAllMemoriesRaw } from "./src/backboard";

async function test() {
    const guestId = "seed-guest-301";

    console.log("Adding memory...");
    await addMemory(guestId, "301", "This is a test memory from step 614");

    console.log("Fetching raw memories...");
    const raw = await getAllMemoriesRaw();
    console.log("Raw count:", raw.length);
    console.log("Raw items:", JSON.stringify(raw.slice(0, 3), null, 2));

    console.log("Fetching guest memories...");
    const guestMems = await getMemoriesForGuest(guestId);
    console.log("Guest memories:", guestMems);
}

test().catch(console.error);
