import { createSystemClient, operationId } from "../roof/system-client.js";

const day = 86400000;
const titleKey = text => String(text || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const dateKey = time => new Date(time).toISOString().slice(0, 10);
function clock(time, zone) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(time);
}
function localDay(time, zone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(time);
}

// Resolve wall time in the event's own zone. Skip transition days to avoid
// inventing an instant for a skipped or repeated local time.
export function moveTime(event, time) {
  if (event.allDay || !Number.isFinite(event.start) || !(event.end > event.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const mins = v => Number(v.slice(0,2)) * 60 + Number(v.slice(3));
  const old = clock(event.start, event.timezone);
  if (old === time || clock(event.start - day,event.timezone) !== old || clock(event.start + day,event.timezone) !== old) return null;
  const start = Math.floor(event.start / 60000) * 60000 + (mins(time) - mins(old)) * 60000;
  if (clock(start,event.timezone) !== time || localDay(start,event.timezone) !== localDay(event.start,event.timezone)) return null;
  return { start, end: start + event.end - event.start };
}

export async function matchChange(fw, spec, current) {
  const { subject, threadId, time, date } = spec;
  const now = Date.now(), until = Math.min(now + 31 * day, date + 31 * day);
  if (!current() || !subject?.trim() || !Number.isFinite(date) || date < now - 14 * day || until <= now) return null;
  const client = createSystemClient(fw, { prefix: "/api/organise/" });
  const range = { kind: "calendar", fromDate: dateKey(now - day), toDate: dateKey(until + day), from: now, to: until, limit: 100 };
  let cursor = null;
  const matches = [];
  do {
    const page = await client.request("list", { method: "POST", body: { ...range, cursor }, current });
    for (const event of page.records) {
      if (event.start < now || event.deleted || event.readOnly || event.allDay) continue;
      if (!event.links?.some(link => link.app === "mail" && link.id === threadId) && titleKey(event.title) !== titleKey(subject)) continue;
      const moved = moveTime(event, time);
      if (moved && moved.start > now) matches.push({ event, moved });
    }
    cursor = page.cursor;
  } while (cursor);
  if (!matches.length) return null;
  const ui = fw.ui, E = ui.el;
  const when = (at, zone) => new Intl.DateTimeFormat("en-GB", { weekday:"short", day:"numeric", month:"short", hour:"2-digit", minute:"2-digit", timeZone:zone, timeZoneName:"short" }).format(at);
  return {
    label: matches.length === 1 ? clock(matches[0].event.start, matches[0].event.timezone) + " → " + time : "Choose an event",
    review({ dismiss, updated, viewMessage, refresh }) {
      if (!current()) return;
      const body = E("div", { class:"mr-review" }), h = fw.sheet.open({ sheet:"mail-time-change", title:"Review change", body });
      const active = () => current() && !h.closed;
      function show({ event, moved }) {
        if (!active()) return;
        const op = operationId();
        let write;
        const status = E("p", {role:"status"}), change = ui.btn("Update Calendar", { primary:true, run: async () => {
          if (!active() || change.disabled) return;
          for (const button of body.querySelectorAll("button")) button.disabled = true;
          try {
            if (!write) {
              const {record} = await client.request("record", {query:{kind:"calendar",id:event.id},current:active});
              if (record.version !== event.version || record.start !== event.start || moved.start <= Date.now()) throw Object.assign(Error("Event changed"), {status:409});
              const {title,description,links,timezone} = record;
              write = {kind:"calendar",id:event.id,version:event.version,operationId:op,deleted:false,value:{title,description,links,timezone,allDay:false,...moved}};
            }
            await client.request("record", {method:"PUT",body:write,current:active});
            if (client.live()) window.dispatchEvent(new CustomEvent("inflite:organise-change", {detail:{owner:client.owner,kind:"calendar"}}));
            if (active()) { h.close(); updated(); }
          } catch (error) {
            if (!active()) return;
            if ([404,409,410].includes(error.status)) { h.close(); refresh(); fw.toast("The event changed. Review the latest time."); }
            else { status.textContent = error.message || "Calendar couldn’t update. Try again."; for (const button of body.querySelectorAll("button")) button.disabled = false; }
          }
        } });
        body.replaceChildren(E("h3",{text:event.title}), E("dl",{},
          E("dt",{text:"In Calendar"}),E("dd",{text:when(event.start,event.timezone)}),
          E("dt",{text:"Proposed time"}),E("dd",{text:when(moved.start,event.timezone)})),
          E("blockquote",{text:spec.evidence}),ui.btn("View message",{run:()=>{h.now();viewMessage();}}),status,change,
          ui.btn("Keep original",{run:()=>{if(active()){h.close();dismiss();}}}));
      }
      if (matches.length === 1) show(matches[0]);
      else body.replaceChildren(E("p",{text:"Which event did they mean?"}), ...matches.map(m=>ui.btn(m.event.title+" · "+when(m.event.start,m.event.timezone),{run:()=>show(m)})));
    }
  };
}
