// the only script that may name Quarkdown's DOM; features ask here for elements.
window.CV = {
  ready: function (fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  },
  // the header is filled in after mermaid renders, so it can arrive well after DOM ready.
  headerReady: function (fn) {
    var self = this;
    if (self.brandLink()) { fn(); return; }
    var watcher = new MutationObserver(function () {
      if (!self.brandLink()) return;
      watcher.disconnect();
      fn();
    });
    watcher.observe(document.documentElement, { childList: true, subtree: true });
  },
  content: function () {
    return document.querySelector(".content-wrapper > main");
  },
  rootPath: function () {
    return document.querySelector('meta[name="quarkdown:root-path"]').content;
  },
  panel: function (side) {
    return document.querySelector(".content-wrapper > aside:" + (side === "left" ? "first" : "last") + "-child");
  },
  brandLink: function () {
    return document.querySelector("body > header > aside:first-child a");
  },
  topLinks: function () {
    return Array.prototype.slice.call(document.querySelectorAll("body > header > aside:last-child a"));
  },
  searchInput: function () {
    return document.querySelector(".search-field input");
  },
  pageSection: function () {
    var nav = this.pageList();
    if (!nav) return null;
    var here = location.pathname.replace(/\/index\.html$/, "").replace(/\/$/, "");
    var links = nav.querySelectorAll("a");
    for (var i = 0; i < links.length; i++) {
      var there = new URL(links[i].getAttribute("href"), location.href).pathname;
      if (there.replace(/\/index\.html$/, "").replace(/\/$/, "") !== here) continue;
      var head = links[i].closest("ul,ol").previousElementSibling;
      return head ? head.textContent.trim() : null;
    }
    return null;
  },
  diagrams: function () {
    return Array.prototype.slice.call(document.querySelectorAll(".mermaid > svg:not([data-sketched])"));
  },
  tocLinks: function () {
    return Array.prototype.slice.call(document.querySelectorAll('nav[data-role="table-of-contents"] > ol > li > a'));
  },
  pageList: function () {
    return document.querySelector('nav[data-role="page-list"]');
  },
};
(function () {
  var KEY = "cv-nav-open";
  var ICONS = {
    "The Domain": "bi-compass",
    "System Architecture & Design": "bi-diagram-3",
    "Microservices Architecture": "bi-boxes",
    "Packages & Libraries": "bi-box-seam",
    "Services": "bi-hdd-stack",
    "Toolchain": "bi-tools",
    "Configuration": "bi-sliders",
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
CV.ready(function () {
  // a table cannot scroll on its own without giving up stretching to full width.
  var content = CV.content();
  if (!content) return;
  Array.prototype.forEach.call(content.querySelectorAll("table"), function (table) {
    var box = document.createElement("div");
    box.className = "cv-table-scroll";
    table.parentNode.insertBefore(box, table);
    box.appendChild(table);
  });
});
CV.ready(function () {
  var OFFSET = 120;
  // quarkdown rebuilds the toc after mermaid renders, so links found at load go stale
  function paint() {
    var links = CV.tocLinks();
    var active = 0;
    links.forEach(function (a, i) {
      var t = document.getElementById(decodeURIComponent(a.getAttribute("href").slice(1)));
      if (t && t.getBoundingClientRect().top <= OFFSET) active = i;
    });
    links.forEach(function (a, i) {
      if (i === active) { a.setAttribute("data-active", ""); }
      else { a.removeAttribute("data-active"); }
    });
  }
  window.addEventListener("scroll", paint, { passive: true });
  paint();
});
