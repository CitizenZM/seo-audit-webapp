declare module 'googlethis' {
  interface SearchResult {
    results?: { title: string; url: string; description?: string }[];
    people_also_ask?: string[];
    people_also_search?: { title?: string }[];
  }
  export function search(query: string, options?: Record<string, unknown>): Promise<SearchResult>;
  const _default: { search: typeof search };
  export default _default;
}
