// the only script that may name Quarkdown's DOM; features ask here for elements.
window.CV = {
  ready: function (fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  },
  pageList: function () {
    return document.querySelector('nav[data-role="page-list"]');
  },
};
