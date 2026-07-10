// Public rider departure schedule (no auth): hubs → corridors → weekday/time.
import { apiGet } from './client';

export interface ScheduleEntry {
  id: string;
  dayOfWeek: number; // 0 = Sunday … 6 = Saturday
  departTime: string; // "HH:mm"
  riderName: string | null;
}

export interface ScheduleCorridor {
  id: string;
  name: string;
  description: string | null;
  areas: string[];
  schedules: ScheduleEntry[];
}

export interface ScheduleHub {
  id: string;
  name: string;
  sector: string | null;
  landmark: string | null;
  corridorRoutes: ScheduleCorridor[];
}

export function getDeliverySchedule(): Promise<{ hubs: ScheduleHub[] }> {
  return apiGet<{ hubs: ScheduleHub[] }>('/api/delivery/schedule');
}
