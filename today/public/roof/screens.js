// Built-in screens load outside the app-module lifecycle. A task owns the account
// and frame it started in; only the latest task for the same route may enter or
// navigate the screen. Account ownership remains valid across same-account data
// refreshes so an Apps shortcut editor can keep its draft and existing handlers.
export function createScreenTasks(scopeOf) {
  const latest = new Map();
  return {
    begin(tab, arg = null) {
      const { frame, signal, owner } = scopeOf(), route = frame?.route;
      const task = { frame, signal, owner };
      task.current = () => {
        const now = scopeOf();
        return !!owner && !!frame && !!signal && !signal.aborted && !frame.signal?.aborted &&
          now.frame === frame && now.signal === signal && now.owner === owner;
      };
      task.active = () => task.current() && latest.get(tab) === task && frame.route === route &&
        route?.kind === "tab" && route.tab === tab && (route.arg ?? null) === arg;
      latest.set(tab, task);
      return task;
    },
  };
}
