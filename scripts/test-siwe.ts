#!/usr/bin/env bun
/**
 * Test SIWE authentication flow with PocketBase
 * 
 * Usage: bun run scripts/test-siwe.ts [base_url]
 */

import { privateKeyToAccount } from 'viem/accounts'

const BASE_URL = process.argv[2] || 'http://127.0.0.1:8091'

// Test private key (DO NOT USE IN PRODUCTION)
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const account = privateKeyToAccount(TEST_PRIVATE_KEY)

console.log('=== SIWE Authentication Test ===')
console.log(`Base URL: ${BASE_URL}`)
console.log(`Test wallet: ${account.address}`)
console.log('')

async function testSIWE() {
  // Step 1: Request nonce
  console.log('1. Requesting nonce...')
  const nonceRes = await fetch(`${BASE_URL}/api/auth/siwe/nonce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: account.address })
  })
  
  if (!nonceRes.ok) {
    console.error('Failed to get nonce:', await nonceRes.text())
    process.exit(1)
  }
  
  const nonceData = await nonceRes.json() as { success: boolean; message: string; nonce: string }
  console.log(`   Nonce: ${nonceData.nonce}`)
  console.log(`   Message to sign:`)
  console.log(`   ${nonceData.message.replace(/\n/g, '\n   ')}`)
  console.log('')
  
  // Step 2: Sign message
  console.log('2. Signing message with wallet...')
  const signature = await account.signMessage({ message: nonceData.message })
  console.log(`   Signature: ${signature.slice(0, 20)}...${signature.slice(-10)}`)
  console.log('')
  
  // Step 3: Verify signature
  console.log('3. Verifying signature...')
  const verifyRes = await fetch(`${BASE_URL}/api/auth/siwe/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: account.address,
      signature,
      name: 'TestOracle'
    })
  })
  
  const verifyData = await verifyRes.json() as any
  
  if (!verifyRes.ok) {
    console.error('   FAILED:', verifyData.message)
    process.exit(1)
  }
  
  console.log('   SUCCESS!')
  console.log(`   Created: ${verifyData.created}`)
  console.log(`   Oracle ID: ${verifyData.oracle.id}`)
  console.log(`   Oracle Name: ${verifyData.oracle.name}`)
  console.log(`   Wallet: ${verifyData.oracle.wallet_address}`)
  console.log(`   Approved: ${verifyData.oracle.approved}`)
  console.log(`   Token: ${verifyData.token.slice(0, 20)}...`)
  console.log('')
  
  // Step 4: Use token to access protected endpoint
  console.log('4. Testing authenticated endpoint (/api/oracles/me)...')
  const meRes = await fetch(`${BASE_URL}/api/oracles/me`, {
    headers: { 'Authorization': verifyData.token }
  })
  
  if (!meRes.ok) {
    console.error('   FAILED:', await meRes.text())
    process.exit(1)
  }
  
  const meData = await meRes.json() as any
  console.log(`   SUCCESS! Authenticated as: ${meData.name}`)
  console.log('')
  
  // Step 5: Check registration status
  console.log('5. Checking registration status...')
  const checkRes = await fetch(`${BASE_URL}/api/auth/siwe/check?address=${account.address}`)
  const checkData = await checkRes.json() as any
  console.log(`   Registered: ${checkData.registered}`)
  if (checkData.oracle) {
    console.log(`   Oracle: ${checkData.oracle.name} (ID: ${checkData.oracle.id})`)
  }
  console.log('')
  
  console.log('=== All tests passed! ===')
}

testSIWE().catch(console.error)
