const calendarioCancun = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Cancun", year: "numeric", month: "2-digit", day: "2-digit"
});

export function fechaCancun(fecha = new Date()) {
  const parts = calendarioCancun.formatToParts(fecha);
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
}
