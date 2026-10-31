CV.ready(function () {
  var OFFSET = 120;
  var links = CV.tocLinks();
  var targets = links.map(function (a) {
    return document.getElementById(decodeURIComponent(a.getAttribute("href").slice(1)));
  });
  function paint() {
    var active = 0;
    targets.forEach(function (t, i) {
      if (t && t.getBoundingClientRect().top <= OFFSET) active = i;
    });
    links.forEach(function (a, i) {
      if (i === active) { a.setAttribute("data-active", ""); }
      else { a.removeAttribute("data-active"); }
    });
  }
  if (!links.length) return;
  window.addEventListener("scroll", paint, { passive: true });
  paint();
});
