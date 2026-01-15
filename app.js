/* ============================================================
   CONFIGURAÇÕES
============================================================ */
const WEBHOOK_URL = "http://localhost:5678/webhook/sdkBuffer";
const SDK_API_BASE = "http://localhost:8080";
const userId = 41603;
const clientId = 3478;

/* ============================================================
   ELEMENTOS
============================================================ */
const chatMessages = document.getElementById("chatMessages");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const dashboardSection = document.getElementById("dashboardSection");
const emptyState = document.getElementById("emptyState");

let charts = [];

let lastDashboardState = null;
let activeChartIndex = 0;

const chartTypeCycle = ["bar", "line", "pie", "doughnut", "radar"];


/* ============================================================
   AUTO-RESIZE TEXTAREA
============================================================ */
messageInput.addEventListener("input", function () {
  this.style.height = "auto";
  this.style.height = Math.min(this.scrollHeight, 120) + "px";
});

/* ============================================================
   FUNÇÕES DE INTERFACE
============================================================ */
function addMessage(text, type = "assistant") {
  const el = document.createElement("div");
  el.className = `message ${type}`;
  el.textContent = text;
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTyping() {
  const el = document.createElement("div");
  el.id = "typingIndicator";
  el.className = "typing-indicator";
  el.innerHTML = "<span></span><span></span><span></span>";
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function hideTyping() {
  const el = document.getElementById("typingIndicator");
  if (el) el.remove();
}

/* ============================================================
   PARSER UNIVERSAL DE JSON
============================================================ */
function parseResponse(raw) {
  if (!raw) return null;

  raw = raw.trim();
  raw = raw.replace(/```json/gi, "").replace(/```/g, "").trim();

  try {
    const temp = JSON.parse(raw);
    if (temp.output && typeof temp.output === "string") {
      try { return JSON.parse(temp.output); } catch (_) {}
    }
    return temp;
  } catch (_) {}

  try {
    return JSON.parse(raw);
  } catch (_) {}

  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]);
    } catch (_) {}
  }

  const listMatch = raw.match(/\[[\s\S]*\]/);
  if (listMatch) {
    try {
      const arr = JSON.parse(listMatch[0]);
      if (Array.isArray(arr) && arr.length === 1) return arr[0];
      return arr;
    } catch (_) {}
  }

  return { mensagem: raw };
}

/* ============================================================
   CARREGAR DATASET DA API (FALLBACK)
============================================================ */
async function loadDataset(dataset) {
  const entidade = dataset.entidade;
  const filtros = dataset.filtros || {};

  let url = `${SDK_API_BASE}/api/v1/${entidade}`;

  if (filtros.status) {
    const statusMap = {
      ativo: "ativos",
      inativo: "inativos",
      manutencao: "manutencao"
    };

    const endpointStatus = statusMap[filtros.status] || filtros.status;
    url += `/${endpointStatus}`;
  }

  console.log("📡 Fetching:", url);

  const resp = await fetch(url, {
    headers: {
      "x-api-key": "secret-demo-3478",
      Authorization: "Bearer demo-bearer-12345",
    },
  });

  const json = await resp.json();
  return json.data || [];
}

/* ============================================================
   CRIAR GRÁFICO — USANDO DADOS DO AGENTE
============================================================ */
async function setupChart(config, canvas, card) {
  try {
    let data = [];

    if (config.dataset?.dados) {
      data = config.dataset.dados;
      console.log("📌 Usando dados enviados pelo agente:", data);
    } else {
      console.warn("⚠️ Nenhum 'dados' enviado pelo agente. Usando fallback API.");
      data = await loadDataset(config.dataset);
    }

    const first = data[0] || {};
    const keys = Object.keys(first);

    const agrup = config.dataset.agrupamento === "auto" ? keys[0] : config.dataset.agrupamento;
    const coluna = config.dataset.coluna_valor === "auto" ? keys[1] : config.dataset.coluna_valor;

    let agregRaw = (config.dataset.agregacao || "sum").toLowerCase();

    const mapaTraducao = {
      "contagem": "count",
      "soma": "sum",
      "total": "sum",
      "media": "avg",
      "média": "avg"
    };

    const agreg = mapaTraducao[agregRaw] || agregRaw;

    const grouped = {};

    data.forEach((item) => {
      const key = item[agrup] || "Desconhecido";

      if (!grouped[key])
        grouped[key] = agreg === "avg" ? { sum: 0, count: 0 } : 0;

      switch (agreg) {
        case "count": grouped[key]++; break;
        case "sum": grouped[key] += Number(item[coluna] || 0); break;
        case "avg":
          grouped[key].sum += Number(item[coluna] || 0);
          grouped[key].count++;
          break;
      }
    });

    const labels = [];
    const values = [];

    for (const key in grouped) {
      labels.push(key);
      values.push(
        agreg === "avg"
          ? (grouped[key].sum / grouped[key].count).toFixed(2)
          : grouped[key]
      );
    }

    const defaultColors = ["#667eea", "#764ba2", "#2196F3", "#FF9800", "#4CAF50", "#E91E63"];
    const chartColors = config.estilo?.colors || defaultColors;

    const chart = new Chart(canvas, {
      type: config.tipo || "bar",
      data: {
        labels,
        datasets: [{
          label: config.titulo,
          data: values,
          backgroundColor: chartColors,
          borderColor: "#fff",
          borderWidth: 1
        }],
      },
      plugins: [ChartDataLabels],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: config.estilo?.legendPosition || 'top',
            labels: { usePointStyle: true }
          },
          datalabels: {
            display: true,
            color: "#fff",
            backgroundColor: (context) => context.dataset.backgroundColor,
            borderRadius: 4,
            padding: 6,
            font: { weight: "bold" }
          }
        }
      }
    });

    charts.push(chart);

  } catch (e) {
    console.error("Erro ao montar gráfico:", e);
    card.querySelector(".chart-wrapper").innerHTML =
      `<p style="color:#999;text-align:center;">Erro ao carregar dados: ${e.message}</p>`;
  }
}

/* ============================================================
   BUTTONS DASHBOARD
============================================================ */

function createDashboardButtons(dashboard) {
  let actions = document.getElementById("dashboardActions");

  if (!actions) {
    actions = document.createElement("div");
    actions.id = "dashboardActions";
    actions.className = "dashboard-actions";

    actions.innerHTML = `
      <div class="chart-context">
        <h3 id="activeChartTitle"></h3>
      </div>

      <div class="chart-selector">
        <select id="activeChartSelect" class="tool-select"></select>
      </div>

      <div class="chart-actions-row chart-toolbar">
        <button id="regenChartBtn" class="tool-btn primary">🔄 Gerar novo gráfico</button>

        <select id="chartTypeSelect" class="tool-select">
          <option value="bar">Barra</option>
          <option value="line">Linha</option>
          <option value="pie">Pizza</option>
          <option value="doughnut">Rosca</option>
          <option value="radar">Radar</option>
        </select>

        <button id="compareChartBtn" class="tool-btn">📊 Comparar</button>
        <button id="keepChartBtn" class="tool-btn success">✅ Manter</button>
        <button id="backToSingleBtn" class="tool-btn ghost">🔙 Voltar</button>
        <button id="exportChartBtn" class="tool-btn ghost">📤 Exportar</button>
      </div>
    `;

    dashboardSection.appendChild(actions);
  }

  // popular select
  const selector = document.getElementById("activeChartSelect");
  const titleEl = document.getElementById("activeChartTitle");

  selector.innerHTML = "";
  dashboard.graficos.forEach((g, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = g.titulo;
    selector.appendChild(opt);
  });

  activeChartIndex = 0;
  titleEl.textContent = dashboard.graficos[0].titulo;

}

document.addEventListener("click", (e) => {

  /* 🔄 GERAR NOVO GRÁFICO */
  if (e.target.closest("#regenChartBtn")) {
    if (!lastDashboardState) return;

    const g = lastDashboardState.graficos[activeChartIndex];
    const idx = chartTypeCycle.indexOf(g.tipo || "bar");
    g.tipo = chartTypeCycle[(idx + 1) % chartTypeCycle.length];

    renderDashboard(lastDashboardState);
  }

  /* 📊 COMPARAR */
  if (e.target.closest("#compareChartBtn")) {
    if (!lastDashboardState) return;

    const type = document.getElementById("chartTypeSelect")?.value;
    if (!type) return;

    renderComparison(type);
  }

  /* ✅ MANTER */
  if (e.target.closest("#keepChartBtn")) {
    if (!lastDashboardState) return;

    const type = document.getElementById("chartTypeSelect")?.value;
    if (!type) return;

    lastDashboardState.graficos[activeChartIndex].tipo = type;
    renderDashboard(lastDashboardState);
  }

  /* 🔙 VOLTAR */
  if (e.target.closest("#backToSingleBtn")) {
    if (!lastDashboardState) return;
    renderDashboard(lastDashboardState);
  }

  /* 📤 EXPORTAR */
  if (e.target.closest("#exportChartBtn")) {
    exportChartsAsImage();
  }

});


//COMPARAÇÃO
function renderComparison(selectedType) {
  charts.forEach(c => c.destroy());
  charts = [];

  const base = lastDashboardState.graficos[activeChartIndex];
  const dashboardContent = document.getElementById("dashboardContent");

  dashboardContent.innerHTML = `
    <div class="dashboard-header">
      <h2>Comparação</h2>
      <p>${base.titulo}</p>
    </div>

    <div class="charts-grid" style="grid-template-columns:1fr 1fr">
      <div class="chart-card">
        <h3>${base.titulo} (${base.tipo})</h3>
        <div class="chart-wrapper">
          <canvas id="baseChart"></canvas>
        </div>
      </div>

      <div class="chart-card">
        <h3>${base.titulo} (${selectedType})</h3>
        <div class="chart-wrapper">
          <canvas id="compareChart"></canvas>
        </div>
      </div>
    </div>
  `;

  setupChart(base, document.getElementById("baseChart"));
  setupChart({ ...base, tipo: selectedType }, document.getElementById("compareChart"));
}

//EXPORTAR IMAGEM
function exportChartsAsImage() {
  if (!charts.length) return;

  const link = document.createElement("a");
  link.download = "dashboard.png";
  link.href = charts[0].toBase64Image();
  link.click();
}

/* ============================================================
   RENDERIZAR DASHBOARD
============================================================ */
function renderDashboard(dashboard) {
  lastDashboardState = dashboard;

  charts.forEach(c => c.destroy());
  charts = [];

  emptyState.style.display = "none";

  const dashboardContent = document.getElementById("dashboardContent");
  if (!dashboardContent) return;

  dashboardContent.innerHTML = `
  <div class="charts-grid" id="chartsGrid"></div>
`;

  const grid = document.getElementById("chartsGrid");

  dashboard.graficos.forEach((g, index) => {
    const card = document.createElement("div");
    card.className = "chart-card";

    const canvasId = "chart_" + index + "_" + Date.now();

    card.innerHTML = `
      <h3>${g.titulo}</h3>
      <p>${g.descricao || ""}</p>
      <div class="chart-wrapper">
        <canvas id="${canvasId}"></canvas>
      </div>
    `;

    grid.appendChild(card);
    setupChart(g, document.getElementById(canvasId), card);
  });

  createDashboardButtons(dashboard);

  // atualiza título e select SEM recriar botões
  updateDashboardControls(dashboard);
}

function updateDashboardControls(dashboard) {
  const titleEl = document.getElementById("activeChartTitle");
  const selectEl = document.getElementById("activeChartSelect");

  if (!titleEl || !selectEl) return;

  titleEl.textContent = dashboard.graficos[0].titulo;

  selectEl.innerHTML = "";
  dashboard.graficos.forEach((g, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = g.titulo;
    selectEl.appendChild(opt);
  });

  activeChartIndex = 0;
}

/* ============================================================
   RENDERIZAR DADOS REST
============================================================ */
async function renderRestData(restPayload) {
  try {
    let url = `${SDK_API_BASE}/api/v1/${restPayload.entidade}`;

    console.log("Fetching REST:", url);

    const resp = await fetch(url, {
      headers: {
        "x-api-key": "secret-demo-3478",
        Authorization: "Bearer demo-bearer-12345",
      },
    });

    const json = await resp.json();
    const data = json.data || [];

    if (data.length === 0) {
      addMessage("Nenhum resultado encontrado.", "assistant");
      return;
    }

    addMessage(` Encontrei ${data.length} resultado(s)!`, "assistant");

    emptyState.style.display = "none";

    const campos = restPayload.campos || Object.keys(data[0]);

    let tableHTML = `
      <div class="dashboard-content">
        <div class="dashboard-header">
          <h2>Resultados da Consulta</h2>
          <p>${restPayload.entidade}</p>
        </div>
        <div style="overflow-x: auto; padding: 20px;">
          <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden;">
            <thead>
              <tr style="background: #667eea; color: white;">
    `;

    campos.forEach(campo => {
      tableHTML += `<th style="padding: 12px; text-align: left; font-weight: 600;">${campo}</th>`;
    });

    tableHTML += `</tr></thead><tbody>`;

    data.slice(0, 50).forEach((item, index) => {
      const bgColor = index % 2 === 0 ? '#f8f9fa' : 'white';
      tableHTML += `<tr style="background: ${bgColor};">`;

      campos.forEach(campo => {
        tableHTML += `<td style="padding: 12px; border-bottom: 1px solid #e9ecef;">${item[campo] || '-'}</td>`;
      });

      tableHTML += `</tr>`;
    });

    tableHTML += `</tbody></table></div></div>`;

    dashboardSection.innerHTML = tableHTML;

  } catch (err) {
    console.error("Erro ao buscar dados REST:", err);
    addMessage(" Erro ao buscar dados: " + err.message, "system");
  }
}

/* ============================================================
   ENVIAR MENSAGEM AO SERVIDOR
============================================================ */
async function sendMessage() {
  const message = messageInput.value.trim();
  if (!message) return;

  addMessage(message, "user");
  messageInput.value = "";
  messageInput.style.height = "auto";

  sendBtn.disabled = true;
  showTyping();

  try {
    const payload = { message, userId, clientId };

    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const raw = await response.text();
    console.log("RAW RECEBIDO:", raw);

    hideTyping();

    const json = parseResponse(raw);
    console.log("JSON PARSED:", json);

    // 🔤 RELATÓRIO / RESUMO (TEXTO PURO)
    if (
      json.intencao === "relatorio" ||
      json.intencao === "resumo" ||
      json.intencao === "texto"
    ) {
      if (json.mensagem) {
        addMessage(json.mensagem, "assistant");
      }
      sendBtn.disabled = false;
      return;
    }

    if (json.intencao === "rest" && json.payload) {
      addMessage(" Buscando informações...", "assistant");
      await renderRestData(json.payload);
      sendBtn.disabled = false;
      return;
    }

    if (json.intencao === "dashboard" && json.dashboard) {
      addMessage("📊 Dashboard gerado com sucesso!", "assistant");
      renderDashboard(json.dashboard);
      sendBtn.disabled = false;
      return;
    }

    if (json.mensagem) {
      addMessage(json.mensagem, "assistant");
      sendBtn.disabled = false;
      return;
    }

    addMessage(raw, "assistant");

  } catch (err) {
    hideTyping();
    addMessage(" Erro: " + err.message, "system");
  }

  sendBtn.disabled = false;
}

/* ============================================================
   ENTER PARA ENVIAR / SHIFT+ENTER PARA NOVA LINHA
============================================================ */
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.shiftKey) return;

  if (e.key === "Enter") {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener("click", sendMessage);

/* ============================================================
   FOCUS
============================================================ */
messageInput.focus();
