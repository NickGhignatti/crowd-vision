(function () {
  var KEY = "cv-nav-collapsed";
  function norm(u) {
    return u.replace(/\/index\.html$/, "").replace(/\/$/, "");
  }
  function load() {
    try { return new Set(JSON.parse(localStorage.getItem(KEY) || "[]")); }
    catch (e) { return new Set(); }
  }
  function save(set) {
    try { localStorage.setItem(KEY, JSON.stringify(Array.prototype.slice.call(set))); }
    catch (e) {}
  }
  function init() {
    var nav = CV.pageList();
    if (!nav) return;
    var closed = load();
    var here = norm(location.pathname);
    Array.prototype.forEach.call(nav.querySelectorAll("h1,h2,h3,h4"), function (h) {
      var list = h.nextElementSibling;
      if (!list || (list.tagName !== "UL" && list.tagName !== "OL")) return;
      var id = h.id || h.textContent.trim();
      // Quarkdown stamps aria-current after post-rendering, so match on the
      // URL instead of racing it: the open page's section always starts open.
      var holdsCurrent = Array.prototype.some.call(list.querySelectorAll("a"), function (a) {
        try { return norm(new URL(a.getAttribute("href"), location.href).pathname) === here; }
        catch (e) { return false; }
      });
      set(h, closed.has(id) && !holdsCurrent);
      h.setAttribute("role", "button");
      h.setAttribute("tabindex", "0");
      h.addEventListener("click", function () { flip(h, id, closed); });
      h.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(h, id, closed); }
      });
    });
  }
  function set(h, isClosed) {
    h.setAttribute("data-collapsed", isClosed ? "true" : "false");
  }
  function flip(h, id, closed) {
    var next = h.getAttribute("data-collapsed") !== "true";
    set(h, next);
    if (next) { closed.add(id); } else { closed.delete(id); }
    save(closed);
  }
  CV.ready(init);
})();
