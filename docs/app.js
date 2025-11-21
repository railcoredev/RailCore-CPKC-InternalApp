console.log("RailCore app.js loaded");

async function runCrossingSearchFromUI() {
  try {
    const stateSelect = document.querySelector(".multiselect");
    const selectedStates = Array.from(stateSelect.options)
      .filter(o => o.selected)
      .map(o => o.value);

    const subdivSelect = document.querySelector(".sticky-subdivision-select");
    const subdivision = subdivSelect && subdivSelect.value ? subdivSelect.value : "";

    const spacingInput = document.querySelector(".sticky-inline input:nth-child(1)");
    const bufferInput  = document.querySelector(".sticky-inline input:nth-child(2)");
    const spacingFt = Number(spacingInput && spacingInput.value ? spacingInput.value : "0");
    const bufferFt  = Number(bufferInput && bufferInput.value ? bufferInput.value : "0");

    const modeRadio = document.querySelector('input[name="vm"]:checked');
    const mode = modeRadio && modeRadio.value === "all" ? "all" : "threshold";

    const result = await RailCoreData.loadCrossingGaps({
      states: selectedStates.length ? selectedStates : ["IA"],
      subdivision,
      spacingFt,
      bufferFt,
      mode
    });

    renderResults(result.formatted);
  } catch (err) {
    console.error("Failed to load crossings:", err);
    const panel = document.getElementById("resultsPanel");
    if (panel) {
      panel.textContent = "Unable to load crossing data. Check connection or configuration.";
    } else {
      alert("Unable to load crossing data. Check connection or configuration.";
    }
  }
}

function renderResults(items) {
  const panel = document.getElementById("resultsPanel");
  if (!panel) return;
  panel.innerHTML = "";
  if (!items || !items.length) {
    panel.textContent = "No crossing gaps found for current filters.";
    return;
  }
  items.forEach(item => {
    const wrapper = document.createElement("div");
    wrapper.className = "result-item";

    const l1 = document.createElement("div");
    l1.className = "result-line1";
    l1.textContent = item.line1;

    const l2 = document.createElement("div");
    l2.className = "result-line2";
    l2.textContent = item.line2;

    wrapper.appendChild(l1);
    wrapper.appendChild(l2);
    panel.appendChild(wrapper);
  });
}

function wireUpUI() {
  const applyBtn = document.getElementById("applyBtn");
  if (applyBtn) {
    applyBtn.addEventListener("click", (e) => {
      e.preventDefault();
      runCrossingSearchFromUI();
    });
  }

  const printBtn = document.getElementById("printBtn");
  if (printBtn) {
    printBtn.addEventListener("click", (e) => {
      e.preventDefault();
      window.print();
    });
  }

  const downloadBtn = document.getElementById("downloadBtn");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", (e) => {
      e.preventDefault();
      alert("Download/export is not wired yet in this mock.");
    });
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("./service-worker.js")
      .then(() => console.log("Service worker registered"))
      .catch((err) => console.warn("Service worker registration failed:", err));
  }
}

window.addEventListener("DOMContentLoaded", wireUpUI);
