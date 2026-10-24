import { SnippetStore } from "./core/store.js";
import { loadConfig, resolveDataDir, ensureDataDir } from "./core/config.js";
import { search } from "./core/search.js";
import { parseBundle, serializeBundle, inferFormat } from "./core/transfer.js";
import { StoreError } from "./core/errors.js";
import { randomId } from "./core/id.js";
import type {
  ExportBundle,
  ListOptions,
  NewSnippet,
  Snippet,
  SnippetPatch,
  SortMode,
  StoreData,
} from "./core/types.js";
import type { SearchHit } from "./core/search.js";
import type { DeugalConfig } from "./core/config.js";
import type { TransferFormat } from "./core/transfer.js";

export {
  SnippetStore,
  loadConfig,
  resolveDataDir,
  ensureDataDir,
  search,
  parseBundle,
  serializeBundle,
  inferFormat,
  StoreError,
  randomId,
};
export type {
  ExportBundle,
  ListOptions,
  NewSnippet,
  Snippet,
  SnippetPatch,
  SortMode,
  StoreData,
  SearchHit,
  DeugalConfig,
  TransferFormat,
};
