#!/usr/bin/env node
// === FI Data CLI — Zero external dependencies ===
// Manages encrypted .fjson data files for the Financial Independence Dashboard.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encrypt, decrypt } from './crypto.mjs';

// --- Helpers ---

function rl() {
  return createInterface({ input: process.stdin, output: process.stderr });
}

function ask(prompt) {
  return new Promise(function(resolve) {
    var r = rl();
    r.question(prompt, function(answer) {
      r.close();
      resolve(answer.trim());
    });
  });
}

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

function parseArgs() {
  var args = process.argv.slice(2);
  var command = args[0];
  var flags = {};
  for (var i = 1; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length) {
      flags[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return { command: command, flags: flags };
}

function readJSON(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function die(msg) {
  console.error('Error: ' + msg);
  process.exit(1);
}

// --- Commands ---

async function cmdInit(flags) {
  var fromPath = flags.from;
  var outPath = flags.out;
  if (!fromPath || !outPath) die('Usage: init --from <json> --out <fjson>');
  if (!existsSync(fromPath)) die('File not found: ' + fromPath);

  var data = readJSON(fromPath);
  var passphrase = await askSecret('New passphrase: ');
  var confirm = await askSecret('Confirm passphrase: ');
  if (passphrase !== confirm) die('Passphrases do not match');

  var encrypted = encrypt(data, passphrase);
  writeFileSync(outPath, JSON.stringify(encrypted, null, 2));
  console.error('Encrypted file written to: ' + outPath);
}

async function cmdExport(flags) {
  var filePath = flags.file;
  var outPath = flags.out;
  if (!filePath || !outPath) die('Usage: export --file <fjson> --out <json>');
  if (!existsSync(filePath)) die('File not found: ' + filePath);

  var passphrase = await askSecret('Passphrase: ');
  var encrypted = readJSON(filePath);
  var data;
  try {
    data = decrypt(encrypted, passphrase);
  } catch (e) {
    die('Decryption failed. Wrong passphrase?');
  }

  writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.error('Decrypted data written to: ' + outPath);
}

async function cmdAddMonth(flags) {
  var filePath = flags.file;
  if (!filePath) die('Usage: add-month --file <fjson>');
  if (!existsSync(filePath)) die('File not found: ' + filePath);

  var passphrase = await askSecret('Passphrase: ');
  var encrypted = readJSON(filePath);
  var data;
  try {
    data = decrypt(encrypted, passphrase);
  } catch (e) {
    die('Decryption failed. Wrong passphrase?');
  }

  // Show available accounts
  console.error('\nAvailable accounts:');
  data.accounts.forEach(function(a) {
    console.error('  ' + a.account_id + ' (' + a.account_name + ')');
  });

  var month = await ask('\nMonth (YYYY-MM): ');
  var accountId = await ask('Account ID: ');
  var endValue = parseFloat(await ask('End value: '));
  var netContribution = parseFloat(await ask('Net contribution: '));
  var notes = await ask('Notes (optional): ');

  if (isNaN(endValue) || isNaN(netContribution)) die('Invalid numeric value');

  data.data.push({
    month: month,
    account_id: accountId,
    end_value: endValue,
    net_contribution: netContribution,
    notes: notes || ''
  });

  var reEncrypted = encrypt(data, passphrase);
  writeFileSync(filePath, JSON.stringify(reEncrypted, null, 2));
  console.error('Added row for ' + month + ' / ' + accountId + '. File saved.');
}

async function cmdEditConfig(flags) {
  var filePath = flags.file;
  if (!filePath) die('Usage: edit-config --file <fjson>');
  if (!existsSync(filePath)) die('File not found: ' + filePath);

  var passphrase = await askSecret('Passphrase: ');
  var encrypted = readJSON(filePath);
  var data;
  try {
    data = decrypt(encrypted, passphrase);
  } catch (e) {
    die('Decryption failed. Wrong passphrase?');
  }

  var tmpFile = join(tmpdir(), 'fi-data-' + Date.now() + '.json');
  writeFileSync(tmpFile, JSON.stringify(data, null, 2));

  var editor = process.env.EDITOR || 'vi';
  execSync(editor + ' ' + tmpFile, { stdio: 'inherit' });

  var edited = readJSON(tmpFile);
  var reEncrypted = encrypt(edited, passphrase);
  writeFileSync(filePath, JSON.stringify(reEncrypted, null, 2));
  console.error('Config updated and re-encrypted.');
}

async function cmdImportSheets(flags) {
  var outPath = flags.out;
  if (!outPath) die('Usage: import-sheets --config <csv> --accounts <csv> --data <csv> --budget <csv> --out <fjson>');

  function parseCSV(path) {
    if (!path || !existsSync(path)) return [];
    var lines = readFileSync(path, 'utf8').trim().split('\n');
    if (lines.length < 2) return [];
    var headers = lines[0].split(',').map(function(h) { return h.trim(); });
    return lines.slice(1).map(function(line) {
      var values = line.split(',').map(function(v) { return v.trim(); });
      var obj = {};
      headers.forEach(function(h, i) { obj[h] = values[i] || ''; });
      return obj;
    });
  }

  // Parse config (key,value)
  var configRows = parseCSV(flags.config);
  var config = {};
  configRows.forEach(function(r) {
    config[r.key] = parseFloat(r.value) || 0;
  });

  // Parse accounts
  var accountRows = parseCSV(flags.accounts);
  var accounts = accountRows.map(function(r) {
    return {
      account_id: r.account_id,
      account_name: r.account_name,
      type: r.type,
      currency: r.currency || 'EUR',
      include_networth: r.include_networth === 'TRUE' || r.include_networth === 'true',
      include_performance: r.include_performance === 'TRUE' || r.include_performance === 'true'
    };
  });

  // Parse MonthEnd data
  var dataRows = parseCSV(flags.data);
  var data = dataRows.map(function(r) {
    return {
      month: r.month,
      account_id: r.account_id,
      end_value: parseFloat(r.end_value) || 0,
      net_contribution: parseFloat(r.net_contribution) || 0,
      notes: r.notes || ''
    };
  });

  // Parse budget items
  var budgetRows = parseCSV(flags.budget);
  var budgetItems = budgetRows.map(function(r) {
    return {
      item_id: r.item_id,
      name: r.name,
      type: r.type,
      amount: parseFloat(r.amount) || 0,
      frequency: r.frequency,
      category: r.category,
      active: r.active === 'TRUE' || r.active === 'true'
    };
  });

  var fullData = {
    config: config,
    accounts: accounts,
    data: data,
    budgetItems: budgetItems
  };

  var passphrase = await askSecret('New passphrase: ');
  var confirm = await askSecret('Confirm passphrase: ');
  if (passphrase !== confirm) die('Passphrases do not match');

  var encrypted = encrypt(fullData, passphrase);
  writeFileSync(outPath, JSON.stringify(encrypted, null, 2));
  console.error('Imported ' + data.length + ' rows, ' + accounts.length + ' accounts, ' + budgetItems.length + ' budget items.');
  console.error('Encrypted file written to: ' + outPath);
}

// --- Main ---

async function main() {
  var parsed = parseArgs();

  switch (parsed.command) {
    case 'init':
      return cmdInit(parsed.flags);
    case 'export':
      return cmdExport(parsed.flags);
    case 'add-month':
      return cmdAddMonth(parsed.flags);
    case 'edit-config':
      return cmdEditConfig(parsed.flags);
    case 'import-sheets':
      return cmdImportSheets(parsed.flags);
    default:
      console.error('FI Data CLI');
      console.error('');
      console.error('Commands:');
      console.error('  init           Create encrypted file from unencrypted JSON');
      console.error('  add-month      Add a month-end data row');
      console.error('  edit-config    Edit data in $EDITOR, re-encrypt on save');
      console.error('  export         Decrypt to plain JSON');
      console.error('  import-sheets  Import from Google Sheets CSV exports');
      console.error('');
      console.error('Options:');
      console.error('  --file <path>  Path to .fjson file');
      console.error('  --out <path>   Output path');
      console.error('  --from <path>  Source JSON (for init)');
      console.error('  --config, --accounts, --data, --budget <csv>  CSV files (for import-sheets)');
      process.exit(1);
  }
}

main().catch(function(err) {
  console.error(err.message);
  process.exit(1);
});
