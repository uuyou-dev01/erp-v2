import { processNotificationOutbox } from "../lib/mobile/notification-outbox";

processNotificationOutbox({ limit: 200 })
  .then((result) => process.stdout.write(`${JSON.stringify({ processed: result.length, result }, null, 2)}\n`))
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
