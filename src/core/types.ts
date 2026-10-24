export interface Snippet {
  id: string;
  title: string;
  description?: string;
  content: string;
  language?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  useCount: number;
  lastUsedAt?: string;
  pinned?: boolean;
}

export interface NewSnippet {
  title: string;
  content: string;
  description?: string;
  language?: string;
  tags: string[];
}

export interface SnippetPatch {
  title?: string;
  content?: string;
  description?: string;
  language?: string;
  tags?: string[];
}

export interface StoreData {
  version: 1;
  snippets: Snippet[];
}

export type SortMode = "recent" | "created" | "used" | "alpha";

export interface ListOptions {
  tags?: string[] | undefined;
  sort?: SortMode | undefined;
  limit?: number | undefined;
}

export interface ExportBundle {
  deugal: 1;
  exportedAt: string;
  snippets: Snippet[];
}
