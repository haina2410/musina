import type { Readable } from 'node:stream';

export interface Track {
  canonicalUrl: string;
  durationSeconds: number | null;
  requestedBy: string;
  source: 'youtube' | 'soundcloud';
  title: string;
}

export interface ResolvedAudio {
  cleanup: () => void;
  stream: Readable;
  track: Track;
}

export interface SearchCandidate {
  durationSeconds: number | null;
  title: string;
  url: string;
}

export interface QueuedRequest {
  requestedBy: string;
  url: string;
}
