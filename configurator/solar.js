// The sun's position from the room's solar hour, with no 3D involved, so the comfort rules can use it and be tested in Node.

const rad = d => (d * Math.PI) / 180;
const deg = r => (r * 180) / Math.PI;

/** Solar time in hours -> elevation and azimuth in degrees, azimuth clockwise from the model's north. */
export function sunAt(hour, site) {
  const lat = rad(site.latitude_deg), dec = rad(site.declination_deg), h = rad((hour - 12) * 15);
  const el = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(h));
  const az = Math.atan2(-Math.cos(dec) * Math.sin(h), Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.cos(h) * Math.sin(lat));
  return { elevation: deg(el), azimuth: (deg(az) + site.north_offset_deg + 360) % 360 };
}

// Sunset and sunrise as almanacs give them: the top of the sun's disc on the horizon, after refraction.
export const HORIZON_DEG = -0.833;

/** Between sunset and sunrise: no daylight comes in, so there's no glare for blinds to block. */
export const afterDark = (hour, site) => sunAt(hour, site).elevation < HORIZON_DEG;

/** Sunrise and sunset in solar hours for the site's date, found by halving the interval. */
export function sunTimes(site) {
  const cross = (a, b) => {
    const up = sunAt(a, site).elevation < HORIZON_DEG; // true if the sun rises between a and b
    for (let i = 0; i < 40; i++) {
      const m = (a + b) / 2;
      if ((sunAt(m, site).elevation < HORIZON_DEG) === up) a = m; else b = m;
    }
    return (a + b) / 2;
  };
  return { sunrise: cross(0, 12), sunset: cross(12, 24) };
}
