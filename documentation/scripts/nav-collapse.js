(function () {
  var KEY = "cv-nav-open";
  var ICONS = {
    "Requirements": "bi-folder2-open",
    "Domains & Contexts": "bi-diagram-2",
    "System Architecture": "bi-diagram-3",
    "Microservices Architecture": "bi-boxes",
    "Packages & Libraries": "bi-box-seam",
    "Services": "bi-hdd-stack",
    "Design": "bi-rulers",
    "Configuration": "bi-sliders",
    "Contributing": "bi-git",
  };
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
    var opened = load();
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
      set(h, !opened.has(id) && !holdsCurrent);
      var name = h.textContent.trim();
      if (ICONS[name]) {
        var icon = document.createElement("i");
        icon.className = "bi " + ICONS[name];
        icon.setAttribute("aria-hidden", "true");
        h.insertBefore(icon, h.firstChild);
      }
      h.setAttribute("role", "button");
      h.setAttribute("tabindex", "0");
      h.addEventListener("click", function () { flip(h, id, opened); });
      h.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(h, id, opened); }
      });
    });
  }
  function set(h, isClosed) {
    h.setAttribute("data-collapsed", isClosed ? "true" : "false");
  }
  function flip(h, id, opened) {
    var next = h.getAttribute("data-collapsed") !== "true";
    set(h, next);
    if (next) { opened.delete(id); } else { opened.add(id); }
    save(opened);
  }
  CV.ready(init);
})();
