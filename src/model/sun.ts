/**
 * Local sunrise/sunset from lat/lon — the standard NOAA/Wikipedia sunrise
 * equation, computed entirely offline. Accuracy is a minute or two, which is
 * plenty for fading wall art.
 */

const DEG = Math.PI / 180;

function toJulian(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

function fromJulian(j: number): Date {
  return new Date((j - 2440587.5) * 86400000);
}

export interface SunTimes {
  sunrise: Date | null;
  sunset: Date | null;
}

/** Sun times for the calendar day containing `date` (local). `lon` is
 * east-positive. Returns nulls for polar day/night. */
export function sunTimes(date: Date, lat: number, lon: number): SunTimes {
  const noonLocal = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const lw = -lon; // the equation wants longitude west-positive
  const n = Math.round(toJulian(noonLocal) - 2451545.0 - 0.0009 + lw / 360);
  const jStar = 2451545.0 + 0.0009 + lw / 360 + n;
  const M = (357.5291 + 0.98560028 * (jStar - 2451545)) % 360;
  const C = 1.9148 * Math.sin(M * DEG) + 0.02 * Math.sin(2 * M * DEG) + 0.0003 * Math.sin(3 * M * DEG);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const jTransit =
    jStar + 0.0053 * Math.sin(M * DEG) - 0.0069 * Math.sin(2 * lambda * DEG);
  const delta = Math.asin(Math.sin(lambda * DEG) * Math.sin(23.44 * DEG));
  const cosOmega =
    (Math.sin(-0.83 * DEG) - Math.sin(lat * DEG) * Math.sin(delta)) /
    (Math.cos(lat * DEG) * Math.cos(delta));
  if (cosOmega > 1 || cosOmega < -1) return { sunrise: null, sunset: null };
  const omega = Math.acos(cosOmega) / DEG;
  return {
    sunrise: fromJulian(jTransit - omega / 360),
    sunset: fromJulian(jTransit + omega / 360),
  };
}

const RE_CLOCK = /^(\d{1,2}):(\d{2})$/;
const RE_SOLAR = /^(sunrise|sunset)([+-])(\d{1,2}):(\d{2})$/;

/**
 * Resolves a schedule "at" expression — "HH:MM", "sunrise±HH:MM", or
 * "sunset±HH:MM" — to a concrete time on the given calendar day, or null if
 * the expression is invalid or the sun event doesn't occur.
 */
export function resolveEventTime(
  at: string,
  day: Date,
  lat: number,
  lon: number,
): Date | null {
  const s = at.trim().toLowerCase();
  let m = RE_CLOCK.exec(s);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, min);
  }
  m = RE_SOLAR.exec(s);
  if (m) {
    const times = sunTimes(day, lat, lon);
    const base = m[1] === 'sunrise' ? times.sunrise : times.sunset;
    if (!base) return null;
    const offsetMs = (Number(m[3]) * 60 + Number(m[4])) * 60000;
    return new Date(base.getTime() + (m[2] === '+' ? offsetMs : -offsetMs));
  }
  return null;
}

export function isValidEventTime(at: string): boolean {
  const s = at.trim().toLowerCase();
  return RE_CLOCK.test(s) || RE_SOLAR.test(s);
}
