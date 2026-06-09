import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../supabase/migrations/20260606170000_private_data_security_hardening.sql",
  import.meta.url,
);
const migrationPath = fileURLToPath(migrationUrl);
const sourceSql = await readFile(migrationUrl, "utf8");

// PGlite is PostgreSQL compiled to WebAssembly. Its default distribution does
// not bundle pgcrypto, while Supabase does. gen_random_uuid() is available in
// modern PostgreSQL itself, so only the extension-install line is omitted from
// this local execution check.
const executableSql = sourceSql.replace(
  /^\s*create extension if not exists pgcrypto;\s*$/im,
  "",
);

const bookingFunctionStart = sourceSql.indexOf(
  "create or replace function public.create_secure_booking",
);
const bookingFunctionEnd = sourceSql.indexOf(
  "$booking_function$;",
  bookingFunctionStart,
);

assert.ok(bookingFunctionStart >= 0, "create_secure_booking function is missing");
assert.ok(bookingFunctionEnd > bookingFunctionStart, "create_secure_booking ending is missing");

const bookingFunctionSql = sourceSql.slice(
  bookingFunctionStart,
  bookingFunctionEnd + "$booking_function$;".length,
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

assert.equal(
  (bookingFunctionSql.match(/\binsert\s+into\s+public\.bookings\b/gi) ?? []).length,
  1,
  "create_secure_booking must contain exactly one bookings INSERT",
);
assert.equal(
  (bookingFunctionSql.match(/\bvalues\s*\(/gi) ?? []).length,
  1,
  "create_secure_booking must contain exactly one VALUES block",
);
assert.equal(
  (bookingFunctionSql.match(/\$\$/g) ?? []).length,
  0,
  "create_secure_booking must use only its named dollar delimiter",
);

const insertShape = bookingFunctionSql.match(
  /insert\s+into\s+public\.bookings\s*\(([\s\S]*?)\)\s*values\s*\(([\s\S]*?)\)\s*on\s+conflict/i,
);
assert.ok(insertShape, "Could not identify the bookings INSERT column/value lists");

const insertColumns = splitTopLevelSqlList(insertShape[1]);
const insertValues = splitTopLevelSqlList(insertShape[2]);

assert.equal(insertColumns.length, 25, "Bookings INSERT must contain 25 columns");
assert.equal(insertValues.length, 25, "Bookings VALUES must contain 25 values");
assert.equal(
  insertColumns.length,
  insertValues.length,
  "Bookings INSERT columns and VALUES must have equal counts",
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
    as $stub$
      select null::uuid;
    $stub$;

    create function auth.jwt()
    returns jsonb
    language sql
    stable
    as $stub$
      select '{}'::jsonb;
    $stub$;
  `);

  await db.exec(executableSql);
  await db.exec(executableSql);

  const functionDefinition = await db.query(`
    select pg_get_functiondef(
      'public.create_secure_booking(jsonb)'::regprocedure
    ) as definition;
  `);
  const parsedFunction = functionDefinition.rows[0]?.definition ?? "";
  const insertCount = (
    parsedFunction.match(/\binsert\s+into\s+public\.bookings\b/gi) ?? []
  ).length;
  const valuesCount = (parsedFunction.match(/\bvalues\s*\(/gi) ?? []).length;

  assert.equal(insertCount, 1, "Parsed function must contain exactly one INSERT");
  assert.equal(valuesCount, 1, "Parsed function must contain exactly one VALUES block");

  console.log(`PostgreSQL migration validation passed twice: ${migrationPath}`);
  console.log("create_secure_booking parsed successfully.");
  console.log(`Parsed bookings INSERT count: ${insertCount}`);
  console.log(`Parsed VALUES block count: ${valuesCount}`);
  console.log(`INSERT column count: ${insertColumns.length}`);
  console.log(`VALUES expression count: ${insertValues.length}`);
} finally {
  await db.close();
}
