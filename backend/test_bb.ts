import "dotenv/config";

const DEFAULT_BASE = "https://app.backboard.io/api";

function headers() {
    return {
        "X-API-Key": process.env.BACKBOARD_API_KEY || "",
        "Content-Type": "application/json",
    };
}

async function test() {
    const assistantsRes = await fetch(`${DEFAULT_BASE}/assistants`, { headers: headers() });
    const assistantsList = await assistantsRes.json();
    const assistantId = assistantsList.assistants[0].assistant_id || assistantsList.assistants[0].id;
    console.log("Using assistant:", assistantId);

    console.log("\\nTesting POST /assistants/:id/memories...");
    const postRes = await fetch(`${DEFAULT_BASE}/assistants/${assistantId}/memories`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
            content: "Guest prefers extra pillows",
            metadata: { guest_id: "test1", room_id: "101" }
        })
    });
    console.log(postRes.status, await postRes.text());

    console.log("\\nTesting GET /assistants/:id/memories...");
    const getRes = await fetch(`${DEFAULT_BASE}/assistants/${assistantId}/memories`, { headers: headers() });
    console.log(getRes.status, await getRes.text());
}

test();
