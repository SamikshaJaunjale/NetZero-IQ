/* ============================================================
   Aurex Net Zero Platform — Theme Toggle + Mobile Sidebar
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Dark Mode ---------- */
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

  var saved = localStorage.getItem(STORAGE_KEY) || "light";
  applyTheme(saved);

  if (toggleBtn) {
    toggleBtn.addEventListener("click", function () {
      var next = body.classList.contains("nz-dark") ? "light" : "dark";
      applyTheme(next);
      localStorage.setItem(STORAGE_KEY, next);
    });
  }

  /* ---------- Mobile Sidebar ---------- */
  var sidebar = document.getElementById("nzSidebar");
  var backdrop = document.getElementById("nzSidebarBackdrop");
  var openBtn = document.getElementById("nzMobileToggle");
  var closeBtn = document.getElementById("nzSidebarClose");
  var navLinks = document.querySelectorAll(".nz-nav .nz-link");

  function openSidebar() {
    if (!sidebar || !backdrop) return;
    sidebar.classList.add("mobile-open");
    backdrop.classList.add("show");
    document.body.style.overflow = "hidden";
  }

  function closeSidebar() {
    if (!sidebar || !backdrop) return;
    sidebar.classList.remove("mobile-open");
    backdrop.classList.remove("show");
    document.body.style.overflow = "";
  }

  if (openBtn) {
    openBtn.addEventListener("click", openSidebar);
  }
  if (closeBtn) {
    closeBtn.addEventListener("click", closeSidebar);
  }
  if (backdrop) {
    backdrop.addEventListener("click", closeSidebar);
  }
  // Auto-close when a nav link is tapped
  navLinks.forEach(function (link) {
    link.addEventListener("click", function () {
      closeSidebar();
    });
  });
})();
