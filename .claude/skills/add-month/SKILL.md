# Skill: Add Month-End Data

Record month-end financial data using the CLI tool.

## Usage
```bash
node cli/fi-data.mjs add-month --file <path-to-fjson>
```

## Steps
1. Prompts for passphrase
2. Decrypts the data file
3. Prompts for: month (YYYY-MM), account_id, end_value, net_contribution
4. Appends the new row to the data array
5. Re-encrypts and saves
