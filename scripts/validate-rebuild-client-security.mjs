import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../supabase/migrations/20260606210000_rebuild_client_security.sql",
  import.meta.url,
);
const migrationPath = fileURLToPath(migrationUrl);
const sourceSql = await readFile(migrationUrl, "utf8");

// Supabase bundles pgcrypto. PGlite does not bundle the extension, while its
// PostgreSQL runtime already provides gen_random_uuid(), so omit only this line.
const executableSql = sourceSql.replace(
  /^\s*create extension if not exists pgcrypto;\s*$/im,
  "",
);

const functionStart = sourceSql.indexOf(
  "create or replace function public.create_secure_booking",
);
const delimiter = "$secure_booking$";
const functionEnd = sourceSql.indexOf(delimiter + ";", functionStart);

assert.ok(functionStart >= 0, "create_secure_booking function is missing");
assert.ok(functionEnd > functionStart, "create_secure_booking closing delimiter is missing");

const functionSql = sourceSql.slice(
  functionStart,
  functionEnd + delimiter.length + 1,
);

function splitTopLevelSqlList(value) {
  const items = [];
  let current = "";
  let depth = 0;
  let inString = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const nextCharacter = value[index + 1];

    if (character === "'" && inString && nextCharacter === "'") {
      current += "''";
      index += 1;
      continue;
    }

    if (character === "'") {
      inString = !inString;
      current += character;
      continue;
    }

    if (!inString) {
      if (character === "(") depth += 1;
      if (character === ")") depth -= 1;
      if (character === "," && depth === 0) {
        items.push(current.trim());
        current = "";
        continue;
      }
    }

    current += character;
  }

  if (current.trim()) items.push(current.trim());
  return items;
}

const insertCount = (
  functionSql.match(/\binsert\s+into\s+public\.bookings\b/gi) ?? []
).length;
const valuesCount = (functionSql.match(/\bvalues\s*\(/gi) ?? []).length;

assert.equal(insertCount, 1, "create_secure_booking must contain one bookings INSERT");
assert.equal(valuesCount, 1, "create_secure_booking must contain one VALUES block");
assert.equal(
  (functionSql.match(/\$\$/g) ?? []).length,
  0,
  "create_secure_booking must use only its named dollar delimiter",
);

const insertShape = functionSql.match(
  /insert\s+into\s+public\.bookings\s*\(([\s\S]*?)\)\s*values\s*\(([\s\S]*?)\)\s*returning/i,
);
assert.ok(insertShape, "Could not parse the bookings INSERT and VALUES lists");

const insertColumns = splitTopLevelSqlList(insertShape[1]);
const insertValues = splitTopLevelSqlList(insertShape[2]);

assert.equal(insertColumns.length, 25, "Bookings INSERT must contain 25 columns");
assert.equal(insertValues.length, 25, "Bookings VALUES must contain 25 expressions");
assert.equal(
  insertColumns.length,
  insertValues.length,
  "Bookings INSERT columns and VALUES expression counts must match",
);

const db = new PGlite();

try {
  await db.exec(`
    create schema auth;
    create role anon nologin;
    create role authenticated nologin;

    create table auth.users (
      id uuid primary key,
      email text
    );

    create function auth.uid()
    returns uuid
    language sql
    stable
    as $auth_uid_stub$
      select null::uuid;
    $auth_uid_stub$;

    create function auth.jwt()
    returns jsonb
    language sql
    stable
    as $auth_jwt_stub$
      select '{}'::jsonb;
    $auth_jwt_stub$;
  `);

  await db.exec(executableSql);
  await db.exec(executableSql);

  const parsedOrderDefinition = await db.query(`
    select pg_get_functiondef(
      'public.create_secure_order(jsonb)'::regprocedure
    ) as definition;
  `);
  const parsedOrderSql = parsedOrderDefinition.rows[0]?.definition ?? "";
  assert.ok(
    parsedOrderSql.includes("CREATE OR REPLACE FUNCTION public.create_secure_order"),
    "create_secure_order was not parsed by PostgreSQL",
  );

  const parsedDefinition = await db.query(`
    select pg_get_functiondef(
      'public.create_secure_booking(jsonb)'::regprocedure
    ) as definition;
  `);
  const parsedSql = parsedDefinition.rows[0]?.definition ?? "";
  const parsedInsertCount = (
    parsedSql.match(/\binsert\s+into\s+public\.bookings\b/gi) ?? []
  ).length;
  const parsedValuesCount = (parsedSql.match(/\bvalues\s*\(/gi) ?? []).length;

  assert.equal(parsedInsertCount, 1, "Parsed function must contain one INSERT");
  assert.equal(parsedValuesCount, 1, "Parsed function must contain one VALUES block");

  console.log(`PostgreSQL migration validation passed twice: ${migrationPath}`);
  console.log("create_secure_order parsed successfully.");
  console.log("create_secure_booking parsed successfully.");
  console.log(`Parsed bookings INSERT count: ${parsedInsertCount}`);
  console.log(`Parsed VALUES block count: ${parsedValuesCount}`);
  console.log(`INSERT column count: ${insertColumns.length}`);
  console.log(`VALUES expression count: ${insertValues.length}`);
} finally {
  await db.close();
}
