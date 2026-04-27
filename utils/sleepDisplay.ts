export function formatSleepLocationWithNote(
  location?: string | null,
  note?: string | null,
) {
  const cleanLocation = typeof location === "string" ? location.trim() : "";
  const cleanNote = typeof note === "string" ? note.trim() : "";

  if (!cleanLocation) return cleanNote || undefined;
  if (!cleanNote) return cleanLocation;
  if (cleanLocation === "autre") return cleanNote;
  return `${cleanLocation} - ${cleanNote}`;
}
