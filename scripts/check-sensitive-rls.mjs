// 실제 DB의 민감 테이블 정책 점검 (읽기 전용 트랜잭션). 위반이 있으면 종료 코드 1.
//   npm run db:rls-check                         → .env.local의 운영 DB (서울 pooler)
//   HRM_DB_URL=postgres://... npm run db:rls-check → 지정한 DB (로컬 검증 DB 등)
//   ... -- --write supabase/snapshots/x.json      → 현재 정책을 파일로 저장(되돌리기 기준·비교용)
// 접속 정보는 출력하지 않는다.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { findViolations, SENSITIVE_TABLES } from '../src/lib/sensitiveRls.ts'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

function connection() {
  if (process.env.HRM_DB_URL) return { connectionString: process.env.HRM_DB_URL }
  const env = {}
  for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]
  return {
    host: 'aws-0-ap-northeast-2.pooler.supabase.com', port: 5432, database: 'postgres',
    user: `postgres.${ref}`, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false },
  }
}

const c = new pg.Client(connection())
await c.connect()
await c.query('BEGIN READ ONLY')
const { rows } = await c.query(
  `SELECT tablename, policyname, roles::text AS roles, cmd, qual, with_check
     FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname`)
const missing = (await c.query(
  `SELECT t FROM unnest($1::text[]) t WHERE NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = t AND c.relrowsecurity)`, [SENSITIVE_TABLES])).rows.map(r => r.t)
await c.query('ROLLBACK')
await c.end()

const writeAt = process.argv.indexOf('--write')
if (writeAt > 0) {
  const out = path.resolve(root, process.argv[writeAt + 1])
  fs.writeFileSync(out, JSON.stringify(rows.filter(r => SENSITIVE_TABLES.includes(r.tablename)), null, 2) + '\n')
  console.log('saved', path.relative(root, out))
}

const violations = findViolations(rows)
for (const v of violations) console.log(`위반  ${v.table}.${v.policy}  ${v.reason}`)
for (const t of missing) console.log(`위반  ${t}: RLS가 꺼져 있거나 테이블이 없음`)
const bad = violations.length + missing.length
console.log(bad === 0 ? `OK  민감 테이블 ${SENSITIVE_TABLES.length}개에 전체 허용 정책 없음` : `실패  위반 ${bad}건`)
process.exitCode = bad ? 1 : 0
