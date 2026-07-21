export type ProductSummary = { name: string; units: number; revenue: number };
export type CsvReport = { rows: number; valid: number; invalid: number; revenue: number; units: number; average: number; ranking: ProductSummary[] };

const normalize = (v: string) => v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const decimal = (value: string) => {
  const clean = value.trim().replace(/R\$|\s/g, '');
  return Number(clean.includes(',') && clean.includes('.') ? clean.replace(/\./g, '').replace(',', '.') : clean.replace(',', '.')) || 0;
};
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const separator = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const out: string[][] = []; let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) { const c = text[i], next = text[i + 1];
    if (c === '"' && quoted && next === '"') { field += c; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === separator && !quoted) { row.push(field.trim()); field = ''; }
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

/** Analisa CSVs em blocos para evitar manter arquivos grandes inteiros na memória. */
export async function analyseCsvStream(chunks: AsyncIterable<Uint8Array | string>): Promise<CsvReport> {
  let headerRead = false, product = -1, value = -1, quantity = -1;
  let row: string[] = [], field = '', quoted = false, pendingQuote = false;
  let separator: ',' | ';' | undefined, headerCommas = 0, headerSemicolons = 0;
  let rows = 0, valid = 0, invalid = 0, revenue = 0, units = 0;
  const entries = new Map<string, ProductSummary>();
  const find = (headers: string[], names: string[]) => headers.findIndex(h => names.some(n => h.includes(n)));

  const consumeRow = () => {
    row.push(field.trim()); field = '';
    if (!row.some(Boolean)) { row = []; return; }
    if (!headerRead) {
      const headers = row.map(normalize);
      product = find(headers, ['produto', 'product', 'item', 'descricao', 'nome']);
      value = find(headers, ['valor', 'preco', 'receita', 'venda', 'total', 'amount']);
      quantity = find(headers, ['quantidade', 'qtd', 'quantity', 'unidades']);
      if (product < 0 || value < 0) throw new Error('São obrigatórias as colunas produto e valor.');
      separator = headerSemicolons > headerCommas ? ';' : ',';
      headerRead = true; row = []; return;
    }
    rows++;
    const name = row[product]?.trim(); const amount = decimal(row[value] ?? ''); const qty = quantity < 0 ? 1 : decimal(row[quantity] ?? '') || 1;
    if (!name || amount <= 0) invalid++;
    else { valid++; revenue += amount; units += qty; const old = entries.get(name) ?? {name, units: 0, revenue: 0}; old.units += qty; old.revenue += amount; entries.set(name, old); }
    row = [];
  };

  const decoder = new TextDecoder();
  const processCharacter = (char: string) => {
    if (pendingQuote) {
      pendingQuote = false;
      if (char === '"') { field += '"'; return; }
      quoted = false;
    }
    if (quoted) {
      if (char === '"') pendingQuote = true;
      else field += char;
      return;
    }
    if (char === '"') { quoted = true; return; }
    if (char === ',' || char === ';') {
      if (!headerRead) {
        if (char === ',') headerCommas++; else headerSemicolons++;
      }
      if (!separator || char === separator) { row.push(field.trim()); field = ''; }
      else field += char;
      return;
    }
    if (char === '\n' || char === '\r') { consumeRow(); return; }
    field += char;
  };

  for await (const chunk of chunks) {
    const text = typeof chunk === 'string' ? chunk : decoder.decode(chunk, {stream: true});
    for (const char of text) processCharacter(char);
  }
  const remaining = decoder.decode();
  for (const char of remaining) processCharacter(char);
  if (pendingQuote) { pendingQuote = false; quoted = false; }
  if (quoted) throw new Error('O CSV possui aspas não finalizadas.');
  if (field || row.length) consumeRow();
  if (!headerRead || rows === 0) throw new Error('O CSV precisa ter cabeçalho e ao menos um registro.');
  if (!valid) throw new Error('Nenhum registro válido foi encontrado.');
  return {rows, valid, invalid, revenue, units, average: revenue / valid, ranking: [...entries.values()].sort((a,b) => b.revenue - a.revenue)};
}
