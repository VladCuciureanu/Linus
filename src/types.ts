/** A single comment extracted from a late-night commit. */
export interface LateNightComment {
  hash: string;
  author: string;
  authorEmail: string;
  date: Date;
  localHour: number;
  localMinute: number;
  filePath: string;
  lineNumber: number;
  comment: string;
  language: string;
}

/** Parsed CLI options. */
export interface CliOptions {
  repoPath: string;
  after: { hour: number; minute: number };
  before: { hour: number; minute: number };
  author?: string;
  since?: string;
  until?: string;
  pathGlob?: string;
  grep?: RegExp;
  minLength: number;
  maxCommits?: number;
  allBranches: boolean;
  json: boolean;
  stats: boolean;
  noColor: boolean;
  help: boolean;
  version: boolean;
}

/** Metadata parsed from a commit header in git log output. */
export interface CommitMeta {
  hash: string;
  author: string;
  authorEmail: string;
  dateIso: string;
  localHour: number;
  localMinute: number;
  date: Date;
}

/** A single added line from a diff hunk. */
export interface AddedLine {
  filePath: string;
  lineNumber: number;
  content: string;
}

/** A parsed diff for one commit, grouped by file. */
export interface CommitDiff {
  meta: CommitMeta;
  addedLines: AddedLine[];
}
