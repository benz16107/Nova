import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

type ReaderConfigResponse = {
  readerId: string;
  roomId: string | null;
};

function parseArg(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return fallback;
}

const serverUrl = parseArg("--server", process.env.NOVA_SERVER_URL || "http://localhost:3000").replace(/\/$/, "");
let currentReaderId = parseArg("--reader", "reader-1");

async function getReaderConfig(readerId: string): Promise<ReaderConfigResponse> {
  const res = await fetch(`${serverUrl}/api/nfc/reader-config/${encodeURIComponent(readerId)}`);
  if (!res.ok) {
    throw new Error(`GET reader-config failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as ReaderConfigResponse;
}

async function setReaderRoom(readerId: string, roomId: string): Promise<void> {
  const res = await fetch(`${serverUrl}/api/nfc/reader-config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ readerId, roomId }),
  });
  if (!res.ok) {
    throw new Error(`POST reader-config failed: ${res.status} ${await res.text()}`);
  }
}

async function clearReaderRoom(readerId: string): Promise<void> {
  const res = await fetch(`${serverUrl}/api/nfc/reader-config/${encodeURIComponent(readerId)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(`DELETE reader-config failed: ${res.status} ${await res.text()}`);
  }
}

async function listReaders(): Promise<void> {
  const res = await fetch(`${serverUrl}/api/nfc/reader-config`);
  if (!res.ok) {
    throw new Error(`GET reader-config list failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { readers: Array<{ readerId: string; roomId: string }> };
  if (data.readers.length === 0) {
    console.log("No reader assignments yet.");
    return;
  }
  for (const reader of data.readers) {
    console.log(`- ${reader.readerId} => room ${reader.roomId}`);
  }
}

function printHelp(): void {
  console.log("Commands:");
  console.log("  show                      Show current reader room assignment");
  console.log("  set <roomId>              Assign current reader to room");
  console.log("  reader <readerId>         Switch active reader id in this terminal");
  console.log("  clear                     Clear assignment for current reader");
  console.log("  list                      List all assigned readers");
  console.log("  help                      Show this help");
  console.log("  exit                      Quit");
}

async function main(): Promise<void> {
  console.log(`Reader CLI connected to ${serverUrl}`);
  console.log(`Active reader: ${currentReaderId}`);
  printHelp();

  const rl = readline.createInterface({ input, output });
  try {
    while (true) {
      const line = (await rl.question(`reader:${currentReaderId}> `)).trim();
      if (!line) continue;
      const [command, ...rest] = line.split(/\s+/);

      try {
        if (command === "exit" || command === "quit") {
          break;
        }
        if (command === "help") {
          printHelp();
          continue;
        }
        if (command === "reader") {
          const nextReader = rest[0]?.trim();
          if (!nextReader) {
            console.log("Usage: reader <readerId>");
            continue;
          }
          currentReaderId = nextReader;
          console.log(`Active reader set to ${currentReaderId}`);
          continue;
        }
        if (command === "show") {
          const cfg = await getReaderConfig(currentReaderId);
          console.log(`${cfg.readerId} => ${cfg.roomId ?? "(no override)"}`);
          continue;
        }
        if (command === "set") {
          const roomId = rest[0]?.trim();
          if (!roomId) {
            console.log("Usage: set <roomId>");
            continue;
          }
          await setReaderRoom(currentReaderId, roomId);
          console.log(`Assigned ${currentReaderId} => room ${roomId}`);
          continue;
        }
        if (command === "clear") {
          await clearReaderRoom(currentReaderId);
          console.log(`Cleared assignment for ${currentReaderId}`);
          continue;
        }
        if (command === "list") {
          await listReaders();
          continue;
        }

        console.log("Unknown command. Type 'help'.");
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
      }
    }
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
