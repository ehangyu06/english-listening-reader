export function parseRoute() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const q = hash.indexOf("?");
  const path = (q >= 0 ? hash.slice(0, q) : hash) || "/";
  const parts = path.split("/").filter(Boolean).map((part) => decodeURIComponent(part));

  if (parts.length === 0) return { name: "home" };
  if (parts[0] === "books" && parts[1]) return { name: "book", title: parts[1] };
  if (parts[0] === "books") return { name: "books" };
  if (parts[0] === "lesson" && parts[1] === "new") return { name: "add" };
  if (parts[0] === "lesson" && parts[2] === "edit") return { name: "edit", id: parts[1] };
  if (parts[0] === "lesson" && parts[2] === "compare") return { name: "compare", id: parts[1] };
  if (parts[0] === "lesson" && parts[1]) return { name: "lesson", id: parts[1] };
  if (parts[0] === "review") return { name: "review" };
  if (parts[0] === "search") return { name: "search" };
  if (parts[0] === "listen" && parts[2]) return { name: "listenPart", title: parts[1], part: parts[2] };
  if (parts[0] === "listen" && parts[1]) return { name: "listenBook", title: parts[1] };
  if (parts[0] === "listen") return { name: "listen" };
  return { name: "home" };
}

export function startRouter(onChange) {
  const run = () => onChange(parseRoute());
  window.addEventListener("hashchange", run);
  run();
}
