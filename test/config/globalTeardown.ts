import { server } from "./globalSetup";

export default async function() {
  await new Promise<void>((resolve, reject) => {
    server.destroy((err?: Error) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}
