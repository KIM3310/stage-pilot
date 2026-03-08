import { createServer } from "node:net";
import { describe } from "vitest";

async function canBindLocalSocket(): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const server = createServer();
    const timeout = setTimeout(() => {
      server.close();
      resolve(false);
    }, 300);

    server.once("error", () => {
      clearTimeout(timeout);
      resolve(false);
    });

    server.listen(0, "127.0.0.1", () => {
      clearTimeout(timeout);
      server.close(() => resolve(true));
    });
  });
}

export const describeIfSocketBinding = (await canBindLocalSocket())
  ? describe
  : describe.skip;
