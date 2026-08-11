/* ============================================================
   Aurex Net Zero Platform — Theme Toggle (Dark / Light Mode)
   Applies to every page that includes this script.
   ============================================================ */
(function () {
  var STORAGE_KEY = "nz-theme";

  var body = document.body;
  var toggleBtn = document.getElementById("darkModeToggle");
  var icon = document.getElementById("darkModeIcon");
  var label = document.getElementById("darkModeLabel");

  function applyTheme(theme) {
    var isDark = theme === "dark";

    body.classList.toggle("nz-dark", isDark);

    if (toggleBtn) toggleBtn.classList.toggle("active", isDark);

    if (icon) {
      icon.classList.toggle("fa-moon", !isDark);
      icon.classList.toggle("fa-sun", isDark);
    }

    if (label) label.textContent = isDark ? "Light mode" : "Dark mode";
  }

  // Load saved theme immediately on page open
  var saved = localStorage.getItem(STORAGE_KEY) || "light";
  applyTheme(saved);

  // Toggle on click + persist choice
  if (toggleBtn) {
    toggleBtn.addEventListener("click", function () {
      var next = body.classList.contains("nz-dark") ? "light" : "dark";
      applyTheme(next);
      localStorage.setItem(STORAGE_KEY, next);
    });
  }
})();
