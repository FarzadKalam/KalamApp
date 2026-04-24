const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const moduleRegistryPath = path.join(projectRoot, 'moduleRegistry.ts');

const ASSIGNEE_KEYS = ['assignee_id', 'assignee_role_id', 'assignee_type'];
const DOMAIN_ASSIGNEE_KEYS = ['responsible_id', 'assigned_reviewer_id', 'owner_id', 'manager_id', 'operator_id'];
const FILE_LIKE_KEY_PATTERN = /(^|_)(attachment|file|image|document|receipt|recording|avatar|logo|photo)(_|$)/i;

const readFile = (filePath) => fs.readFileSync(filePath, 'utf8');

const naturalCompare = (left, right) => left.localeCompare(right, 'en', { numeric: true, sensitivity: 'base' });

const parseImports = (content) => {
  const imports = new Map();
  const namedImportPattern = /^import\s+\{([^}]+)\}\s+from\s+['"](.+?)['"];?$/gm;
  const defaultImportPattern = /^import\s+([A-Za-z0-9_]+)\s+from\s+['"](.+?)['"];?$/gm;

  let match;
  while ((match = namedImportPattern.exec(content)) !== null) {
    const names = match[1]
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => item.split(/\s+as\s+/i).pop().trim());
    const source = match[2];
    names.forEach((name) => imports.set(name, source));
  }

  while ((match = defaultImportPattern.exec(content)) !== null) {
    imports.set(match[1], match[2]);
  }

  return imports;
};

const parseBaseModules = (content) => {
  const blockMatch = content.match(/const\s+BASE_MODULES\s*:\s*Record<string,\s*ModuleDefinition>\s*=\s*\{([\s\S]*?)\n\};/);
  if (!blockMatch) return [];
  const rows = [];
  const rowPattern = /^\s*([a-z0-9_]+):\s*([A-Za-z0-9_]+),?$/gm;
  let match;
  while ((match = rowPattern.exec(blockMatch[1])) !== null) {
    rows.push({ moduleId: match[1], symbol: match[2] });
  }
  return rows;
};

const resolveModuleDefinitions = () => {
  const registryContent = readFile(moduleRegistryPath);
  const imports = parseImports(registryContent);
  const baseModules = parseBaseModules(registryContent);

  return baseModules.map(({ moduleId, symbol }) => {
    const importSource = imports.get(symbol);
    const normalizedSource = String(importSource || '').replace(/^\.\//, '');
    return {
      moduleId,
      symbol,
      filePath: importSource ? path.join(projectRoot, `${normalizedSource}.ts`) : null,
    };
  });
};

const extractObjectLiteral = (content, symbol) => {
  const symbolPattern = new RegExp(`export\\s+const\\s+${symbol}\\b[\\s\\S]*?=\\s*\\{`, 'm');
  const match = symbolPattern.exec(content);
  if (!match) return null;
  const startIndex = content.indexOf('{', match.index);
  if (startIndex < 0) return null;

  let depth = 0;
  let inString = false;
  let stringQuote = '';
  let escaping = false;

  for (let index = startIndex; index < content.length; index += 1) {
    const char = content[index];
    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }
      if (char === '\\') {
        escaping = true;
        continue;
      }
      if (char === stringQuote) {
        inString = false;
        stringQuote = '';
      }
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      inString = true;
      stringQuote = char;
      continue;
    }

    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return content.slice(startIndex, index + 1);
      }
    }
  }

  return null;
};

const collectFieldKeys = (snippet) => {
  const keys = [];
  const keyPattern = /key:\s*['"]([^'"]+)['"]/gm;
  let match;
  while ((match = keyPattern.exec(snippet)) !== null) {
    keys.push(match[1]);
  }
  return Array.from(new Set(keys));
};

const isFileLikeKey = (value) => FILE_LIKE_KEY_PATTERN.test(String(value || '').trim().toLowerCase());

const analyzeModuleSchema = ({ moduleId, symbol, filePath }) => {
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      moduleId,
      symbol,
      filePath,
      table: moduleId,
      fieldKeys: [],
      hasGenericStatusField: false,
      hasGenericAssigneeField: false,
      hasFileLikeField: false,
      domainStatusKeys: [],
      domainAssigneeKeys: [],
    };
  }

  const content = readFile(filePath);
  const snippet = extractObjectLiteral(content, symbol) || content;
  const analysisSource = snippet.includes('fields: [') ? snippet : content;
  const fieldKeys = collectFieldKeys(analysisSource);
  const tableMatch = snippet.match(/table:\s*['"]([^'"]+)['"]/);
  const domainStatusKeys = fieldKeys.filter((key) => key !== 'status' && (key === 'is_active' || key.endsWith('_status')));
  const domainAssigneeKeys = fieldKeys.filter((key) => DOMAIN_ASSIGNEE_KEYS.includes(key));
  const hasFileLikeField = /FieldType\.IMAGE/.test(analysisSource) || fieldKeys.some((key) => isFileLikeKey(key));

  return {
    moduleId,
    symbol,
    filePath,
    table: tableMatch ? tableMatch[1] : moduleId,
    fieldKeys,
    hasGenericStatusField: fieldKeys.includes('status'),
    hasGenericAssigneeField: fieldKeys.includes('assignee_id'),
    hasFileLikeField,
    domainStatusKeys,
    domainAssigneeKeys,
  };
};

const parseColumnsFromCreateStatement = (statement) => {
  const columnPattern = /^\s*([a-z_][a-z0-9_]*)\s+/gm;
  const columns = new Set();
  let match;
  while ((match = columnPattern.exec(statement)) !== null) {
    const columnName = match[1];
    if (['constraint', 'primary', 'foreign', 'unique', 'check'].includes(columnName)) continue;
    columns.add(columnName);
  }
  return columns;
};

const buildDatabaseColumnIndex = () => {
  const sqlFiles = fs.readdirSync(projectRoot)
    .filter((fileName) => /^database_v1_phase.*\.sql$/i.test(fileName))
    .sort(naturalCompare);

  const tableColumns = new Map();

  const ensureTable = (tableName) => {
    if (!tableColumns.has(tableName)) tableColumns.set(tableName, new Set());
    return tableColumns.get(tableName);
  };

  sqlFiles.forEach((fileName) => {
    const content = readFile(path.join(projectRoot, fileName));

    const createPattern = /create table(?: if not exists)?\s+public\.([a-z0-9_]+)\s*\(([\s\S]*?)\);/gim;
    let createMatch;
    while ((createMatch = createPattern.exec(content)) !== null) {
      const tableName = createMatch[1];
      const statementColumns = parseColumnsFromCreateStatement(createMatch[2]);
      const tableSet = ensureTable(tableName);
      statementColumns.forEach((column) => tableSet.add(column));
    }

    const alterPattern = /alter table(?: if exists)?(?: only)?\s+public\.([a-z0-9_]+)\s+([\s\S]*?);/gim;
    let alterMatch;
    while ((alterMatch = alterPattern.exec(content)) !== null) {
      const tableName = alterMatch[1];
      const statementBody = alterMatch[2];
      const tableSet = ensureTable(tableName);

      const addColumnPattern = /add column(?: if not exists)?\s+([a-z_][a-z0-9_]*)/gim;
      let addMatch;
      while ((addMatch = addColumnPattern.exec(statementBody)) !== null) {
        tableSet.add(addMatch[1]);
      }

      const dropColumnPattern = /drop column(?: if exists)?\s+([a-z_][a-z0-9_]*)/gim;
      let dropMatch;
      while ((dropMatch = dropColumnPattern.exec(statementBody)) !== null) {
        tableSet.delete(dropMatch[1]);
      }
    }
  });

  return { sqlFiles, tableColumns };
};

const classifyStatus = (row) => {
  if (row.hasGenericStatusField) return 'already_generic';
  if (row.dbHasGenericStatus && row.domainStatusKeys.length === 0) return 'can_add_in_frontend';
  if (row.domainStatusKeys.length > 0) return 'keep_domain_specific';
  return 'needs_db_migration';
};

const classifyAssignee = (row) => {
  if (row.hasGenericAssigneeField) return 'already_generic';
  if (row.dbHasGenericAssignee && row.domainAssigneeKeys.length === 0) return 'can_add_in_frontend';
  if (row.domainAssigneeKeys.length > 0) return 'keep_domain_specific';
  return 'needs_db_migration';
};

const classifyFiles = (row, hasRecordFilesSupport) => {
  if (row.hasFileLikeField) return 'already_schema_level';
  if (row.dbHasFileLikeColumns) return 'can_add_schema_field';
  if (hasRecordFilesSupport) return 'prefer_record_files_manager';
  return 'needs_file_support';
};

const formatModuleLine = (row, extra = '') => {
  const detail = extra ? ` - ${extra}` : '';
  return `- ${row.moduleId}${detail}`;
};

const groupRowsBy = (rows, classifier) => rows.reduce((acc, row) => {
  const key = classifier(row);
  if (!acc[key]) acc[key] = [];
  acc[key].push(row);
  return acc;
}, {});

const moduleDefinitions = resolveModuleDefinitions();
const schemaRows = moduleDefinitions.map(analyzeModuleSchema);
const { sqlFiles, tableColumns } = buildDatabaseColumnIndex();
const hasRecordFilesSupport = fs.existsSync(path.join(projectRoot, 'components', 'RecordFilesManager.tsx'))
  && sqlFiles.some((fileName) => /record_files/i.test(readFile(path.join(projectRoot, fileName))));

const enrichedRows = schemaRows.map((row) => {
  const dbColumns = tableColumns.get(row.table) || new Set();
  const dbFileLikeColumns = Array.from(dbColumns).filter((column) => isFileLikeKey(column));
  return {
    ...row,
    dbColumns,
    dbHasGenericStatus: dbColumns.has('status'),
    dbHasGenericAssignee: ASSIGNEE_KEYS.some((key) => dbColumns.has(key)),
    dbFileLikeColumns,
    dbHasFileLikeColumns: dbFileLikeColumns.length > 0,
  };
});

const statusGroups = groupRowsBy(enrichedRows, classifyStatus);
const assigneeGroups = groupRowsBy(enrichedRows, classifyAssignee);
const fileGroups = groupRowsBy(enrichedRows, (row) => classifyFiles(row, hasRecordFilesSupport));

console.log('Standard Module Field Audit');
console.log('===========================');
console.log(`Modules scanned from moduleRegistry: ${enrichedRows.length}`);
console.log(`Migration files scanned: ${sqlFiles.length}`);
console.log(`RecordFilesManager support detected: ${hasRecordFilesSupport ? 'yes' : 'no'}`);
console.log('');

console.log('Status');
console.log('------');
(statusGroups.already_generic || []).forEach((row) => console.log(formatModuleLine(row, 'already has generic status')));
(statusGroups.can_add_in_frontend || []).forEach((row) => console.log(formatModuleLine(row, 'db has status column but config does not expose it')));
(statusGroups.keep_domain_specific || []).forEach((row) => console.log(formatModuleLine(row, `keep domain-specific status fields: ${row.domainStatusKeys.join(', ')}`)));
(statusGroups.needs_db_migration || []).forEach((row) => console.log(formatModuleLine(row, 'no generic status in config or migrations')));
console.log('');

console.log('Assignee');
console.log('--------');
(assigneeGroups.already_generic || []).forEach((row) => console.log(formatModuleLine(row, 'already has generic assignee')));
(assigneeGroups.can_add_in_frontend || []).forEach((row) => console.log(formatModuleLine(row, 'db has assignee columns but config does not expose them')));
(assigneeGroups.keep_domain_specific || []).forEach((row) => console.log(formatModuleLine(row, `keep domain-specific owner fields: ${row.domainAssigneeKeys.join(', ')}`)));
(assigneeGroups.needs_db_migration || []).forEach((row) => console.log(formatModuleLine(row, 'no generic assignee in config or migrations')));
console.log('');

console.log('Files');
console.log('-----');
(fileGroups.already_schema_level || []).forEach((row) => console.log(formatModuleLine(row, 'already has schema-level image/file-like field')));
(fileGroups.can_add_schema_field || []).forEach((row) => console.log(formatModuleLine(row, `db has file-like columns: ${row.dbFileLikeColumns.join(', ')}`)));
(fileGroups.prefer_record_files_manager || []).forEach((row) => console.log(formatModuleLine(row, 'prefer generic RecordFilesManager instead of forcing image/file field')));
(fileGroups.needs_file_support || []).forEach((row) => console.log(formatModuleLine(row, 'no file-like schema fields or generic record_files support detected')));
