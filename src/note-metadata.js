// Matches the relative label: whole elapsed days, clocks only for today.
export function absoluteNoteDate(value){
  const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';
  const pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function menuEditedDate(value, now = new Date()) {
  const time = Date.parse(value), stamp = new Date(now).getTime();
  if (!Number.isFinite(time) || !Number.isFinite(stamp)) return '';
  const d = new Date(time), current = new Date(stamp);
  const pad = n => String(n).padStart(2, '0');
  const days = Math.floor((stamp - time) / 86400000);
  const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (days === 0) return clock;
  if (days === 1) return `昨天 ${clock}`;
  if (days > 1 && days < 7) return `${days}天前 ${clock}`;
  if (d.getFullYear() === current.getFullYear()) return `${pad(d.getMonth()+1)}-${pad(d.getDate())} ${clock}`;
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
