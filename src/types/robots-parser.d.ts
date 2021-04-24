declare module 'robots-parser' {
  export default function(url: string, contents: string[]): RobotsParser;

  export interface RobotsParser {
    isAllowed(url: string, ua: string): boolean;
    getCrawlDelay(url: string): number;
    getSitemaps(): string[];
    getPreferredHost(): string;
  }
}



