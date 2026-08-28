#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/1e3c97d978f1a6705d7f2a5f3f078f1a290fc52db8af2ddfa78e2924511d1242/contract';
import endContract from '../../snapshots/1e3c97d978f1a6705d7f2a5f3f078f1a290fc52db8af2ddfa78e2924511d1242/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/ac36ed02b6e38fbb1a0566080ef4a0e8b738d2da652587be8afd923d923f3205/contract';
import startContract from '../../snapshots/ac36ed02b6e38fbb1a0566080ef4a0e8b738d2da652587be8afd923d923f3205/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'knowledge_chunk',
        columns: [
          col('chunkIndex', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('embedding', 'vector(768)', {
            notNull: true,
            codecRef: { codecId: 'pg/vector@1', typeParams: { length: 768 } },
          }),
          col('embeddingModel', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('endOffset', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('postId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('startOffset', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('text', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'knowledge_chunk',
        constraint: 'knowledge_chunk_postId_chunkIndex_key',
        columns: ['postId', 'chunkIndex'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'knowledge_chunk',
        index: 'knowledge_chunk_postId_idx_a7a72715',
        columns: ['postId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'knowledge_chunk',
        foreignKey: {
          name: 'knowledge_chunk_postId_fkey',
          columns: ['postId'],
          references: { schema: 'public', table: 'post', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
