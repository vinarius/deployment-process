import { DynamoItem, partitionKey, sortKey, trimIndexedAttributes } from '@internal-tech-solutions/sig-dynamo-factory';
import { ApiResponse } from '@opensearch-project/opensearch/.';

import { LoggerFactory } from './loggerFactory';
import { toKebab } from './rename';
import { throwForbiddenError, throwNotFoundError, throwResourceExistsError, throwUnknownError } from './errors';
import { getOpenSearchClient } from './sdk';
import { validateEnvVars } from './validateEnvVars';

export type OpenSearchResponseBody = {
  _index: string;
  _id: string;
  _version: number;
  result: string;
  _shards: {
    total: number;
    successful: number;
    failed: number;
  };
  _seq_no: number;
  _primary_term: number;
  status?: number;
};

export enum OpenSearchAction {
  INDEX = 'index',
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
}

export type OpenSearchBulkResponseBody = {
  took: number;
  errors: boolean;
  items: {
    [action in OpenSearchAction]: OpenSearchResponseBody;
  }[];
};

export type BulkActionDocumentsInput = {
  indexName: string;
  action: OpenSearchAction;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  document: Record<string, any>;
}[];

export type DeleteIndexResponseBody = {
  acknowledged: boolean;
};

const { stage = '' } = process.env;
const logger = LoggerFactory.getLogger();
const openSearchClient = getOpenSearchClient();

export type CreateIndexResponseBody = {
  acknowledged: boolean;
  shards_acknowledged: boolean;
  index: string;
};

export async function createIndex(indexName: string) {
  validateEnvVars(['stage']);

  if (stage === 'prod' || stage === 'qa') throwForbiddenError('Cannot create index in prod or qa');

  const createIndexInput = {
    index: toKebab(indexName),
  };

  logger.debug('createIndexInput:', createIndexInput);

  const output = await openSearchClient.indices.create(createIndexInput).catch(err => {
    const errorBody = err?.meta?.body ?? {};

    const { error, status } = errorBody;

    if (status === 400) throwResourceExistsError(error);

    throwUnknownError(err);
  });

  const { body } = output as ApiResponse<CreateIndexResponseBody>;

  return body as CreateIndexResponseBody;
}

export async function deleteIndex(indexName: string) {
  validateEnvVars(['stage']);

  if (stage === 'prod' || stage === 'qa') throwForbiddenError('Cannot delete index in prod or qa');

  const deleteIndexInput = {
    index: toKebab(indexName),
  };

  logger.debug('deleteIndexInput:', deleteIndexInput);

  const output = await openSearchClient.indices.delete(deleteIndexInput).catch(err => {
    const errorBody = err?.meta?.body ?? {};

    const { error, status } = errorBody;

    if (status === 404) throwNotFoundError(error);

    throwUnknownError(err);
  });

  const { body } = output as ApiResponse<DeleteIndexResponseBody>;

  return body as DeleteIndexResponseBody;
}

export function buildDocumentId(partitionKey: string, sortKey: string): string {
  return `${partitionKey}||${sortKey}`;
}

/**
 * Functions similar to a PUT in DynamoDB. It will insert the
 * document if it does not exist and replace the document if it does exist.
 */
export async function indexDocument(indexName: string, item: DynamoItem) {
  const { body: openSearchResponse } = await openSearchClient.index({
    index: indexName,
    id: buildDocumentId(item[partitionKey], item[sortKey]),
    body: trimIndexedAttributes(item),
  });

  return openSearchResponse as OpenSearchResponseBody;
}

export async function deleteDocument(indexName: string, documentId: string) {
  const output = await openSearchClient
    .delete({
      index: indexName,
      id: documentId,
    })
    .catch(err => {
      logger.info(err);

      const errorBody = err?.meta?.body ?? {};

      const { error, status } = errorBody;

      if (status === 404) throwNotFoundError(error);

      throwUnknownError(err);
    });

  const { body: openSearchResponse } = output as ApiResponse<Record<string, unknown>, unknown>;

  return openSearchResponse as OpenSearchResponseBody;
}

/**
 * This will only succeed if the document does not already exist.
 */
export async function createDocument(indexName: string, item: DynamoItem) {
  const output = await openSearchClient
    .create({
      index: indexName,
      id: buildDocumentId(item[partitionKey], item[sortKey]),
      body: trimIndexedAttributes(item),
    })
    .catch(err => {
      const errorBody = err?.meta?.body ?? {};

      const { error, status } = errorBody;

      if (status === 409) throwResourceExistsError(error);

      throwUnknownError(err);
    });

  const { body: openSearchResponse } = output as ApiResponse<Record<string, unknown>, unknown>;

  return openSearchResponse as OpenSearchResponseBody;
}

export async function updateDocument(indexName: string, item: DynamoItem) {
  const { body: openSearchResponse } = await openSearchClient.update({
    index: indexName,
    id: buildDocumentId(item[partitionKey], item[sortKey]),
    body: {
      doc: trimIndexedAttributes(item),
    },
  });

  return openSearchResponse as OpenSearchResponseBody;
}

export async function bulkActionDocuments(input: BulkActionDocumentsInput) {
  logger.debug('input:', JSON.stringify(input, null, 2));

  const body = input.flatMap(({ indexName, action, document }) => {
    const documentId = buildDocumentId(document[partitionKey], document[sortKey]);
    const trimmedDocument = trimIndexedAttributes(document);

    switch (action) {
      case OpenSearchAction.INDEX:
        return [
          {
            [OpenSearchAction.INDEX]: {
              _index: indexName,
              _id: documentId,
            },
          },
          trimmedDocument,
        ];
      case OpenSearchAction.DELETE:
        return [
          {
            [OpenSearchAction.DELETE]: {
              _index: indexName,
              _id: documentId,
            },
          },
        ];
      case OpenSearchAction.CREATE:
        return [
          {
            [OpenSearchAction.CREATE]: {
              _index: indexName,
              _id: documentId,
            },
          },
          trimmedDocument,
        ];
      case OpenSearchAction.UPDATE:
        return [
          {
            [OpenSearchAction.UPDATE]: {
              _index: indexName,
              _id: documentId,
            },
          },
          {
            doc: trimmedDocument,
          },
        ];
    }
  });

  const bulkInput = { body };

  logger.debug('bulkInput:', JSON.stringify(bulkInput, null, 2));

  const { body: openSearchResponse } = await openSearchClient.bulk(bulkInput);

  return openSearchResponse as OpenSearchBulkResponseBody;
}
