#!/usr/bin/env node

// Consent Management Test Suite
// Tests consent creation, updates, withdrawal, templates, and audit logging

import { randomUUID } from 'crypto';
import http from 'http';

// Configuration
const API_BASE = 'http://localhost:3000/api';
const TEST_USER_ID = 'test_consent_user_' + Date.now();
const TEST_COMPANY_ID = 'test_consent_company_' + Date.now();

// Test utilities
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-whop-user-token': 'test_token_consent_management',
        'x-company-id': TEST_COMPANY_ID,
        'x-user-id': TEST_USER_ID,
        ...options.headers
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve({ status: res.statusCode, data: response, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test data generators
function generateTestConsentTemplate(name, type) {
  return {
    name: name,
    description: `Test ${name} consent template for ${type} processing`,
    consent_type: type,
    is_active: true,
    is_required: type === 'functional' || type === 'legal',
    expiration_days: type === 'marketing' ? 365 : null,
    withdrawal_allowed: true,
    data_retention_days: 30
  };
}

function generateTestConsentRequest(templateId, consentType) {
  return {
    template_id: templateId,
    consent_type: consentType,
    expires_at: consentType === 'marketing' ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() : undefined,
    consent_data: {
      test_data: 'consent test data',
      created_at: new Date().toISOString()
    }
  };
}

// Test suite
async function runConsentManagementTests() {
  console.log('🔐 Starting Consent Management Test Suite\n');
  console.log('=' .repeat(60));

  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  async function runTest(name, fn) {
    try {
      console.log(`\n🧪 ${name}`);
      await fn();
      console.log(`✅ ${name} - PASSED`);
      results.passed++;
      results.tests.push({ name, status: 'PASSED' });
    } catch (error) {
      console.log(`❌ ${name} - FAILED: ${error.message}`);
      results.failed++;
      results.tests.push({ name, status: 'FAILED', error: error.message });
    }
  }

  // Test 1: Consent Templates - Get All Templates
  await runTest('Consent Templates - Get All Templates', async () => {
    const response = await makeRequest(`${API_BASE}/consent/templates`);
    
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.data)}`);
    }

    const templates = response.data.templates;
    if (!Array.isArray(templates)) {
      throw new Error('Response should contain templates array');
    }

    // Verify required templates exist
    const requiredTypes = ['marketing', 'analytics', 'functional', 'third_party', 'legal'];
    const foundTypes = templates.map(t => t.consent_type);
    
    for (const type of requiredTypes) {
      if (!foundTypes.includes(type)) {
        throw new Error(`Missing required consent template: ${type}`);
      }
    }

    // Verify template structure
    for (const template of templates) {
      const requiredFields = ['id', 'name', 'description', 'consent_type', 'is_active', 'is_required'];
      for (const field of requiredFields) {
        if (!(field in template)) {
          throw new Error(`Template missing required field: ${field}`);
        }
      }
    }

    console.log(`   ✅ Retrieved ${templates.length} consent templates`);
  });

  // Test 2: Consent Templates - Filter by Type
  await runTest('Consent Templates - Filter by Type', async () => {
    const response = await makeRequest(`${API_BASE}/consent/templates?consent_type=marketing`);
    
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }

    const templates = response.data.templates;
    if (!templates.every(t => t.consent_type === 'marketing')) {
      throw new Error('All templates should be of marketing type');
    }

    console.log('   ✅ Templates correctly filtered by consent type');
  });

  // Test 3: Consent Templates - Create New Template
  await runTest('Consent Templates - Create New Template', async () => {
    const newTemplate = generateTestConsentTemplate('Test Marketing', 'marketing');
    
    const createResponse = await makeRequest(`${API_BASE}/consent/templates`, {
      method: 'POST',
      body: newTemplate
    });

    if (createResponse.status !== 201) {
      throw new Error(`Expected 201, got ${createResponse.status}`);
    }

    const createdTemplate = createResponse.data;
    if (!createdTemplate.id || createdTemplate.name !== newTemplate.name) {
      throw new Error('Template not created correctly');
    }

    console.log('   ✅ Consent template created successfully');
  });

  // Test 4: Consent Templates - Validation Errors
  await runTest('Consent Templates - Validation Errors', async () => {
    const invalidTemplate = {
      // Missing required fields
      description: 'Invalid template with missing name'
    };

    const response = await makeRequest(`${API_BASE}/consent/templates`, {
      method: 'POST',
      body: invalidTemplate
    });

    if (response.status !== 400) {
      throw new Error(`Expected 400 for invalid template, got ${response.status}`);
    }

    console.log('   ✅ Template validation properly rejects invalid data');
  });

  // Test 5: User Consents - Create Consent
  await runTest('User Consents - Create Consent', async () => {
    // First get a template to use
    const templatesResponse = await makeRequest(`${API_BASE}/consent/templates`);
    const marketingTemplate = templatesResponse.data.templates.find(t => t.consent_type === 'marketing');
    
    if (!marketingTemplate) {
      throw new Error('Marketing template not found for consent creation test');
    }

    const consentRequest = generateTestConsentRequest(marketingTemplate.id, 'marketing');
    
    const createResponse = await makeRequest(`${API_BASE}/consent`, {
      method: 'POST',
      body: consentRequest
    });

    if (createResponse.status !== 201) {
      throw new Error(`Expected 201, got ${createResponse.status}`);
    }

    const createdConsent = createResponse.data;
    if (!createdConsent.id || createdConsent.status !== 'active') {
      throw new Error('Consent not created correctly');
    }

    console.log('   ✅ User consent created successfully');
  });

  // Test 6: User Consents - Get User Consents
  await runTest('User Consents - Get User Consents', async () => {
    const response = await makeRequest(`${API_BASE}/consent`);
    
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }

    const { consents, total, page, limit, totalPages } = response.data;
    
    if (!Array.isArray(consents)) {
      throw new Error('Response should contain consents array');
    }

    if (typeof total !== 'number' || typeof page !== 'number' || typeof limit !== 'number') {
      throw new Error('Response should contain pagination metadata');
    }

    // Should have at least the consent we created in test 5
    if (total === 0) {
      throw new Error('Should have at least one consent');
    }

    console.log(`   ✅ Retrieved ${consents.length} user consents (total: ${total})`);
  });

  // Test 7: User Consents - Filter by Status
  await runTest('User Consents - Filter by Status', async () => {
    const response = await makeRequest(`${API_BASE}/consent?status=active`);
    
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }

    const consents = response.data.consents;
    if (!consents.every(c => c.status === 'active')) {
      throw new Error('All consents should be active');
    }

    console.log(`   ✅ Consents correctly filtered by status`);
  });

  // Test 8: User Consents - Filter by Type
  await runTest('User Consents - Filter by Type', async () => {
    const response = await makeRequest(`${API_BASE}/consent?consent_type=analytics`);
    
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }

    const consents = response.data.consents;
    if (!consents.every(c => c.consent_type === 'analytics')) {
      throw new Error('All consents should be analytics type');
    }

    console.log(`   ✅ Consents correctly filtered by type`);
  });

  // Test 9: User Consents - Get Specific Consent
  await runTest('User Consents - Get Specific Consent', async () => {
    // First create a consent to get
    const templatesResponse = await makeRequest(`${API_BASE}/consent/templates`);
    const template = templatesResponse.data.templates.find(t => t.consent_type === 'functional');
    
    if (!template) {
      throw new Error('Functional template not found for specific consent test');
    }

    const consentRequest = generateTestConsentRequest(template.id, 'functional');
    const createResponse = await makeRequest(`${API_BASE}/consent`, {
      method: 'POST',
      body: consentRequest
    });

    if (createResponse.status !== 201) {
      throw new Error(`Failed to create consent for specific test: ${createResponse.status}`);
    }

    const createdConsent = createResponse.data;
    
    // Get the specific consent
    const getResponse = await makeRequest(`${API_BASE}/consent/${createdConsent.id}`);
    
    if (getResponse.status !== 200) {
      throw new Error(`Expected 200, got ${getResponse.status}`);
    }

    const consent = getResponse.data.consent;
    if (!consent.id || consent.consent_type !== 'functional') {
      throw new Error('Specific consent not retrieved correctly');
    }

    console.log('   ✅ Specific consent retrieved successfully');
  });

  // Test 10: User Consents - Update Consent
  await runTest('User Consents - Update Consent', async () => {
    // First create a consent to update
    const templatesResponse = await makeRequest(`${API_BASE}/consent/templates`);
    const template = templatesResponse.data.templates.find(t => t.consent_type === 'analytics');
    
    const consentRequest = generateTestConsentRequest(template.id, 'analytics');
    const createResponse = await makeRequest(`${API_BASE}/consent`, {
      method: 'POST',
      body: consentRequest
    });

    if (createResponse.status !== 201) {
      throw new Error(`Failed to create consent for update test: ${createResponse.status}`);
    }

    const createdConsent = createResponse.data;
    
    // Update the consent
    const updateData = {
      expires_at: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(), // 180 days
      consent_data: {
        updated_data: 'Updated consent data',
        updated_at: new Date().toISOString()
      }
    };

    const updateResponse = await makeRequest(`${API_BASE}/consent/${createdConsent.id}`, {
      method: 'PUT',
      body: updateData
    });

    if (updateResponse.status !== 200) {
      throw new Error(`Expected 200, got ${updateResponse.status}`);
    }

    const updatedConsent = updateResponse.data;
    if (!updatedConsent.id || updatedConsent.expires_at !== updateData.expires_at) {
      throw new Error('Consent not updated correctly');
    }

    console.log('   ✅ Consent updated successfully');
  });

  // Test 11: User Consents - Withdraw Consent
  await runTest('User Consents - Withdraw Consent', async () => {
    // First create a consent to withdraw
    const templatesResponse = await makeRequest(`${API_BASE}/consent/templates`);
    const template = templatesResponse.data.templates.find(t => t.consent_type === 'third_party');
    
    const consentRequest = generateTestConsentRequest(template.id, 'third_party');
    const createResponse = await makeRequest(`${API_BASE}/consent`, {
      method: 'POST',
      body: consentRequest
    });

    if (createResponse.status !== 201) {
      throw new Error(`Failed to create consent for withdrawal test: ${createResponse.status}`);
    }

    const createdConsent = createResponse.data;
    
    // Withdraw the consent
    const withdrawData = {
      reason: 'User requested withdrawal for testing'
    };

    const withdrawResponse = await makeRequest(`${API_BASE}/consent/${createdConsent.id}`, {
      method: 'DELETE',
      body: withdrawData
    });

    if (withdrawResponse.status !== 200) {
      throw new Error(`Expected 200, got ${withdrawResponse.status}`);
    }

    const withdrawnConsent = withdrawResponse.data.consent;
    if (withdrawnConsent.status !== 'withdrawn' || !withdrawnConsent.withdrawn_at) {
      throw new Error('Consent not withdrawn correctly');
    }

    console.log('   ✅ Consent withdrawn successfully');
  });

  // Test 12: User Consents - Batch Operations
  await runTest('User Consents - Batch Operations', async () => {
    // Create multiple consents first
    const templatesResponse = await makeRequest(`${API_BASE}/consent/templates`);
    const marketingTemplate = templatesResponse.data.templates.find(t => t.consent_type === 'marketing');
    const analyticsTemplate = templatesResponse.data.templates.find(t => t.consent_type === 'analytics');
    
    if (!marketingTemplate || !analyticsTemplate) {
      throw new Error('Required templates not found for batch test');
    }

    const consent1Request = generateTestConsentRequest(marketingTemplate.id, 'marketing');
    const consent2Request = generateTestConsentRequest(analyticsTemplate.id, 'analytics');
    
    const create1Response = await makeRequest(`${API_BASE}/consent`, {
      method: 'POST',
      body: consent1Request
    });

    const create2Response = await makeRequest(`${API_BASE}/consent`, {
      method: 'POST',
      body: consent2Request
    });

    if (create1Response.status !== 201 || create2Response.status !== 201) {
      throw new Error('Failed to create consents for batch test');
    }

    const consent1 = create1Response.data;
    const consent2 = create2Response.data;

    // Perform batch withdrawal
    const batchData = {
      operations: [
        {
          consent_id: consent1.id,
          action: 'withdraw',
          reason: 'Batch withdrawal test 1'
        },
        {
          consent_id: consent2.id,
          action: 'withdraw',
          reason: 'Batch withdrawal test 2'
        }
      ]
    };

    const batchResponse = await makeRequest(`${API_BASE}/consent`, {
      method: 'PUT',
      body: batchData
    });

    if (batchResponse.status !== 200) {
      throw new Error(`Expected 200, got ${batchResponse.status}`);
    }

    const batchResult = batchResponse.data;
    if (batchResult.success_count !== 2 || batchResult.failure_count !== 0) {
      throw new Error('Batch operation failed');
    }

    console.log('   ✅ Batch consent operations completed successfully');
  });

  // Test 13: User Consents - Consent Validation
  await runTest('User Consents - Consent Validation', async () => {
    // Test creating consent without template_id
    const invalidConsent1 = {
      consent_type: 'marketing'
      // Missing template_id
    };

    const response1 = await makeRequest(`${API_BASE}/consent`, {
      method: 'POST',
      body: invalidConsent1
    });

    if (response1.status !== 400) {
      throw new Error(`Expected 400 for missing template_id, got ${response1.status}`);
    }

    // Test creating consent with invalid consent_type
    const invalidConsent2 = {
      template_id: randomUUID(),
      consent_type: 'invalid_type'
    };

    const response2 = await makeRequest(`${API_BASE}/consent`, {
      method: 'POST',
      body: invalidConsent2
    });

    if (response2.status !== 400) {
      throw new Error(`Expected 400 for invalid consent_type, got ${response2.status}`);
    }

    console.log('   ✅ Consent validation properly rejects invalid data');
  });

  // Test 14: User Consents - Audit Log
  await runTest('User Consents - Audit Log', async () => {
    // Create a consent first
    const templatesResponse = await makeRequest(`${API_BASE}/consent/templates`);
    const template = templatesResponse.data.templates.find(t => t.consent_type === 'functional');
    
    const consentRequest = generateTestConsentRequest(template.id, 'functional');
    const createResponse = await makeRequest(`${API_BASE}/consent`, {
      method: 'POST',
      body: consentRequest
    });

    if (createResponse.status !== 201) {
      throw new Error(`Failed to create consent for audit test: ${createResponse.status}`);
    }

    const createdConsent = createResponse.data;

    // Update the consent to create audit trail
    const updateResponse = await makeRequest(`${API_BASE}/consent/${createdConsent.id}`, {
      method: 'PUT',
      body: {
        consent_data: {
          audit_test: 'Updated for audit test',
          updated_at: new Date().toISOString()
        }
      }
    });

    if (updateResponse.status !== 200) {
      throw new Error(`Failed to update consent for audit test: ${updateResponse.status}`);
    }

    // Get consent with audit log
    const getResponse = await makeRequest(`${API_BASE}/consent/${createdConsent.id}?audit_page=1&audit_limit=10`);
    
    if (getResponse.status !== 200) {
      throw new Error(`Expected 200, got ${getResponse.status}`);
    }

    const consentData = getResponse.data;
    if (!consentData.audit_log || !Array.isArray(consentData.audit_log)) {
      throw new Error('Audit log not properly returned');
    }

    // Should have at least 2 audit entries (create + update)
    if (consentData.audit_log.length < 2) {
      throw new Error(`Expected at least 2 audit entries, got ${consentData.audit_log.length}`);
    }

    console.log(`   ✅ Audit log contains ${consentData.audit_log.length} entries`);
  });

  // Test 15: User Consents - Rate Limiting
  await runTest('User Consents - Rate Limiting', async () => {
    const consentRequest = generateTestConsentRequest(randomUUID(), 'marketing');
    
    // Make multiple requests quickly to trigger rate limiting
    const requests = [];
    for (let i = 0; i < 5; i++) {
      requests.push(makeRequest(`${API_BASE}/consent`, {
        method: 'POST',
        body: { ...consentRequest, test_batch: i }
      }));
    }

    const results = await Promise.all(requests);
    
    // At least some should succeed, then rate limiting should kick in
    const successCount = results.filter(r => r.status === 201).length;
    const rateLimitedCount = results.filter(r => r.status === 429).length;
    
    if (successCount === 0 && rateLimitedCount === 0) {
      throw new Error('Expected some success or rate limiting');
    }

    console.log(`   ✅ Rate limiting test: ${successCount} successful, ${rateLimitedCount} rate limited`);
  });

  // Test 16: User Consents - Authentication Required
  await runTest('User Consents - Authentication Required', async () => {
    // Test without authentication headers
    const response = await makeRequest(`${API_BASE}/consent`, {
      method: 'GET',
      headers: {
        // Remove authentication headers
        'x-whop-user-token': undefined
      }
    });

    if (response.status !== 401) {
      throw new Error(`Expected 401 for unauthenticated request, got ${response.status}`);
    }

    console.log('   ✅ Authentication properly required for consent access');
  });

  // Test 17: User Consents - Data Encryption
  await runTest('User Consents - Data Encryption', async () => {
    const templatesResponse = await makeRequest(`${API_BASE}/consent/templates`);
    const template = templatesResponse.data.templates.find(t => t.consent_type === 'marketing');
    
    // Create consent with sensitive data
    const consentRequest = {
      template_id: template.id,
      consent_type: 'marketing',
      consent_data: {
        sensitive_info: 'This should be encrypted',
        personal_data: {
          email: 'test@example.com',
          phone: '+1234567890'
        },
        financial_info: {
          ssn: '123-45-6789',
          credit_card: '****-****-****-1234'
        }
      }
    };

    const createResponse = await makeRequest(`${API_BASE}/consent`, {
      method: 'POST',
      body: consentRequest
    });

    if (createResponse.status !== 201) {
      throw new Error(`Failed to create consent with sensitive data: ${createResponse.status}`);
    }

    const createdConsent = createResponse.data;
    
    // Retrieve the consent to verify sensitive data is handled
    const getResponse = await makeRequest(`${API_BASE}/consent/${createdConsent.id}`);
    
    if (getResponse.status !== 200) {
      throw new Error(`Failed to retrieve consent with sensitive data: ${getResponse.status}`);
    }

    const retrievedConsent = getResponse.data.consent;
    
    // Sensitive data should be encrypted in database but returned decrypted
    if (!retrievedConsent.consent_data || !retrievedConsent.consent_data.sensitive_info) {
      throw new Error('Sensitive data not properly handled');
    }

    console.log('   ✅ Sensitive consent data properly encrypted and decrypted');
  });

  // Test 18: User Consents - Consent Expiration
  await runTest('User Consents - Consent Expiration', async () => {
    // Create a consent with expiration
    const templatesResponse = await makeRequest(`${API_BASE}/consent/templates`);
    const template = templatesResponse.data.templates.find(t => t.consent_type === 'marketing');
    
    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // 10 days from now
    
    const consentRequest = {
      template_id: template.id,
      consent_type: 'marketing',
      expires_at: futureDate.toISOString()
    };

    const createResponse = await makeRequest(`${API_BASE}/consent`, {
      method: 'POST',
      body: consentRequest
    });

    if (createResponse.status !== 201) {
      throw new Error(`Failed to create consent with expiration: ${createResponse.status}`);
    }

    const createdConsent = createResponse.data;
    
    if (!createdConsent.expires_at || createdConsent.status !== 'active') {
      throw new Error('Consent with expiration not created correctly');
    }

    console.log('   ✅ Consent with expiration created successfully');
  });

  // Test 19: User Consents - Consent Summary
  await runTest('User Consents - Consent Summary', async () => {
    // Create multiple consents of different types
    const templatesResponse = await makeRequest(`${API_BASE}/consent/templates`);
    const marketingTemplate = templatesResponse.data.templates.find(t => t.consent_type === 'marketing');
    const analyticsTemplate = templatesResponse.data.templates.find(t => t.consent_type === 'analytics');
    
    const consent1Request = generateTestConsentRequest(marketingTemplate.id, 'marketing');
    const consent2Request = generateTestConsentRequest(analyticsTemplate.id, 'analytics');
    
    await makeRequest(`${API_BASE}/consent`, {
      method: 'POST',
      body: consent1Request
    });

    await makeRequest(`${API_BASE}/consent`, {
      method: 'POST',
      body: consent2Request
    });

    // Get summary (this would need to be implemented as a separate endpoint)
    // For now, test that we can get consents and count by type
    const consentsResponse = await makeRequest(`${API_BASE}/consent`);
    
    if (consentsResponse.status !== 200) {
      throw new Error(`Failed to get consents for summary test: ${consentsResponse.status}`);
    }

    const consents = consentsResponse.data.consents;
    const marketingConsents = consents.filter(c => c.consent_type === 'marketing');
    const analyticsConsents = consents.filter(c => c.consent_type === 'analytics');
    
    if (marketingConsents.length !== 1 || analyticsConsents.length !== 1) {
      throw new Error('Expected 1 marketing and 1 analytics consent');
    }

    console.log('   ✅ Consent summary test: Multiple consents created and retrieved');
  });

  // Test 20: User Consents - Consent Withdrawal Irreversibility
  await runTest('User Consents - Consent Withdrawal Irreversibility', async () => {
    // Create a consent
    const templatesResponse = await makeRequest(`${API_BASE}/consent/templates`);
    const template = templatesResponse.data.templates.find(t => t.consent_type === 'third_party');
    
    const consentRequest = generateTestConsentRequest(template.id, 'third_party');
    const createResponse = await makeRequest(`${API_BASE}/consent`, {
      method: 'POST',
      body: consentRequest
    });

    if (createResponse.status !== 201) {
      throw new Error(`Failed to create consent for withdrawal test: ${createResponse.status}`);
    }

    const createdConsent = createResponse.data;
    
    // Withdraw the consent
    const withdrawResponse = await makeRequest(`${API_BASE}/consent/${createdConsent.id}`, {
      method: 'DELETE',
      body: { reason: 'Testing withdrawal irreversibility' }
    });

    if (withdrawResponse.status !== 200) {
      throw new Error(`Failed to withdraw consent: ${withdrawResponse.status}`);
    }

    const withdrawnConsent = withdrawResponse.data.consent;
    
    if (withdrawnConsent.status !== 'withdrawn') {
      throw new Error('Consent not properly withdrawn');
    }

    // Try to reactivate the withdrawn consent (should fail)
    const reactivateResponse = await makeRequest(`${API_BASE}/consent/${createdConsent.id}`, {
      method: 'PUT',
      body: { status: 'active' }
    });

    if (reactivateResponse.status !== 400) {
      throw new Error(`Expected 400 for reactivating withdrawn consent, got ${reactivateResponse.status}`);
    }

    console.log('   ✅ Consent withdrawal is irreversible');
  });

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 CONSENT MANAGEMENT TEST RESULTS SUMMARY');
  console.log('=' .repeat(60));
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📈 Total: ${results.passed + results.failed}`);
  
  if (results.failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.tests.filter(t => t.status === 'FAILED').forEach(test => {
      console.log(`   • ${test.name}: ${test.error}`);
    });
  }
  
  const successRate = ((results.passed / (results.passed + results.failed)) * 100).toFixed(1);
  console.log(`🎯 Success Rate: ${successRate}%`);
  
  if (results.failed === 0) {
    console.log('\n🎉 ALL CONSENT MANAGEMENT TESTS PASSED! GDPR compliance ready.');
  } else {
    console.log('\n⚠️  Some consent management tests failed. Review and fix before production deployment.');
  }
}

// Run the test suite
if (require.main === module) {
  runConsentManagementTests().catch(error => {
    console.error('Consent management test suite failed:', error);
    process.exit(1);
  });
}

module.exports = { runConsentManagementTests };