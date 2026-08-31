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

  /* ---------- Password gate + Entschlüsselung der Unterlagen ----------
     Wird auf der Documents- und der About-me-Seite verwendet. Die Website
     liegt statisch auf GitHub Pages, jede Datei ist also über ihre URL
     abrufbar. Die Unterlagen liegen deshalb nur verschlüsselt im Repository
     (unterlagen/*.pdf.enc) – wer die URL direkt aufruft, erhält unbrauchbare
     Bytes. Erst nach dem Login leitet der Browser den Schlüssel ab und
     entschlüsselt die Datei lokal.

       Schlüssel  PBKDF2-HMAC-SHA256(Passwort, Salt, 600'000) -> 32 Byte
       Datei      IV (12 Byte) || Ciphertext + GCM-Tag  (AES-256-GCM)
       Login      unterlagen/check.enc muss sich zu "IDAF-OK" entschlüsseln

     Das Salt muss nicht geheim sein. Nach jeder Änderung an einem PDF oder
     am Passwort die .enc-Dateien mit tools/encrypt_documents.py neu erzeugen. */
  var SALT_HEX    = "5c1d8f2ab7e04936a1c8d5e73f0b2647";
  var ITERATIONS  = 600000;
  var DOCUMENT_DIR = "../unterlagen/";  // beide geschützten Seiten liegen in subpages/
  var CHECK_PLAIN = "IDAF-OK";

  // Der abgeleitete Schlüssel lebt nur im Speicher – nie in localStorage,
  // damit ein Logout (oder das Schliessen des Tabs) ihn wirklich entfernt.
  var documentKey = null;

  function hexToBytes(hex) {
    var out = new Uint8Array(hex.length / 2);
    for (var i = 0; i < out.length; i++) {
      out[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return out;
  }

  function deriveKey(password) {
    var material = new TextEncoder().encode(password);
    return crypto.subtle
      .importKey("raw", material, "PBKDF2", false, ["deriveKey"])
      .then(function (base) {
        return crypto.subtle.deriveKey(
          { name: "PBKDF2", salt: hexToBytes(SALT_HEX), iterations: ITERATIONS, hash: "SHA-256" },
          base,
          { name: "AES-GCM", length: 256 },
          false,
          ["decrypt"]
        );
      });
  }

  function networkError(message) {
    var err = new Error(message);
    err.network = true;       // unterscheidet Ladefehler vom falschen Passwort
    return err;
  }

  /* Holt eine .enc-Datei und gibt den entschlüsselten Inhalt zurück.
     Ein falsches Passwort scheitert am GCM-Tag und landet im catch(). */
  function decryptFile(key, url) {
    return fetch(url)
      .then(
        function (res) {
          if (!res.ok) throw networkError("HTTP " + res.status);
          return res.arrayBuffer();
        },
        function () { throw networkError("fetch fehlgeschlagen"); }
      )
      .then(function (buf) {
        var iv = new Uint8Array(buf, 0, 12);
        return crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, buf.slice(12));
      });
  }

  var loginForm = document.getElementById("login-form");
  if (loginForm) {
    var lockedArea = document.getElementById("locked-area");
    var loginBox   = document.getElementById("login-box");
    var errorBox   = document.getElementById("login-error");
    var logoutBar  = document.getElementById("logout-bar");
    var logoutBtn  = document.getElementById("logout-btn");
    var passwordIn = document.getElementById("password");
    var statusBox  = document.getElementById("download-status");

    // Zeigt entweder die Login-Box oder den Inhalt samt Abmelde-Leiste
    function setLoggedIn(loggedIn) {
      loginBox.classList.toggle("hidden", loggedIn);
      lockedArea.classList.toggle("hidden", !loggedIn);
      if (logoutBar) logoutBar.classList.toggle("hidden", !loggedIn);
      errorBox.textContent = "";
      if (statusBox) statusBox.textContent = "";
    }

    // Knopf während einer laufenden Krypto-Operation sperren
    function busy(button, label) {
      var previous = button.textContent;
      button.disabled = true;
      button.textContent = label;
      return function () {
        button.disabled = false;
        button.textContent = previous;
      };
    }

    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      errorBox.textContent = "";

      /* WebCrypto gibt es nur im "secure context". Über https:// (GitHub
         Pages) oder localhost ist das erfüllt – beim direkten Öffnen der
         HTML-Datei per file:// nicht. */
      if (!window.crypto || !crypto.subtle) {
        errorBox.textContent = "Verschlüsselung nicht verfügbar – die Seite " +
          "muss über https:// oder localhost geöffnet werden.";
        return;
      }

      var done = busy(loginForm.querySelector("button[type=submit]"), "Prüfen …");

      deriveKey(passwordIn.value)
        .then(function (key) {
          return decryptFile(key, DOCUMENT_DIR + "check.enc").then(function (plain) {
            if (new TextDecoder().decode(plain) !== CHECK_PLAIN) {
              throw new Error("Prüfdatei passt nicht");
            }
            documentKey = key;
            setLoggedIn(true);
          });
        })
        .catch(function (err) {
          errorBox.textContent = err && err.network
            ? "Die Unterlagen konnten nicht geladen werden."
            : "Das Passwort ist falsch.";
        })
        .then(done, done);
    });

    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        documentKey = null;         // Schlüssel verwerfen
        setLoggedIn(false);
        loginForm.reset();          // Passwort nicht im Feld stehen lassen
        passwordIn.focus();
      });
    }

    /* Download-Knöpfe: .enc holen, entschlüsseln, als echtes PDF ausliefern */
    var buttons = document.querySelectorAll("[data-encrypted]");
    Array.prototype.forEach.call(buttons, function (button) {
      button.addEventListener("click", function () {
        if (!documentKey) return;
        var name = button.getAttribute("data-name");
        var done = busy(button, "Entschlüsseln …");
        if (statusBox) statusBox.textContent = "";

        decryptFile(documentKey, DOCUMENT_DIR + button.getAttribute("data-encrypted"))
          .then(function (plain) {
            var url = URL.createObjectURL(new Blob([plain], { type: "application/pdf" }));
            var link = document.createElement("a");
            link.href = url;
            link.download = name;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
          })
          .catch(function () {
            if (statusBox) statusBox.textContent = name + " konnte nicht entschlüsselt werden.";
          })
          .then(done, done);
      });
    });
  }

});
