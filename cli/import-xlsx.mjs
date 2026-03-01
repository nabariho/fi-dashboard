#!/usr/bin/env node
// === Import from xlsx + BudgetItems.csv → encrypted .fjson ===
// Uses a Python subprocess to read the xlsx (openpyxl) since we need zero npm deps.

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { encrypt } from './crypto.mjs';
import { createInterface } from 'node:readline';

function askSecret(prompt) {
  return new Promise(function(resolve) {
    process.stderr.write(prompt);
    var input = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', function handler(ch) {
      if (ch === '\n' || ch === '\r' || ch === '\u0004') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', handler);
        process.stderr.write('\n');
        resolve(input);
      } else if (ch === '\u007F' || ch === '\b') {
        if (input.length > 0) input = input.slice(0, -1);
      } else if (ch === '\u0003') {
        process.exit(1);
      } else {
        input += ch;
      }
    });
  });
}

// Extract data from xlsx using Python
const xlsxPath = process.argv[2];
const budgetCsvPath = process.argv[3];
const outPath = process.argv[4];

if (!xlsxPath || !outPath) {
  console.error('Usage: node cli/import-xlsx.mjs <xlsx-path> <budget-csv-path> <output-fjson-path>');
  console.error('Example: node cli/import-xlsx.mjs "Personal Finances Dashboard.xlsx" BudgetItems.csv ~/iCloud/fi-data.fjson');
  process.exit(1);
}

// Write Python extraction script to a temp file to avoid shell quoting issues
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync } from 'node:fs';

const pythonScript = [
  'import openpyxl, json, sys',
  'wb = openpyxl.load_workbook(sys.argv[1], data_only=True)',
  'config = {}',
  "ws = wb['Config']",
  'for row in ws.iter_rows(min_row=2, max_col=2, values_only=True):',
  "    if row[0] and row[0] != 'key':",
  '        config[str(row[0]).strip()] = float(row[1]) if row[1] is not None else 0',
  'accounts = []',
  "ws = wb['Accounts']",
  'for row in ws.iter_rows(min_row=2, max_col=6, values_only=True):',
  '    if not row[0]: continue',
  '    accounts.append({',
  "        'account_id': str(row[0]),",
  "        'account_name': str(row[1]),",
  "        'type': str(row[2]),",
  "        'currency': str(row[3]) if row[3] else 'EUR',",
  "        'include_networth': bool(row[4]),",
  "        'include_performance': bool(row[5])",
  '    })',
  'data = []',
  "ws = wb['MonthEnd']",
  'for row in ws.iter_rows(max_col=4, values_only=True):',
  '    if row[0] is None: continue',
  '    d = row[0]',
  "    if hasattr(d, 'strftime'):",
  "        month = d.strftime('%Y-%m')",
  '    else:',
  '        month = str(d)[:7]',
  '    data.append({',
  "        'month': month,",
  "        'account_id': str(row[1]),",
  "        'end_value': float(row[2]) if row[2] else 0,",
  "        'net_contribution': float(row[3]) if row[3] else 0,",
  "        'notes': ''",
  '    })',
  "print(json.dumps({'config': config, 'accounts': accounts, 'data': data}))",
].join('\n');

const tmpPy = join(tmpdir(), 'fi-extract-' + Date.now() + '.py');
writeFileSync(tmpPy, pythonScript);

console.error('Reading xlsx with Python...');
let jsonStr;
try {
  jsonStr = execSync(`python3 ${JSON.stringify(tmpPy)} ${JSON.stringify(xlsxPath)}`, {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024
  });
} finally {
  try { unlinkSync(tmpPy); } catch (_) {}
}

const extracted = JSON.parse(jsonStr);
console.error(`  Config: ${Object.keys(extracted.config).length} keys`);
console.error(`  Accounts: ${extracted.accounts.length}`);
console.error(`  MonthEnd rows: ${extracted.data.length}`);

// Parse BudgetItems CSV
let budgetItems = [];
if (budgetCsvPath) {
  try {
    const csv = readFileSync(budgetCsvPath, 'utf8').trim().split('\n');
    const headers = csv[0].split(',').map(h => h.trim());
    budgetItems = csv.slice(1).filter(l => l.trim()).map(line => {
      const vals = line.split(',').map(v => v.trim());
      const obj = {};
      headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
      return {
        item_id: obj.item_id,
        name: obj.name,
        type: obj.type,
        amount: parseFloat(obj.amount) || 0,
        frequency: obj.frequency,
        category: obj.category,
        active: obj.active === 'TRUE' || obj.active === 'true'
      };
    });
    console.error(`  Budget items: ${budgetItems.length}`);
  } catch (e) {
    console.error(`  Budget CSV not found or error: ${e.message}. Continuing without budget items.`);
  }
}

const fullData = {
  config: extracted.config,
  accounts: extracted.accounts,
  data: extracted.data,
  budgetItems: budgetItems
};

// Encrypt
const passphrase = await askSecret('New passphrase: ');
const confirm = await askSecret('Confirm passphrase: ');
if (passphrase !== confirm) {
  console.error('Error: Passphrases do not match');
  process.exit(1);
}

const encrypted = encrypt(fullData, passphrase);
writeFileSync(outPath, JSON.stringify(encrypted, null, 2));
console.error(`\nEncrypted file written to: ${outPath}`);
console.error('Done!');
