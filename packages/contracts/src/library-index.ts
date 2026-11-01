import { z } from 'zod'
import { Id, Version, Instant, ErrorResponse, errorStatus, data } from './models.js'

/**
 * A library index entry points at a file that stays on the lab's own disks.
 * Only the pointer, its purpose and who maintains it are stored here.
 */
export const LibraryIndexPurpose = z.enum(['master', 'reference', 'evidence', 'figure', 'other'])
export const LibraryIndexPath = z
  .string()
  .trim()
  .min(1)
  .max(600)
  .refine(
    (value) =>
      !value.startsWith('/') &&
      !value.startsWith('\\') &&
      !/^[A-Za-z]:/.test(value) &&
      !value.split(/[\\/]/).includes('..'),
    '路径必须是登记文件夹内的相对路径',
  )
export const LibraryIndexInput = z.strictObject({
  project: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(200),
  relPath: LibraryIndexPath,
  purpose: LibraryIndexPurpose,
  summary: z.string().trim().max(300).default(''),
  /** Optional: lets a client tell "same file" from "same name". */
  sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable().default(null),
  recommended: z.boolean().default(false),
})
export const LibraryIndexEntry = LibraryIndexInput.extend({
  id: Id,
  labId: Id,
  maintainerId: Id,
  maintainerName: z.string(),
  status: z.enum(['active', 'revoked']),
  version: Version,
  createdAt: Instant,
  updatedAt: Instant,
  allowedActions: z.array(z.enum(['revise', 'revoke'])),
})
export const LibraryIndex = z.strictObject({
  entries: z.array(LibraryIndexEntry).max(500),
})
export type LibraryIndexEntry = z.infer<typeof LibraryIndexEntry>

const empty = z.strictObject({}),
  headers = z.strictObject({ 'Idempotency-Key': z.string().regex(/^[A-Za-z0-9_-]{16,128}$/) })
function route<P extends z.ZodType, B extends z.ZodType, R extends z.ZodType>(
  method: 'GET' | 'POST',
  path: string,
  params: P,
  body: B,
  response: R,
) {
  return {
    method,
    path: '/api/v1' + path,
    stage: 'INDEX1' as const,
    implemented: true,
    access: 'session',
    status: 200,
    rule:
      'Lab-scoped pointers only: no file bytes, no extracted text. Live lab membership first; maintainer or lab manager may revise; versioned, idempotent, revocable.',
    idempotent: method !== 'GET',
    request: z.strictObject({
      params,
      query: empty,
      headers: method === 'GET' ? empty : headers,
      body,
    }),
    response,
    errors: ErrorResponse,
    errorStatuses: errorStatus,
  }
}
export const libraryIndexRoutes = {
  libraryIndex: route('GET', '/library/index', empty, z.null(), data(LibraryIndex)),
  saveLibraryIndexEntry: route(
    'POST',
    '/library/index',
    empty,
    LibraryIndexInput.extend({
      recordId: Id.nullable(),
      expectedVersion: z.number().int().nonnegative(),
      action: z.enum(['save', 'revoke']),
    }),
    data(LibraryIndexEntry),
  ),
} as const
