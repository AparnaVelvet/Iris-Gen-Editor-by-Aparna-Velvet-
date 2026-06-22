export interface SubtitleBlock {
  id: number;
  startText: string;
  endText: string;
  start: number; // in seconds
  end: number;   // in seconds
  text: string;
}

export interface VideoClip {
  id: number | string;
  url: string;
  name: string;
  preview: string;
  width: number;
  height: number;
}

export interface TimelineClip {
  blockId: number;
  text: string;
  start: number;
  end: number;
  duration: number;
  keywords: string[];
  video: VideoClip;
  simulated: boolean;
}

export interface ConsoleMessage {
  id: string;
  timestamp: string;
  text: string;
  type: "info" | "success" | "warning" | "error" | "gemini";
}

export interface ScriptConfig {
  audioPath: string;
  srtPath: string;
  outputVideoPath: string;
  isVertical: boolean;
  pexelsKey: string;
}
