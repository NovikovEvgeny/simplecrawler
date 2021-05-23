
import { Server, routes } from "../util";


export const server = new Server(routes);

export default async function() {
  await new Promise<void>((resolve) => server.listen(3000, resolve));
}


