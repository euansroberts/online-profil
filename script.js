/* ============================================================
   Online-Bewerbungsprofil – Euan S. Roberts
   ============================================================ */

/* ---------- Directional page transitions ----------
   The animations live in CSS (View Transitions API). This only works
   out the DIRECTION: it compares the menu position of the page you are
   leaving with the one you are going to, then tags the transition so
   CSS can play "float up" or "float down" accordingly.
   Going to a page HIGHER in the menu  -> previous page floats down.
   Going to a page LOWER in the menu    -> previous page floats up. */
(function () {
  var ORDER = [
    "index.html", "about_me.html", "projects.html",
    "ict_skills.html", "documents.html", "contact.html"
  ];

  function indexOfUrl(url) {
    if (!url) return -1;
    try {
      var file = new URL(url).pathname.split("/").pop();
      if (!file) file = "index.html";
      return ORDER.indexOf(file);
    } catch (e) { return -1; }
  }

  window.addEventListener("pagereveal", function (event) {
    if (!event.viewTransition || !window.navigation) return;
    var act = window.navigation.activation;
    if (!act || !act.from || !act.entry) return;

    var fromIdx = indexOfUrl(act.from.url);
    var toIdx   = indexOfUrl(act.entry.url);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;

    // moving up the menu -> float down, otherwise float up
    event.viewTransition.types.add(toIdx < fromIdx ? "down" : "up");

    // distance (number of menu steps) drives how far/long the page floats
    var distance = Math.abs(toIdx - fromIdx);
    document.documentElement.style.setProperty("--vt-distance", String(distance));
  });
})();

document.addEventListener("DOMContentLoaded", function () {

  /* ---------- Hamburger menu ----------
     The menu opens on hover via CSS. This adds a click toggle so it
     also works on touch devices, and closes it when clicking away. */
  var menu = document.querySelector(".menu");
  if (menu) {
    var toggle = menu.querySelector(".menu-toggle");
    if (toggle) {
      toggle.addEventListener("click", function (e) {
        e.stopPropagation();
        menu.classList.toggle("open");
      });
      document.addEventListener("click", function (e) {
        if (!menu.contains(e.target)) menu.classList.remove("open");
      });
    }
  }

  /* ---------- Documents login gate (client-side) ----------
     The site is hosted statically (GitHub Pages), so the check runs in the
     browser. NOTE: this demonstrates the login concept but is not real
     security – a static site cannot truly hide files. The password is at
     least stored as a SHA-256 hash rather than plain text. */
  var LOGIN_USER = "bewerbung";
  var LOGIN_HASH = "31967e4456e87c25491e924a801b04feb9af92a3c907f05e7f96d3e623d140ad";

  async function sha256Hex(text) {
    var data = new TextEncoder().encode(text);
    var buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf))
      .map(function (b) { return b.toString(16).padStart(2, "0"); })
      .join("");
  }

  var loginForm = document.getElementById("login-form");
  if (loginForm) {
    var lockedArea = document.getElementById("locked-area");
    var loginBox   = document.getElementById("login-box");
    var errorBox   = document.getElementById("login-error");

    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var u = document.getElementById("username").value.trim();
      var p = document.getElementById("password").value;

      sha256Hex(p).then(function (hash) {
        if (u === LOGIN_USER && hash === LOGIN_HASH) {
          loginBox.classList.add("hidden");
          lockedArea.classList.remove("hidden");
          errorBox.textContent = "";
        } else {
          errorBox.textContent = "Benutzername oder Passwort ist falsch.";
        }
      });
    });
  }
});
