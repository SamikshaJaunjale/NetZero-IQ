/* ============================================================
   Aurex Net Zero Platform — Mobile Sidebar Toggle
   ------------------------------------------------------------
   The sidebar is hidden off-canvas by CSS below 992px (see
   styles.css). This script is what lets a mobile/tablet user
   actually open and close it again via the hamburger button in
   the topbar, with a dimmed backdrop and body-scroll lock while
   it's open. Desktop behaviour (sidebar always visible, no
   backdrop, no scroll lock) is untouched — this script only
   acts on the mobile-only elements added to the topbar.
   ============================================================ */
(function () {
  "use strict";

  var body = document.body;
  var toggleBtn = document.getElementById("navHamburger");
  var overlay = document.getElementById("navOverlay");
  var sidebar = document.querySelector(".nz-sidebar");

  function openSidebar() {
    body.classList.add("nz-sidebar-open");
    if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "true");
  }
  function closeSidebar() {
    body.classList.remove("nz-sidebar-open");
    if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "false");
  }
  function toggleSidebar() {
    if (body.classList.contains("nz-sidebar-open")) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  if (toggleBtn) toggleBtn.addEventListener("click", toggleSidebar);
  if (overlay) overlay.addEventListener("click", closeSidebar);

  // Tapping a nav link on mobile should navigate AND close the drawer
  // (mainly matters for same-page "#" links; real navigations unload
  // the page anyway, this just avoids a flash of the open drawer).
  if (sidebar) {
    sidebar.querySelectorAll(".nz-link").forEach(function (link) {
      link.addEventListener("click", closeSidebar);
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeSidebar();
  });

  // If the viewport is resized back up to desktop width while the
  // drawer happens to be open, drop the open/scroll-lock state so it
  // doesn't linger (CSS already hides the drawer chrome at that width,
  // this just keeps body scroll and aria state in sync).
  window.addEventListener("resize", function () {
    if (window.innerWidth > 992) closeSidebar();
  });
})();
