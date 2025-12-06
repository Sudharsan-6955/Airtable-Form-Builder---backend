const axios = require('axios');
const AppError = require('./AppError');

const AIRTABLE_API_BASE = process.env.AIRTABLE_API_BASE_URL || 'https://api.airtable.com/v0';
const AIRTABLE_META_API = process.env.AIRTABLE_META_API_URL || 'https://api.airtable.com/v0/meta';

function createAirtableClient(accessToken) {
  return axios.create({
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
}

async function getBases(accessToken) {
  try {
    const client = createAirtableClient(accessToken);
    const response = await client.get(`${AIRTABLE_META_API}/bases`);
    
    return response.data.bases.map(base => ({
      id: base.id,
      name: base.name,
      permissionLevel: base.permissionLevel
    }));
  } catch (error) {
    console.error('Error fetching Airtable bases:', error.response?.data || error.message);
    throw new AppError(
      error.response?.data?.error?.message || 'Failed to fetch bases from Airtable',
      error.response?.status || 500
    );
  }
}

async function getBaseSchema(accessToken, baseId) {
  try {
    const client = createAirtableClient(accessToken);
    const response = await client.get(`${AIRTABLE_META_API}/bases/${baseId}/tables`);
    
    return response.data.tables.map(table => ({
      id: table.id,
      name: table.name,
      primaryFieldId: table.primaryFieldId,
      fields: table.fields.map(field => ({
        id: field.id,
        name: field.name,
        type: field.type,
        options: field.options || null
      }))
    }));
  } catch (error) {
    console.error('Error fetching base schema:', error.response?.data || error.message);
    throw new AppError(
      error.response?.data?.error?.message || 'Failed to fetch base schema from Airtable',
      error.response?.status || 500
    );
  }
}

async function getTableFields(accessToken, baseId, tableId) {
  try {
    const tables = await getBaseSchema(accessToken, baseId);
    const table = tables.find(t => t.id === tableId);
    
    if (!table) {
      throw new AppError('Table not found', 404);
    }
    
    return table.fields;
  } catch (error) {
    if (error instanceof AppError) throw error;
    
    console.error('Error fetching table fields:', error.message);
    throw new AppError('Failed to fetch table fields', 500);
  }
}

const SUPPORTED_FIELD_TYPES = {
  'singleLineText': 'singleLineText',
  'multilineText': 'multilineText',
  'singleSelect': 'singleSelect',
  'multipleSelects': 'multipleSelects',
  'multipleAttachments': 'multipleAttachments'
};

function isSupportedFieldType(airtableType) {
  return Object.keys(SUPPORTED_FIELD_TYPES).includes(airtableType);
}

function filterSupportedFields(fields) {
  return fields
    .filter(field => isSupportedFieldType(field.type))
    .map(field => ({
      ...field,
      isSupported: true
    }));
}

async function createRecord(accessToken, baseId, tableIdOrName, fields) {
  try {
    const client = createAirtableClient(accessToken);
    const url = `${AIRTABLE_API_BASE}/${baseId}/${encodeURIComponent(tableIdOrName)}`;
    
    const response = await client.post(url, {
      fields: fields,
      typecast: true // Auto-convert field types when possible
    });
    
    return {
      id: response.data.id,
      fields: response.data.fields,
      createdTime: response.data.createdTime
    };
  } catch (error) {
    console.error('Error creating Airtable record:', error.response?.data || error.message);
    throw new AppError(
      error.response?.data?.error?.message || 'Failed to create record in Airtable',
      error.response?.status || 500,
      error.response?.data?.error
    );
  }
}

async function updateRecord(accessToken, baseId, tableIdOrName, recordId, fields) {
  try {
    const client = createAirtableClient(accessToken);
    const url = `${AIRTABLE_API_BASE}/${baseId}/${encodeURIComponent(tableIdOrName)}/${recordId}`;
    
    const response = await client.patch(url, {
      fields: fields,
      typecast: true
    });
    
    return {
      id: response.data.id,
      fields: response.data.fields
    };
  } catch (error) {
    console.error('Error updating Airtable record:', error.response?.data || error.message);
    throw new AppError(
      error.response?.data?.error?.message || 'Failed to update record in Airtable',
      error.response?.status || 500
    );
  }
}

async function getRecord(accessToken, baseId, tableIdOrName, recordId) {
  try {
    const client = createAirtableClient(accessToken);
    const url = `${AIRTABLE_API_BASE}/${baseId}/${encodeURIComponent(tableIdOrName)}/${recordId}`;
    
    const response = await client.get(url);
    
    return {
      id: response.data.id,
      fields: response.data.fields,
      createdTime: response.data.createdTime
    };
  } catch (error) {
    if (error.response?.status === 404) {
      return null; // Record doesn't exist
    }
    
    console.error('Error fetching Airtable record:', error.response?.data || error.message);
    throw new AppError(
      error.response?.data?.error?.message || 'Failed to fetch record from Airtable',
      error.response?.status || 500
    );
  }
}

async function createWebhook(accessToken, baseId, notificationUrl, specification) {
  try {
    const client = createAirtableClient(accessToken);
    const url = `${AIRTABLE_API_BASE}/${baseId}/webhooks`;
    
    const response = await client.post(url, {
      notificationUrl,
      specification
    });
    
    return {
      id: response.data.id,
      macSecretBase64: response.data.macSecretBase64,
      expirationTime: response.data.expirationTime
    };
  } catch (error) {
    console.error('Error creating webhook:', error.response?.data || error.message);
    throw new AppError(
      error.response?.data?.error?.message || 'Failed to create webhook',
      error.response?.status || 500
    );
  }
}

async function refreshWebhook(accessToken, baseId, webhookId) {
  try {
    const client = createAirtableClient(accessToken);
    const url = `${AIRTABLE_API_BASE}/${baseId}/webhooks/${webhookId}/refresh`;
    
    const response = await client.post(url);
    
    return {
      expirationTime: response.data.expirationTime
    };
  } catch (error) {
    console.error('Error refreshing webhook:', error.response?.data || error.message);
    throw new AppError(
      error.response?.data?.error?.message || 'Failed to refresh webhook',
      error.response?.status || 500
    );
  }
}

async function deleteWebhook(accessToken, baseId, webhookId) {
  try {
    const client = createAirtableClient(accessToken);
    const url = `${AIRTABLE_API_BASE}/${baseId}/webhooks/${webhookId}`;
    
    await client.delete(url);
    
    return { success: true };
  } catch (error) {
    console.error('Error deleting webhook:', error.response?.data || error.message);
    throw new AppError(
      error.response?.data?.error?.message || 'Failed to delete webhook',
      error.response?.status || 500
    );
  }
}

module.exports = {
  getBases,
  getBaseSchema,
  getTableFields,
  filterSupportedFields,
  isSupportedFieldType,
  createRecord,
  updateRecord,
  getRecord,
  createWebhook,
  refreshWebhook,
  deleteWebhook,
  SUPPORTED_FIELD_TYPES
};
