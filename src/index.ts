import { Crawler } from "./crawler";


export { FetchQueue as queue } from "./queue";
export { Cache as cache } from "./cache";

export function crawl() {
    throw new Error(
        "Crawler.crawl is deprecated as of version 1.0.0! " +
        "You can now pass a single URL directly to the constructor. " +
        "See the documentation for more details!"
    );
};


export default Crawler;
