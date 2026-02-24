import { NewsArticle } from "./types";

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function parseRssItems(xml: string): NewsArticle[] {
  const items: NewsArticle[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];

    const title = itemXml.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "";
    const link = itemXml.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "";
    const pubDate = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "";
    const source = itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? "";

    if (title) {
      items.push({
        title: decodeHtmlEntities(title.trim()),
        source: decodeHtmlEntities(source.trim()),
        pubDate: pubDate.trim(),
        link: link.trim(),
      });
    }
  }

  return items;
}

function isWithinLastDays(pubDate: string, days: number): boolean {
  const date = new Date(pubDate);
  if (isNaN(date.getTime())) return false;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return date.getTime() >= cutoff;
}

export async function getTeamNews(teamName: string): Promise<NewsArticle[]> {
  try {
    const query = encodeURIComponent(teamName + " football");
    const url = `https://news.google.com/rss/search?q=${query}&hl=fr&gl=FR&ceid=FR:fr`;

    const response = await fetch(url, { next: { revalidate: 10800 } });

    if (!response.ok) {
      console.warn(`News RSS fetch failed for "${teamName}": ${response.status}`);
      return [];
    }

    const xml = await response.text();
    const items = parseRssItems(xml);

    return items
      .filter((item) => isWithinLastDays(item.pubDate, 7))
      .slice(0, 5);
  } catch (error) {
    console.warn(`News RSS error for "${teamName}":`, error);
    return [];
  }
}
