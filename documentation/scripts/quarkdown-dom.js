// the only script that may name Quarkdown's DOM; features ask here for elements.
window.CV = {
  ready: function (fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
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
  pageList: function () {
    return document.querySelector('nav[data-role="page-list"]');
  },
};
