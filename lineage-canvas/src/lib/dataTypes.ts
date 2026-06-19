/**
 * Cross-system data-type equivalence.
 *
 * The migration work spans Snowflake, SAS, and Python (PySpark `DataType`s and
 * Pandas dtypes). The *spelling* of an otherwise-identical type differs wildly
 * across these systems — e.g. a 64-bit integer is `BIGINT` in Snowflake,
 * `LongType` / `long` in PySpark, and `int64` / `Int64` in Pandas. When two
 * columns carry the same underlying type we don't want the comparison view to
 * flag the data type as "changed" just because the label is written differently.
 *
 * Each known spelling is mapped to a single `CanonicalType`. Two data types are
 * considered equivalent when they resolve to the same canonical type. Unknown
 * spellings fall back to a normalised string comparison, so anything not in the
 * table still behaves exactly as before.
 *
 * SAS note: SAS only has two storage types — NUMERIC (always an 8-byte float)
 * and CHARACTER. We therefore map SAS numeric spellings (`num`, `numeric`) to
 * DOUBLE and SAS character spellings (`char`, `$`) to STRING. Dates/times in
 * SAS are numerics distinguished only by a format, which lives in the separate
 * "Format" field, so they are not special-cased here.
 */

export type CanonicalType =
  | 'TINYINT'   // 8-bit integer
  | 'SMALLINT'  // 16-bit integer
  | 'INT'       // 32-bit integer
  | 'BIGINT'    // 64-bit integer
  | 'FLOAT'     // 32-bit floating point
  | 'DOUBLE'    // 64-bit floating point
  | 'DECIMAL'   // fixed-point / arbitrary precision
  | 'STRING'
  | 'BOOLEAN'
  | 'DATE'
  | 'TIME'
  | 'TIMESTAMP'
  | 'BINARY'
  | 'ARRAY'
  | 'STRUCT'
  | 'MAP'
  | 'VARIANT'   // semi-structured / JSON-like
  | 'UNKNOWN';

// Map of normalised type spelling -> canonical type, grouped by canonical type.
// Spellings are matched after `normalizeToken` (lowercased, parameters such as
// `(255)` or `[ns]` stripped). Where systems disagree on width for a bare name
// (e.g. Snowflake `FLOAT` is 64-bit while PySpark `FloatType` is 32-bit) the
// explicit, system-specific spelling wins and the bare name takes the more
// common meaning.
const ALIASES: Record<Exclude<CanonicalType, 'UNKNOWN'>, string[]> = {
  TINYINT: [
    'tinyint', 'byteint',          // Snowflake
    'bytetype', 'byte',            // PySpark
    'int8', 'uint8',               // Pandas
  ],
  SMALLINT: [
    'smallint',                    // Snowflake
    'shorttype', 'short',          // PySpark
    'int16', 'uint16',             // Pandas
  ],
  INT: [
    'int', 'integer',              // Snowflake / PySpark simpleString
    'integertype',                 // PySpark
    'int32', 'uint32',             // Pandas
  ],
  BIGINT: [
    'bigint',                      // Snowflake
    'longtype', 'long',            // PySpark
    'int64', 'uint64',             // Pandas (Int64 lowercases to int64)
  ],
  FLOAT: [
    'float4', 'float32',           // Snowflake alias / Pandas
    'floattype',                   // PySpark (32-bit)
  ],
  DOUBLE: [
    'float', 'float8', 'double', 'double precision', 'real', // Snowflake (FLOAT/REAL are 64-bit)
    'doubletype',                  // PySpark
    'float64',                     // Pandas (Float64 lowercases to float64)
    'num',                         // SAS numeric (8-byte float)
  ],
  DECIMAL: [
    'number', 'decimal', 'numeric', 'dec', // Snowflake / SAS
    'decimaltype',                 // PySpark
  ],
  STRING: [
    'varchar', 'char', 'character', 'string', 'text',
    'nvarchar', 'nvarchar2', 'nchar', 'char varying', 'character varying', // Snowflake
    'stringtype', 'varchartype', 'chartype',                               // PySpark
    'object', 'str', 'category',   // Pandas
    '$',                           // SAS character
  ],
  BOOLEAN: [
    'boolean', 'bool',             // Snowflake / Pandas
    'booleantype',                 // PySpark
  ],
  DATE: [
    'date',                        // Snowflake
    'datetype',                    // PySpark
  ],
  TIME: [
    'time',                        // Snowflake
  ],
  TIMESTAMP: [
    'timestamp', 'datetime', 'timestamp_ltz', 'timestamp_ntz', 'timestamp_tz', // Snowflake
    'timestamptype', 'timestampntztype',                                        // PySpark
    'datetime64', 'datetime64[ns]',                                             // Pandas
  ],
  BINARY: [
    'binary', 'varbinary',         // Snowflake
    'binarytype', 'bytes',         // PySpark / Pandas
  ],
  ARRAY: [
    'array', 'arraytype',          // Snowflake / PySpark
  ],
  STRUCT: [
    'struct', 'structtype', 'row', // PySpark
  ],
  MAP: [
    'map', 'maptype',              // PySpark
  ],
  VARIANT: [
    'variant',                     // Snowflake semi-structured (OBJECT resolves to STRING — see build order)
  ],
};

// Build a flat lookup. Earlier groups win on collision, so the order of
// `ALIASES` keys matters: STRING claims `object` (Pandas) before STRUCT/VARIANT.
const LOOKUP: Record<string, CanonicalType> = (() => {
  const m: Record<string, CanonicalType> = {};
  for (const [canonical, spellings] of Object.entries(ALIASES) as [Exclude<CanonicalType, 'UNKNOWN'>, string[]][]) {
    for (const s of spellings) {
      if (!(s in m)) m[s] = canonical;
    }
  }
  return m;
})();

/**
 * Lowercase, trim, and strip type parameters so that `VARCHAR(255)`,
 * `NUMBER(38,0)`, and `datetime64[ns]` collapse to their base spelling.
 * (Length / precision / scale are compared as separate fields elsewhere.)
 */
export function normalizeToken(raw?: string | null): string {
  if (raw == null) return '';
  let s = String(raw).trim().toLowerCase();
  // Drop anything from the first parameter delimiter onward, but keep the
  // `[ns]` variants of datetime64 recognisable via their explicit alias above.
  const paren = s.indexOf('(');
  if (paren !== -1) s = s.slice(0, paren).trim();
  return s.replace(/\s+/g, ' ');
}

/** Resolve a raw data-type string to its canonical type, or UNKNOWN. */
export function canonicalType(raw?: string | null): CanonicalType {
  const token = normalizeToken(raw);
  if (!token) return 'UNKNOWN';
  return LOOKUP[token] ?? LOOKUP[token.replace(/\[.*\]$/, '')] ?? 'UNKNOWN';
}

/**
 * Two data types are equivalent when they resolve to the same canonical type.
 * Unknown spellings fall back to a normalised string comparison so anything not
 * in the table is treated as different only when the strings actually differ.
 */
export function dataTypesEquivalent(a?: string | null, b?: string | null): boolean {
  const ca = canonicalType(a);
  const cb = canonicalType(b);
  if (ca === 'UNKNOWN' || cb === 'UNKNOWN') {
    return normalizeToken(a) === normalizeToken(b);
  }
  return ca === cb;
}
