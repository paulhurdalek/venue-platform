export interface OccupancySchedule {
  technicalGetInMinutes: number | null;
  artistGetInMinutes: number | null;
  doorsMinutes: number | null;
  startMinutes: number | null;
  endMinutes: number | null;
}

export interface LocalOccupancyInterval {
  date: string;
  startMinutes: number;
  endMinutes: number;
}

export function eventOccupancyInterval(
  date: string,
  schedule: OccupancySchedule,
): LocalOccupancyInterval | undefined {
  const starts = [
    schedule.technicalGetInMinutes,
    schedule.artistGetInMinutes,
    schedule.doorsMinutes,
    schedule.startMinutes,
  ].filter((value): value is number => value !== null);
  if (starts.length === 0 || schedule.endMinutes === null) return undefined;
  const startMinutes = Math.min(...starts);
  if (schedule.endMinutes <= startMinutes) return undefined;
  return { date, startMinutes, endMinutes: schedule.endMinutes };
}

export function intervalsOverlap(
  left: Pick<LocalOccupancyInterval, 'startMinutes' | 'endMinutes'>,
  right: Pick<LocalOccupancyInterval, 'startMinutes' | 'endMinutes'>,
): boolean {
  return left.startMinutes < right.endMinutes && left.endMinutes > right.startMinutes;
}

export function localOccupancyTimestamp(date: string, minutes: number): Date {
  const midnight = Date.parse(`${date}T00:00:00.000Z`);
  return new Date(midnight + minutes * 60_000);
}

export function isCompleteOccupancy(schedule: OccupancySchedule): boolean {
  return eventOccupancyInterval('2000-01-01', schedule) !== undefined;
}
