window.UI = {
  toast: function (msg) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(function () {
      el.classList.remove("show");
    }, 2400);
  },
  go: function (n, hasKey) {
    if (n >= 2 && !hasKey) return this.toast("Create or restore a DID first");
    document.querySelectorAll(".panel").forEach(function (p) {
      p.classList.remove("active");
    });
    document.querySelectorAll(".step-tab").forEach(function (t) {
      t.classList.remove("active");
    });
    var panel = document.getElementById("p" + n);
    var tab = document.querySelector('.step-tab[data-step="' + n + '"]');
    if (panel) panel.classList.add("active");
    if (tab) tab.classList.add("active");
  },
  downloadJson: function (filename, obj) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  },
  setBox: function (id, className, text) {
    var box = document.getElementById(id);
    if (!box) return;
    box.textContent = "";
    if (!text) return;
    var d = document.createElement("div");
    d.className = className;
    d.textContent = text;
    box.appendChild(d);
  }
};