import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import type {
  Annotation,
  AnnotationInput,
  Book,
  BookEdit,
  Collection,
  ImportReport,
  LibraryStats,
  SyncReport,
} from "@/types";

/**
 * The single contract between the UI and Rust. Components import from here so
 * a renamed command breaks in one file instead of twenty.
 */
export const ipc = {
  listBooks: () => invoke<Book[]>("list_books"),
  getBook: (id: string) => invoke<Book>("get_book", { id }),
  openBook: (id: string) => invoke<Book>("open_book", { id }),
  importFiles: (files: string[]) => invoke<ImportReport>("import_files", { files }),
  importFolder: (folder: string) => invoke<ImportReport>("import_folder", { folder }),
  deleteBook: (id: string) => invoke<void>("delete_book", { id }),
  updateBook: (id: string, edit: BookEdit) => invoke<Book>("update_book", { id, edit }),
  setProgress: (id: string, percent: number, location: string | null) =>
    invoke<void>("set_progress", { id, percent, location }),
  setFinished: (id: string, finished: boolean) => invoke<Book>("set_finished", { id, finished }),
  setPageCount: (id: string, pages: number) => invoke<void>("set_page_count", { id, pages }),
  setBookCover: (id: string, data: string) => invoke<string>("set_book_cover", { id, data }),
  supportedExtensions: () => invoke<string[]>("supported_extensions"),

  bookFilePath: (id: string) => invoke<string>("book_file_path", { id }),
  coversDir: () => invoke<string>("covers_dir"),

  comicPageCount: (id: string) => invoke<number>("comic_page_count", { id }),
  comicPage: (id: string, index: number) => invoke<ArrayBuffer>("comic_page", { id, index }),
  documentHtml: (id: string) => invoke<string>("document_html", { id }),

  listAnnotations: (bookId: string) => invoke<Annotation[]>("list_annotations", { bookId }),
  listAllAnnotations: () => invoke<Annotation[]>("list_all_annotations"),
  saveAnnotation: (input: AnnotationInput) => invoke<Annotation>("save_annotation", { input }),
  deleteAnnotation: (id: string) => invoke<void>("delete_annotation", { id }),
  exportAnnotationsMarkdown: (bookId: string) =>
    invoke<string>("export_annotations_markdown", { bookId }),

  listCollections: () => invoke<Collection[]>("list_collections"),
  createCollection: (name: string) => invoke<string>("create_collection", { name }),
  renameCollection: (id: string, name: string) => invoke<void>("rename_collection", { id, name }),
  deleteCollection: (id: string) => invoke<void>("delete_collection", { id }),
  setCollectionMembership: (bookId: string, collectionId: string, member: boolean) =>
    invoke<void>("set_collection_membership", { bookId, collectionId, member }),

  getSettings: () => invoke<Record<string, string>>("get_settings"),
  setSetting: (key: string, value: string) => invoke<void>("set_setting", { key, value }),

  recordReading: (bookId: string, seconds: number) =>
    invoke<void>("record_reading", { bookId, seconds }),
  getStats: () => invoke<LibraryStats>("get_stats"),

  getSyncFolder: () => invoke<string | null>("get_sync_folder"),
  setSyncFolder: (folder: string | null) => invoke<void>("set_sync_folder", { folder }),
  syncNow: () => invoke<SyncReport>("sync_now"),
  exportSyncBundle: (file: string) => invoke<void>("export_sync_bundle", { file }),
  importSyncBundle: (file: string) => invoke<SyncReport>("import_sync_bundle", { file }),
};

/**
 * EPUB and PDF are handed to their renderers as asset URLs rather than as IPC
 * payloads — a 400 MB PDF would otherwise be copied through JSON.
 */
export async function bookAssetUrl(id: string): Promise<string> {
  return convertFileSrc(await ipc.bookFilePath(id));
}

let coversDirPromise: Promise<string> | null = null;

/**
 * Cover URLs are built in the frontend from one cached directory lookup —
 * asking Rust for each path would mean an IPC call per shelf tile.
 */
export async function coverUrl(cover: string): Promise<string> {
  coversDirPromise ??= ipc.coversDir();
  const dir = await coversDirPromise;
  const separator = dir.includes("\\") ? "\\" : "/";
  return convertFileSrc(`${dir}${separator}${cover}`);
}

/** Errors from Rust arrive as plain strings; anything else is a real bug. */
export function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
