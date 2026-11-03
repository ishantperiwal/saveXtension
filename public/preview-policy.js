// Keep the mounted-card horizon and preview queue in step as the reader scrolls.
export const PRELOAD_SCREENS = 4;
export const MAX_PREVIEW_LOADS = 6;
// Previews already loading may finish in these extra slots while still near the
// screen, instead of being thrown away and restarted when the reader scrolls back.
export const FINISHING_PREVIEW_LOADS = 4;
