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
