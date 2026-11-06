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
