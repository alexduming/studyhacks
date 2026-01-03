import { sql } from 'drizzle-orm';
import { db } from '@/core/db';
import * as fs from 'fs';
import * as path from 'path';
import * as schema from '@/config/db/schema';

// 递归遍历目录查找 .ts/.tsx 文件
function getAllFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next' && file !== '.git') {
        getAllFiles(filePath, fileList);
      }
    } else {
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        fileList.push(filePath);
      }
    }
  });
  return fileList;
}

// 提取代码中使用的列引用
// 例如：user.email -> table: user, column: email
function extractColumnUsages(files: string[]): Map<string, Set<string>> {
  const usages = new Map<string, Set<string>>();
  
  // 简单的正则匹配：tableName.columnName
  // 这不是完美的 AST 解析，但能覆盖大部分 Drizzle 用法
  // 我们利用 schema 导出名作为表名标识
  
  const schemaTables = Object.keys(schema).filter(k => k !== 'default');
  
  files.forEach(file => {
    const content = fs.readFileSync(file, 'utf-8');
    
    schemaTables.forEach(tableName => {
      // 匹配 pattern: tableName.columnName
      // 排除 tableName.xxx 属性访问如果 xxx 不是列名（这步难做，先全抓再过滤）
      const regex = new RegExp(`\\b${tableName}\\.([a-zA-Z0-9_]+)\\b`, 'g');
      let match;
      while ((match = regex.exec(content)) !== null) {
        const columnVarName = match[1];
        // 排除 Drizzle 表对象的内置属性/方法
        if (['$inferSelect', '$inferInsert', '_', 'getSQL', 'as', '$dynamic', 'name'].includes(columnVarName)) continue;
        
        if (!usages.has(tableName)) {
          usages.set(tableName, new Set());
        }
        usages.get(tableName)?.add(columnVarName);
      }
    });
  });
  
  return usages;
}

async function main() {
  console.log('🔍 开始全面检查：代码引用字段 vs 数据库实际字段...\n');

  try {
    // 1. 获取所有表及其列的映射（从 Schema 定义中获取列名映射）
    // 因为代码里用的是驼峰变量名（如 emailVerified），数据库是下划线（email_verified）
    // 我们需要通过 schema 对象来解析这个映射
    
    console.log('📚 解析 Schema 定义...');
    const schemaMap = new Map<string, { dbTableName: string, columns: Map<string, string> }>();
    
    for (const [key, table] of Object.entries(schema)) {
      if (!(table as any)?.[Symbol.for('drizzle:OriginalName')]) continue; // Skip non-tables
      
      const dbTableName = (table as any)[Symbol.for('drizzle:Name')];
      const columns = new Map<string, string>(); // varName -> dbColumnName
      
      // Drizzle table columns are stored in 'columns' property (internal)
      // Accessing internal structure to get column mapping
      const tableColumns = (table as any)[Symbol.for('drizzle:Columns')];
      if (tableColumns) {
        for (const [colKey, colDef] of Object.entries(tableColumns)) {
          columns.set(colKey, (colDef as any).name);
        }
      }
      
      schemaMap.set(key, { dbTableName, columns });
    }

    // 2. 获取数据库实际结构
    console.log('💾 查询数据库结构...');
    const dbStructure = new Map<string, Set<string>>(); // tableName -> Set<columnName>
    
    const dbTablesResult = await db().execute(sql`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public';
    `);
    
    dbTablesResult.forEach((row: any) => {
      if (!dbStructure.has(row.table_name)) {
        dbStructure.set(row.table_name, new Set());
      }
      dbStructure.get(row.table_name)?.add(row.column_name);
    });

    // 3. 扫描代码引用
    console.log('💻 扫描代码引用...');
    const files = getAllFiles(path.join(process.cwd(), 'src'));
    // Also scan scripts folder
    const scriptFiles = getAllFiles(path.join(process.cwd(), 'scripts'));
    const allFiles = [...files, ...scriptFiles];
    
    const usages = extractColumnUsages(allFiles);

    // 4. 对比分析
    console.log('\n📊 分析结果：\n');
    let errorCount = 0;
    
    for (const [schemaTableName, usedColumns] of usages) {
      const schemaInfo = schemaMap.get(schemaTableName);
      if (!schemaInfo) {
        // 可能是把非表对象当成表了，或者 schema 没导出
        continue; 
      }
      
      const { dbTableName, columns: colMap } = schemaInfo;
      const actualDbColumns = dbStructure.get(dbTableName);
      
      if (!actualDbColumns) {
        console.log(`❌ 表不存在：代码引用了表 '${schemaTableName}' (db: ${dbTableName})，但数据库中不存在该表！`);
        errorCount++;
        continue;
      }
      
      for (const usedColVar of usedColumns) {
        // 1. 检查 schema 中是否有该字段定义
        const dbColName = colMap.get(usedColVar);
        if (!dbColName) {
          // 代码用了 user.xxx，但 schema 中没定义 xxx
          // 这通常是类型错误，或者正则误判
          // console.warn(`⚠️  Schema 未定义：${schemaTableName}.${usedColVar}`);
          continue; 
        }
        
        // 2. 检查数据库中是否有该列
        if (!actualDbColumns.has(dbColName)) {
          console.log(`❌ 字段缺失：代码使用了 ${schemaTableName}.${usedColVar} (映射为 ${dbTableName}.${dbColName})，但数据库中该列不存在！`);
          errorCount++;
        }
      }
    }

    if (errorCount === 0) {
      console.log('✅ 完美！代码引用的所有字段在数据库中都存在。');
    } else {
      console.log(`\n💥 发现 ${errorCount} 个潜在问题，请修复！`);
    }

  } catch (e) {
    console.error('Check failed:', e);
  } finally {
    process.exit(0);
  }
}

main();

