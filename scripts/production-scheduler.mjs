const baseUrl = process.env.ERP_INTERNAL_BASE_URL || "http://app:3000";
const cronSecret = process.env.MOBILE_CRON_SECRET;
const fxToken = process.env.FX_SYNC_TOKEN;

if (!cronSecret || !fxToken) {
  throw new Error("scheduler requires MOBILE_CRON_SECRET and FX_SYNC_TOKEN");
}

let lastRetentionDay = "";
let lastFxDay = "";
let running = false;

async function invoke(path, token, method = "POST") {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(55_000),
  });
  if (!response.ok) {
    throw new Error(`${method} ${path} failed with ${response.status}`);
  }
  process.stdout.write(`${new Date().toISOString()} ${method} ${path} ok\n`);
}

async function tick() {
  if (running) return;
  running = true;
  try {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  await invoke("/api/v1/internal/mobile/notification-outbox", cronSecret).catch((error) =>
    process.stderr.write(`${new Date().toISOString()} ${error.message}\n`)
  );

  if (now.getHours() === 3 && now.getMinutes() >= 20 && lastRetentionDay !== day) {
    await invoke("/api/v1/internal/mobile/retention", cronSecret)
      .then(() => { lastRetentionDay = day; })
      .catch((error) => process.stderr.write(`${new Date().toISOString()} ${error.message}\n`));
  }

  if (now.getHours() === 4 && now.getMinutes() >= 0 && lastFxDay !== day) {
    await invoke("/api/fx/daily", fxToken, "GET")
      .then(() => { lastFxDay = day; })
      .catch((error) => process.stderr.write(`${new Date().toISOString()} ${error.message}\n`));
  }
  } finally {
    running = false;
  }
}

await tick();
setInterval(() => void tick(), 60_000);
