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

export interface QueuedRequest {
  requestedBy: string;
  url: string;
}
