export type StorageAuditIssueGroup =
  | "MATERIAL_FILE"
  | "METADATA_JSON"
  | "DERIVATIVE_FILE"
  | "AI_FRAME_INPUT"
  | "PROCESSING_TEMP_FILE"
  | "CATEGORY_DIRECTORY"
  | "INGESTION_JOB_SOURCE";

export type StorageAuditSeverity = "info" | "warning" | "error";

export type StorageSafeFixAction =
  | "REWRITE_MATERIAL_METADATA"
  | "FIX_MATERIAL_ABSOLUTE_PATH"
  | "WRITE_CATEGORY_METADATA"
  | "MARK_DERIVATIVE_FAILED"
  | "BACKFILL_THUMBNAIL_PATH"
  | "REBUILD_SEARCH_TEXT";

export type StorageAuditIssue = {
  id: string;
  group: StorageAuditIssueGroup;
  type: string;
  severity: StorageAuditSeverity;
  safeFixable?: boolean;
  fixAction?: StorageSafeFixAction;
  materialId?: string;
  fileName?: string;
  relativePath?: string;
  message: string;
  details?: Record<string, unknown>;
};

export type StorageAuditCounts = {
  materials: number;
  mediaFiles: number;
  metadataFiles: number;
  derivativeFiles: number;
  categories: number;
  ingestionJobs: number;
  aiAnalysisJobs: number;
  issues: number;
  totalIssues: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  safeFixableCount: number;
  byGroup: Record<StorageAuditIssueGroup, number>;
};

export type StorageAuditReport = {
  scannedAt: string;
  storageRoot: string;
  counts: StorageAuditCounts;
  issues: StorageAuditIssue[];
};

export type StorageSafeFixResultItem = {
  issueId: string;
  type?: string;
  message: string;
};

export type StorageSafeFixResult = {
  fixed: StorageSafeFixResultItem[];
  skipped: StorageSafeFixResultItem[];
  failed: StorageSafeFixResultItem[];
  message: string;
};
