export type ProductSummary = { name: string; units: number; revenue: number };
export type CsvReport = { rows: number; valid: number; invalid: number; revenue: number; units: number; average: number; ranking: ProductSummary[] };

const normalize = (v: string) => v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const decimal = (value: string) => {
  const clean = value.trim().replace(/R\$|\s/g, '');
  return Number(clean.includes(',') && clean.includes('.') ? clean.replace(/\./g, '').replace(',', '.') : clean.replace(',', '.')) || 0;
};
export function parseCsv(text: string): string[][] {
  const out: string[][] = []; let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) { const c = text[i], next = text[i + 1];
    if (c === '"' && quoted && next === '"') { field += c; i++; }
    else if (c === '"') quoted = !quoted;
    else if ((c === ',' || c === ';') && !quoted) { row.push(field.trim()); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && next === '\n') i++; row.push(field.trim()); if (row.some(Boolean)) out.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field.trim()); out.push(row); } return out;
}
export function analyseCsv(text: string): CsvReport {
  const rows = parseCsv(text); if (rows.length < 2) throw new Error('O CSV precisa ter cabeçalho e ao menos um registro.');
  const headers = rows[0].map(normalize); const find = (names: string[]) => headers.findIndex(h => names.some(n => h.includes(n)));
  const product = find(['produto', 'product', 'item', 'descricao', 'nome']); const value = find(['valor', 'preco', 'receita', 'venda', 'total', 'amount']); const quantity = find(['quantidade', 'qtd', 'quantity', 'unidades']);
  if (product < 0 || value < 0) throw new Error('São obrigatórias as colunas produto e valor.');
  const entries = new Map<string, ProductSummary>(); let revenue = 0, units = 0, valid = 0, invalid = 0;
  for (const row of rows.slice(1)) { const name = row[product]?.trim(); const amount = decimal(row[value] ?? ''); const qty = quantity < 0 ? 1 : decimal(row[quantity] ?? '') || 1;
    if (!name || amount <= 0) { invalid++; continue; } valid++; revenue += amount; units += qty; const old = entries.get(name) ?? {name, units: 0, revenue: 0}; old.units += qty; old.revenue += amount; entries.set(name, old); }
  if (!valid) throw new Error('Nenhum registro válido foi encontrado.');
  return {rows: rows.length - 1, valid, invalid, revenue, units, average: revenue / valid, ranking: [...entries.values()].sort((a,b) => b.revenue - a.revenue)};
}
