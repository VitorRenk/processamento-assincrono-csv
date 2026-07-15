const $ = (id) => document.getElementById(id);
const input = $("file-input");
let currentReport;

function number(value) {
  if (typeof value !== "string") return Number(value) || 0;
  const clean = value.trim().replace(/R\$|\s/g, "");
  if (clean.includes(",") && clean.includes("."))
    return Number(clean.replace(/\./g, "").replace(",", ".")) || 0;
  return Number(clean.replace(",", ".")) || 0;
}
function csvRows(text) {
  const rows = [];
  let row = [],
    field = "",
    quote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i],
      n = text[i + 1];
    if (c === '"' && quote && n === '"') {
      field += c;
      i++;
    } else if (c === '"') quote = !quote;
    else if ((c === "," || c === ";") && !quote) {
      row.push(field.trim());
      field = "";
    } else if ((c === "\n" || c === "\r") && !quote) {
      if (c === "\r" && n === "\n") i++;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field.trim());
    rows.push(row);
  }
  return rows;
}
function key(headers, choices) {
  return headers.findIndex((h) => choices.some((c) => h.includes(c)));
}
function money(n) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}
function updateProgress(percent, title, description) {
  $("progress-bar").style.width = percent + "%";
  $("progress-number").textContent = percent + "%";
  $("progress-label").textContent = title;
  $("progress-description").textContent = description;
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function start(file) {
  if (!file) return;
  $("upload-panel").classList.add("hidden");
  $("report-panel").classList.add("hidden");
  $("processing-panel").classList.remove("hidden");
  document
    .querySelectorAll(".step")
    .forEach((s, i) => s.classList.toggle("active", i < 2));
  $("file-name").textContent = file.name;
  $("file-meta").textContent =
    `${(file.size / 1024).toFixed(1)} KB · aguardando`;
  try {
    updateProgress(8, "Lendo arquivo", "Carregando os dados enviados.");
    await delay(250);
    const text = await file.text();
    const rows = csvRows(text);
    if (rows.length < 2)
      throw new Error(
        "O arquivo precisa ter cabeçalho e pelo menos um registro.",
      );
    updateProgress(
      25,
      "Validando estrutura",
      "Identificando colunas e verificando registros.",
    );
    await delay(350);
    const headers = rows[0].map((h) =>
      h
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""),
    );
    const product = key(headers, [
      "produto",
      "product",
      "item",
      "descricao",
      "nome",
    ]);
    const quantity = key(headers, [
      "quantidade",
      "qtd",
      "quantity",
      "unidades",
    ]);
    const value = key(headers, [
      "valor",
      "preco",
      "receita",
      "venda",
      "total",
      "amount",
    ]);
    if (product < 0 || value < 0)
      throw new Error(
        "Não encontrei as colunas de produto e valor. Use nomes como “produto” e “valor”.",
      );
    $("check-validate").className = "done";
    $("check-validate").textContent = "✓ Campos obrigatórios validados";
    updateProgress(
      48,
      "Calculando indicadores",
      "Somando vendas e agrupando produtos.",
    );
    await delay(300);
    const items = new Map();
    let revenue = 0,
      units = 0,
      valid = 0,
      invalid = 0;
    rows.slice(1).forEach((row) => {
      const name = row[product]?.trim(),
        amount = number(row[value]);
      const qty = quantity < 0 ? 1 : number(row[quantity]) || 1;
      if (!name || amount <= 0) {
        invalid++;
        return;
      }
      valid++;
      revenue += amount;
      units += qty;
      const old = items.get(name) || { revenue: 0, units: 0 };
      old.revenue += amount;
      old.units += qty;
      items.set(name, old);
    });
    if (!valid)
      throw new Error("Nenhum registro válido foi encontrado no arquivo.");
    $("check-calc").className = "done";
    $("check-calc").textContent = "✓ Indicadores calculados";
    updateProgress(
      79,
      "Gerando relatório",
      "Organizando os resultados para download.",
    );
    await delay(300);
    const ranking = [...items.entries()]
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue);
    currentReport = {
      file: file.name,
      rows: rows.length - 1,
      valid,
      invalid,
      revenue,
      units,
      average: revenue / valid,
      ranking,
    };
    $("check-report").className = "done";
    $("check-report").textContent = "✓ Relatório pronto";
    updateProgress(100, "Concluído", "Seu relatório está pronto.");
    await delay(300);
    renderReport();
  } catch (error) {
    alert(error.message);
    reset();
  }
}
function renderReport() {
  const r = currentReport,
    top = r.ranking[0],
    score = Math.round((r.valid / r.rows) * 100);
  $("processing-panel").classList.add("hidden");
  $("report-panel").classList.remove("hidden");
  document.querySelectorAll(".step").forEach((s) => s.classList.add("active"));
  $("report-subtitle").textContent =
    `${r.file} · ${r.rows.toLocaleString("pt-BR")} registros analisados`;
  $("total-revenue").textContent = money(r.revenue);
  $("valid-rows").textContent =
    `${r.valid.toLocaleString("pt-BR")} registros válidos`;
  $("average-ticket").textContent = money(r.average);
  $("total-items").textContent = r.units.toLocaleString("pt-BR");
  $("top-product").textContent = top.name;
  $("top-product-detail").textContent =
    `${top.units.toLocaleString("pt-BR")} unidades`;
  $("processed-rows").textContent = r.valid.toLocaleString("pt-BR");
  $("invalid-rows").textContent = r.invalid.toLocaleString("pt-BR");
  $("quality-score").textContent = score;
  $("quality-title").textContent =
    score === 100 ? "Base consistente" : "Base com observações";
  $("quality-description").textContent = r.invalid
    ? `${r.invalid} linhas sem dados essenciais foram ignoradas.`
    : "Nenhuma inconsistência foi encontrada.";
  $("ranking-list").innerHTML = r.ranking
    .slice(0, 5)
    .map(
      (p, i) =>
        `<li><span>0${i + 1}</span><div><b>${p.name}</b><br><small>${p.units.toLocaleString("pt-BR")} unidades</small></div><b>${money(p.revenue)}</b></li>`,
    )
    .join("");
}
function reset() {
  input.value = "";
  $("processing-panel").classList.add("hidden");
  $("report-panel").classList.add("hidden");
  $("upload-panel").classList.remove("hidden");
  document
    .querySelectorAll(".step")
    .forEach((s, i) => s.classList.toggle("active", i === 0));
}
function download(name, content, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
input.addEventListener("change", (e) => start(e.target.files[0]));
$("new-file").onclick = reset;
$("cancel-btn").onclick = reset;
["dragenter", "dragover"].forEach((type) =>
  $("drop-zone").addEventListener(type, (e) => {
    e.preventDefault();
    $("drop-zone").classList.add("drag");
  }),
);
["dragleave", "drop"].forEach((type) =>
  $("drop-zone").addEventListener(type, (e) => {
    e.preventDefault();
    $("drop-zone").classList.remove("drag");
  }),
);
$("drop-zone").addEventListener("drop", (e) => start(e.dataTransfer.files[0]));
$("download-csv").onclick = () => {
  const r = currentReport;
  download(
    "resumo-vendas.csv",
    "produto,unidades,faturamento\n" +
      r.ranking
        .map(
          (p) =>
            `"${p.name.replaceAll('"', '""')}",${p.units},${p.revenue.toFixed(2)}`,
        )
        .join("\n"),
    "text/csv;charset=utf-8",
  );
};
$("download-html").onclick = () => {
  const r = currentReport;
  const list = r.ranking
    .map(
      (p) =>
        `<tr><td>${p.name}</td><td>${p.units}</td><td>${money(p.revenue)}</td></tr>`,
    )
    .join("");
  download(
    "relatorio-vendas.html",
    `<!doctype html><meta charset="utf-8"><title>Relatório de vendas</title><style>body{font:16px Arial;max-width:800px;margin:45px auto;color:#17201e}h1{color:#0d4036}table{border-collapse:collapse;width:100%}th,td{padding:12px;border-bottom:1px solid #ddd;text-align:left}.box{padding:20px;background:#eff8d5;margin:20px 0}</style><h1>Relatório de vendas</h1><p>Arquivo: ${r.file}</p><div class="box"><b>Faturamento total:</b> ${money(r.revenue)} &nbsp; | &nbsp; <b>Ticket médio:</b> ${money(r.average)} &nbsp; | &nbsp; <b>Itens:</b> ${r.units}</div><h2>Produtos por faturamento</h2><table><tr><th>Produto</th><th>Unidades</th><th>Faturamento</th></tr>${list}</table>`,
    "text/html;charset=utf-8",
  );
};
